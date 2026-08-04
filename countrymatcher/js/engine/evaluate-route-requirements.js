import { convertMoney } from './currency.js?v=7.1.0';
import { ROUTE_STATUSES, resolveStatusConflict } from './status-contract.js?v=7.1.0';

const check = (status, requirement, message, condition = null) => ({
  status,
  code: requirement.requirement_id.toLowerCase(),
  message,
  condition,
  action: null,
  requirementId: requirement.requirement_id,
  requirementType: requirement.type,
  role: requirement.role,
});

const isIncomeAlternative = (alternative) => ['INCOME', 'PENSION'].includes(alternative.kind);

function roundUsd(amount) {
  if (amount >= 10000) return Math.round(amount / 10) * 10;
  return Math.round(amount);
}

function addUsdEquivalent(condition, alternative, amount) {
  if (amount == null) return condition;
  const formattedUsd = roundUsd(amount).toLocaleString('ru-RU');
  const formattedOriginal = String(Number(alternative.amount)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  const officialAmount = `${formattedOriginal} ${alternative.currency}`;
  const equivalent = `${officialAmount} (ок. ${formattedUsd} USD)`;
  if (condition.includes(officialAmount)) return condition.replace(officialAmount, equivalent);
  return `${condition} ${equivalent}.`;
}

function convertedThreshold(alternative, profile, context, field) {
  if (alternative.amount == null || alternative.currency == null) return null;
  const formula = alternative.family_formula;
  const adults = Math.max(1, Number(profile.adults || 1));
  const children = Array.isArray(profile.children) ? profile.children.length : 0;
  const multiplier = formula
    ? Number(formula.main_applicant_multiplier)
      + Math.max(0, adults - 1) * Number(formula.additional_adult_multiplier)
      + children * Number(formula.child_multiplier)
    : 1;
  return convertMoney(
    { amount: Number(alternative.amount) * multiplier, currency: alternative.currency },
    'USD',
    context,
    field,
  );
}

function matchingIncome(profile, alternative, countryId) {
  const allowed = new Set(alternative.allowed_income_types || []);
  return (profile.applicantSources || []).filter((source) => {
    if (allowed.size && !allowed.has(source.type)) return false;
    if (alternative.kind === 'PENSION' && source.type !== 'PENSION') return false;
    if (alternative.source_geography === 'FOREIGN' && source.source_country === countryId) return false;
    if (alternative.source_geography === 'LOCAL' && source.source_country !== countryId) return false;
    return true;
  });
}

function evaluateFinancial(requirement, profile, context, countryId, field) {
  const alternatives = requirement.financial?.alternatives || [];
  const evaluated = alternatives.map((alternative, index) => {
    const thresholdConversion = convertedThreshold(alternative, profile, context, `${field}.alternatives[${index}].amount`);
    const thresholdUsd = thresholdConversion?.convertedAmount ?? null;
    if (!alternative.asked_in_questionnaire) {
      return { alternative, state: 'UNASKED', thresholdConversion, thresholdUsd, amountUsd: null, sources: [] };
    }
    if (isIncomeAlternative(alternative)) {
      const sources = matchingIncome(profile, alternative, countryId);
      const requiredTypes = new Set(alternative.required_income_types || []);
      const requiredBasisMet = requiredTypes.size === 0
        || sources.some((source) => requiredTypes.has(source.type));
      const amountUsd = sources.reduce((sum, source) => sum + Number(source.provableUsd || 0), 0);
      const geographyUnknown = alternative.source_geography === 'FOREIGN'
        && sources.some((source) => source.source_country == null);
      return {
        alternative,
        state: requiredBasisMet && (thresholdUsd == null
          ? sources.length > 0
          : alternative.comparison === 'GREATER_THAN' ? amountUsd > thresholdUsd : amountUsd >= thresholdUsd)
          ? geographyUnknown ? 'NEEDS_CONFIRMATION' : 'MET'
          : 'NOT_MET',
        thresholdConversion,
        thresholdUsd,
        amountUsd,
        sources,
      };
    }
    return { alternative, state: 'UNASKED', thresholdConversion, thresholdUsd, amountUsd: null, sources: [] };
  });

  const met = evaluated.find(({ state }) => state === 'MET');
  const needsConfirmation = evaluated.find(({ state }) => state === 'NEEDS_CONFIRMATION');
  const unasked = evaluated.find(({ state }) => state === 'UNASKED');
  const primary = met || needsConfirmation || evaluated.find(({ alternative }) => alternative.asked_in_questionnaire) || unasked;
  let result;
  if (met) {
    result = check(ROUTE_STATUSES.SUITABLE, requirement, requirement.met_ru || requirement.condition_ru);
  } else if (needsConfirmation) {
    result = check(
      ROUTE_STATUSES.SUITABLE_WITH_CONDITIONS,
      requirement,
      'Сумма достигает порога, но иностранное происхождение дохода нужно подтвердить.',
      'Подтвердить иностранное происхождение дохода.',
    );
  } else if (unasked) {
    const condition = evaluated
      .filter(({ state }) => state === 'UNASKED')
      .reduce((text, item) => addUsdEquivalent(text, item.alternative, item.thresholdUsd), requirement.condition_ru);
    result = check(
      ROUTE_STATUSES.SUITABLE_WITH_CONDITIONS,
      requirement,
      'Проверяемое финансовое основание не достигает порога, но маршрут допускает альтернативу, которой нет в анкете.',
      condition,
    );
  } else {
    const current = Math.round(primary?.amountUsd || 0);
    const threshold = Math.ceil(primary?.thresholdUsd || 0);
    result = check(
      ROUTE_STATUSES.UNSUITABLE,
      requirement,
      requirement.unmet_ru
        ? `${requirement.unmet_ru} Сейчас около ${current} USD при пороге около ${threshold} USD.`
        : `Сейчас около ${current} USD при обязательном пороге около ${threshold} USD.`,
    );
  }
  return { check: result, evaluated, primary };
}

export function evaluateRouteRequirements(route, profile, context, options = {}) {
  if (!Array.isArray(route.requirements) || route.requirements.length === 0) {
    throw new TypeError(`Route ${route.route_id} has no structured requirements`);
  }
  const checks = [];
  const financial = [];
  for (const [index, requirement] of route.requirements.entries()) {
    if (requirement.evaluation_mode === 'DISPLAY_ONLY') {
      checks.push(check(ROUTE_STATUSES.SUITABLE, requirement, requirement.condition_ru));
      continue;
    }
    if (requirement.evaluation_mode === 'UNASKED_CONDITION') {
      if (requirement.type === 'FINANCIAL' && requirement.financial) {
        const result = evaluateFinancial(
          requirement,
          profile,
          context,
          options.countryId,
          `routes.${route.route_id}.requirements[${index}].financial`,
        );
        checks.push(result.check);
        financial.push(result);
        continue;
      }
      checks.push(check(
        ROUTE_STATUSES.SUITABLE_WITH_CONDITIONS,
        requirement,
        'Анкета не проверяет это основание маршрута.',
        requirement.condition_ru,
      ));
      continue;
    }
    if (requirement.type !== 'FINANCIAL' || !requirement.financial) {
      const value = String(requirement.profile_path || '').split('.').filter(Boolean)
        .reduce((current, key) => current?.[key], profile);
      const met = Array.isArray(requirement.accepted_values) && requirement.accepted_values.includes(value);
      checks.push(check(
        met ? ROUTE_STATUSES.SUITABLE : ROUTE_STATUSES.UNSUITABLE,
        requirement,
        met ? requirement.met_ru || requirement.condition_ru : requirement.unmet_ru || requirement.condition_ru,
      ));
      continue;
    }
    const result = evaluateFinancial(
      requirement,
      profile,
      context,
      options.countryId,
      `routes.${route.route_id}.requirements[${index}].financial`,
    );
    checks.push(result.check);
    financial.push(result);
  }
  return {
    checks,
    status: resolveStatusConflict(checks.map(({ status }) => status)),
    financial,
  };
}
