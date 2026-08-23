import { ROUTE_STATUSES } from './status-contract.js';
import { ROUTE_PRESENTATION_GROUPS, ROUTE_PRESENTATION_RANK } from './route-presentation-contract.js';

export const ACTIVE_RESEARCH_SCHEMA_VERSION = '4.0';
export const ACTIVE_CANON_REVISION = '2026-08-08-final-lock';

export class ActiveResearchContractError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ActiveResearchContractError';
    this.code = 'ACTIVE_RESEARCH_CONTRACT_MISMATCH';
  }
}

export class Rp4EvaluationUnsupportedError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = 'Rp4EvaluationUnsupportedError';
    this.code = 'RP4_EVALUATION_UNSUPPORTED';
    this.details = details;
  }
}

export class MissingFxRateError extends Error {
  constructor(currencies) {
    const missing = [...new Set((currencies || []).filter(Boolean))];
    super(`Missing FX rate for ${missing.join('/')}.`);
    this.name = 'MissingFxRateError';
    this.code = 'FX_RATE_MISSING';
    this.details = { currencies: missing };
  }
}

export const ACTIVE_ENGINE_FINANCIAL_CAPABILITIES = Object.freeze({
  models: Object.freeze([
    'INCOME_ONLY',
    'SAVINGS_ONLY',
    'INCOME_OR_SAVINGS',
    'INCOME_AND_SAVINGS',
    'INCOME_WITH_SAVINGS_SHORTFALL',
    'INVESTMENT_CAPITAL',
    'SPONSOR_OR_SCHOLARSHIP',
  ]),
  alternativeKinds: Object.freeze(['INCOME', 'SAVINGS', 'CAPITAL']),
  comparisons: Object.freeze(['AT_LEAST', 'MORE_THAN', 'EXACT', 'NO_FIXED_THRESHOLD']),
  alternativeApplicabilityModels: Object.freeze([
    'INCOME_ONLY',
    'SAVINGS_ONLY',
    'INCOME_OR_SAVINGS',
    'INVESTMENT_CAPITAL',
    'SPONSOR_OR_SCHOLARSHIP',
  ]),
});

function assertActiveEngineFinancialCapabilities(route, requirement) {
  const financial = requirement.financial || {};
  const unsupported = [];
  if (!ACTIVE_ENGINE_FINANCIAL_CAPABILITIES.models.includes(financial.model)) {
    unsupported.push({ semantic: 'financial.model', value: financial.model });
  }
  if (
    (financial.alternatives || []).some((alternative) => alternative.applies_if)
    && !ACTIVE_ENGINE_FINANCIAL_CAPABILITIES.alternativeApplicabilityModels.includes(financial.model)
  ) {
    unsupported.push({
      semantic: 'financial.alternativeApplicabilityModel',
      value: financial.model,
    });
  }
  (financial.alternatives || []).forEach((alternative, index) => {
    if (!ACTIVE_ENGINE_FINANCIAL_CAPABILITIES.alternativeKinds.includes(alternative.kind)) {
      unsupported.push({ semantic: 'alternative.kind', value: alternative.kind, alternativeIndex: index });
    }
    if (!ACTIVE_ENGINE_FINANCIAL_CAPABILITIES.comparisons.includes(alternative.comparison)) {
      unsupported.push({ semantic: 'alternative.comparison', value: alternative.comparison, alternativeIndex: index });
    }
  });
  if (unsupported.length) throw new Rp4EvaluationUnsupportedError(
    `Unsupported evaluation semantics for ${requirement.requirement_id}.`,
    { routeId: route.route_id, requirementId: requirement.requirement_id, unsupported },
  );
}

export function assertActiveResearchPackage(pkg) {
  if (pkg?.schema_version !== ACTIVE_RESEARCH_SCHEMA_VERSION) {
    throw new ActiveResearchContractError(`Active Research Package must use schema_version ${ACTIVE_RESEARCH_SCHEMA_VERSION}.`);
  }
  if (pkg?.canon_revision !== ACTIVE_CANON_REVISION) {
    throw new ActiveResearchContractError(`Active Research Package must use canon_revision ${ACTIVE_CANON_REVISION}.`);
  }
}

const getPath = (value, path) => String(path || '').split('.').filter(Boolean)
  .reduce((current, key) => current?.[key], value);

const PROFILE_PATHS = Object.freeze({
  CURRENT_COUNTRY: 'residence.current_country',
  CURRENT_STATUS: 'residence.current_status',
  ADULT_AGE: 'family.adult_ages.0',
  FAMILY_RELATIONSHIP: 'family.relationship_type',
  CHILDREN: 'family.children',
  INCOME_APPLICANT: 'income.primary.monthly_provable.amount',
  INCOME_PARTNER: 'income.partner.sources',
  LONG_TERM_GOAL: 'goal.long_term',
  KEEP_RUSSIAN_CITIZENSHIP: 'goal.keep_russian_citizenship',
});

const GOAL_FITS = Object.freeze({
  MEETS: 'MEETS',
  UNKNOWN: 'UNKNOWN',
  DOES_NOT_MEET: 'DOES_NOT_MEET',
  NOT_APPLICABLE: 'NOT_APPLICABLE',
});

export const APPLICABILITY_STATES = Object.freeze({
  TRUE: 'TRUE',
  FALSE: 'FALSE',
  UNKNOWN: 'UNKNOWN',
});

function routeSpecificQuestionMap(route) {
  const questions = route?.route_specific_questions || [];
  const map = new Map();

  for (const question of questions) {
    if (map.has(question.question_id)) {
      throw new Rp4EvaluationUnsupportedError(
        `Duplicate route-specific question ${question.question_id}.`,
        { routeId: route?.route_id, questionId: question.question_id },
      );
    }
    map.set(question.question_id, question);
  }

  return map;
}

export function evaluateApplicability(appliesIf, profile, route) {
  if (!appliesIf) return APPLICABILITY_STATES.TRUE;

  if (!route?.route_id) {
    throw new Rp4EvaluationUnsupportedError(
      'Route-specific applicability requires a route context.',
      {},
    );
  }

  const questions = routeSpecificQuestionMap(route);
  const question = questions.get(appliesIf.question_id);

  if (!question) {
    throw new Rp4EvaluationUnsupportedError(
      `Unknown route-specific question ${appliesIf.question_id}.`,
      { routeId: route.route_id, questionId: appliesIf.question_id },
    );
  }

  const optionValues = new Set();
  for (const option of question.options || []) {
    if (optionValues.has(option.value)) {
      throw new Rp4EvaluationUnsupportedError(
        `Duplicate option ${option.value} for route-specific question ${question.question_id}.`,
        { routeId: route.route_id, questionId: question.question_id, value: option.value },
      );
    }
    optionValues.add(option.value);
  }

  for (const value of appliesIf.values || []) {
    if (!optionValues.has(value)) {
      throw new Rp4EvaluationUnsupportedError(
        `Applicability value ${value} is not an option of ${question.question_id}.`,
        { routeId: route.route_id, questionId: question.question_id, value },
      );
    }
  }

  const answer = profile?.route_specific_answers?.[route.route_id]?.[question.question_id];

  if (answer === undefined || answer === null || answer === '') {
    return APPLICABILITY_STATES.UNKNOWN;
  }

  if (!optionValues.has(answer)) {
    return APPLICABILITY_STATES.UNKNOWN;
  }

  if (appliesIf.operator === 'EQUALS') {
    return answer === appliesIf.values?.[0]
      ? APPLICABILITY_STATES.TRUE
      : APPLICABILITY_STATES.FALSE;
  }

  if (appliesIf.operator === 'IN') {
    return appliesIf.values?.includes(answer)
      ? APPLICABILITY_STATES.TRUE
      : APPLICABILITY_STATES.FALSE;
  }

  throw new Rp4EvaluationUnsupportedError(
    `Unsupported applicability operator ${appliesIf.operator}.`,
    { routeId: route.route_id, questionId: question.question_id },
  );
}

export function evaluateLongTermGoal(route, profile) {
  const goal = profile?.goal?.long_term;
  if (!goal) return { fit: GOAL_FITS.UNKNOWN, blocker: null };
  if (goal === 'TEMPORARY_RESIDENCE_SUFFICIENT') return { fit: GOAL_FITS.MEETS, blocker: null };

  const path = route?.long_term_path;
  if (!path) return { fit: GOAL_FITS.UNKNOWN, blocker: null };

  if (goal === 'PR_REQUIRED') {
    if (path.pr_path_status === 'DIRECT' || path.pr_path_status === 'AVAILABLE_AFTER_RESIDENCE') {
      return { fit: GOAL_FITS.MEETS, blocker: null };
    }
    if (path.pr_path_status === 'NOT_AVAILABLE') {
      return {
        fit: GOAL_FITS.DOES_NOT_MEET,
        blocker: path.pr_path_ru || 'Этот маршрут не даёт достижимого пути к ПМЖ.',
      };
    }
    return { fit: GOAL_FITS.UNKNOWN, blocker: null };
  }

  if (goal === 'CITIZENSHIP_REQUIRED') {
    if (path.citizenship_path_status === 'AVAILABLE') return { fit: GOAL_FITS.MEETS, blocker: null };
    if (path.citizenship_path_status === 'NOT_AVAILABLE') {
      return {
        fit: GOAL_FITS.DOES_NOT_MEET,
        blocker: path.citizenship_path_ru || 'Этот маршрут не даёт достижимого пути к гражданству.',
      };
    }
    return { fit: GOAL_FITS.UNKNOWN, blocker: null };
  }

  return { fit: GOAL_FITS.UNKNOWN, blocker: null };
}

export function evaluateEngineRule(rule, value) {
  const operator = rule?.operator;
  if (value === undefined || value === null) return 'UNKNOWN';
  if (operator === 'NON_EMPTY') return value !== '' && (!Array.isArray(value) || value.length > 0) ? 'PASS' : 'FAIL';
  if (operator === 'EQUALS') return Object.is(value, rule.value) ? 'PASS' : 'FAIL';
  if (operator === 'IN') return Array.isArray(rule.values) && rule.values.includes(value) ? 'PASS' : 'FAIL';
  if (operator === 'AT_LEAST') return Number.isFinite(Number(value)) && Number(value) >= Number(rule.value) ? 'PASS' : 'FAIL';
  if (operator === 'AT_MOST') return Number.isFinite(Number(value)) && Number(value) <= Number(rule.value) ? 'PASS' : 'FAIL';
  throw new TypeError(`Unsupported engine_rule operator: ${operator}`);
}

const familyMembers = (profile) => Math.max(0, Number(profile?.family?.adults_count || 1) - 1)
  + (Array.isArray(profile?.family?.children) ? profile.family.children.length : 0);

export function calculateFamilyThreshold(alternative, profile) {
  const members = familyMembers(profile);
  const formula = alternative.family_formula;
  if (formula) return Number(formula.base_applicant_amount)
    + Math.max(0, Number(profile?.family?.adults_count || 1) - 1) * Number(formula.additional_adult_amount)
    + (profile?.family?.children?.length || 0) * Number(formula.child_amount);
  const ordered = alternative.family_formula_ordered;
  if (ordered) return Number(ordered.base_applicant_amount)
    + (members > 0 ? Number(ordered.first_additional_member_amount) : 0)
    + Math.max(0, members - 1) * Number(ordered.each_further_member_amount);
  return alternative.amount == null ? null : Number(alternative.amount);
}

function convertAmount(amount, from, to, context) {
  if (from === to) return Number(amount);
  const base = context?.fx?.base_currency;
  const rate = (currency) => currency === base ? 1 : Number(context?.fx?.rates?.[currency]);
  const fromRate = rate(from);
  const toRate = rate(to);
  const missing = [];
  if (!(fromRate > 0)) missing.push(from);
  if (!(toRate > 0)) missing.push(to);
  if (missing.length) throw new MissingFxRateError(missing);
  const usage = context?.fx?.usage_currencies;
  if (usage?.add) {
    if (from && from !== base) usage.add(from);
    if (to && to !== base) usage.add(to);
  }
  return Number(amount) / fromRate * toRate;
}

export function compareFinancialAmount(comparison, amount, threshold) {
  if (amount == null || threshold == null) return 'UNKNOWN';
  if (!Number.isFinite(Number(amount)) || !Number.isFinite(Number(threshold))) return 'UNKNOWN';
  if (comparison === 'AT_LEAST') return Number(amount) >= Number(threshold) ? 'PASS' : 'FAIL';
  if (comparison === 'MORE_THAN') return Number(amount) > Number(threshold) ? 'PASS' : 'FAIL';
  if (comparison === 'EXACT') return Number(amount) === Number(threshold) ? 'PASS' : 'FAIL';
  if (comparison === 'NO_FIXED_THRESHOLD') return 'UNKNOWN';
  if (comparison === 'OFFICIAL_FORMULA') return 'UNSUPPORTED';
  return 'UNSUPPORTED';
}

const applicantSources = (profile) => [profile?.income?.primary, ...(profile?.income?.additional_sources || [])].filter(Boolean);
const partnerSources = (profile) => profile?.income?.partner?.sources || [];

function sourcesForOwners(profile, owners = []) {
  const sources = [];
  if (owners.includes('APPLICANT')) sources.push(...applicantSources(profile));
  if (owners.includes('PARTNER')) sources.push(...partnerSources(profile));
  return sources;
}

function incomeGeographyState(researchGeography, source, countryId) {
  const profileGeography = source?.source_geography;
  const recognized = ['SINGLE_COUNTRY', 'MULTIPLE_COUNTRIES', 'NO_STABLE_PAYER'].includes(profileGeography);
  if (!recognized) return 'UNKNOWN';
  if (researchGeography === 'ANY' || researchGeography === 'NOT_APPLICABLE' || researchGeography === 'MIXED_ALLOWED') return 'PASS';
  if (researchGeography === 'FOREIGN' && profileGeography === 'NO_STABLE_PAYER') return 'PASS';
  if (profileGeography !== 'SINGLE_COUNTRY' || !source.country_id) return 'UNKNOWN';
  if (researchGeography === 'FOREIGN') return source.country_id === countryId ? 'FAIL' : 'PASS';
  if (researchGeography === 'DESTINATION_COUNTRY') return source.country_id === countryId ? 'PASS' : 'FAIL';
  return 'UNKNOWN';
}

function geographyCondition(researchGeography) {
  if (researchGeography === 'FOREIGN') return 'Подтвердить, что учитываемые для финансового требования выплаты поступают из-за пределов страны назначения.';
  if (researchGeography === 'DESTINATION_COUNTRY') return 'Подтвердить, что учитываемые для финансового требования выплаты относятся к источникам в стране назначения.';
  return null;
}

const FOREIGN_NO_STABLE_PAYER_NOTICE = 'Для этого маршрута учитываются только выплаты из-за пределов страны назначения. Доход без постоянного плательщика в подборе считается подходящим по географии; при подготовке документов учитывайте только такие выплаты.';

function incomeAlternative(alternative, profile, context, countryId) {
  if (!alternative.asked_in_questionnaire) return { state: 'UNKNOWN', alternative };
  if (alternative.income_owners?.includes('SPONSOR')) return { state: 'UNKNOWN', alternative };
  const sources = sourcesForOwners(profile, alternative.income_owners || []);
  const allowed = new Set(alternative.allowed_income_types || []);
  let foreignNoStablePayerAccepted = false;
  if (alternative.comparison === 'NO_FIXED_THRESHOLD') {
    let hasConfirmedSource = false;
    let hasUnknownGeography = false;
    let hasAllowedIncomeType = false;
    for (const source of sources) {
      if (allowed.size && !allowed.has(source.type)) continue;
      hasAllowedIncomeType = true;
      const geographyState = incomeGeographyState(alternative.source_geography, source, countryId);
      if (geographyState === 'PASS') {
        hasConfirmedSource = true;
        if (source.source_geography === 'NO_STABLE_PAYER') foreignNoStablePayerAccepted = true;
      } else if (geographyState === 'UNKNOWN') hasUnknownGeography = true;
    }
    const screening = alternative.practical_screening_threshold;
    if (hasConfirmedSource && screening) {
      const threshold = calculateFamilyThreshold({ amount: screening.amount ?? null, family_formula: screening.family_formula }, profile);
      let confirmedAmount = 0;
      let unknownGeographyAmount = 0;
      let screeningForeignNoStablePayerAccepted = false;
      for (const source of sources) {
        if (allowed.size && !allowed.has(source.type)) continue;
        if (source.monthly_provable?.amount == null) continue;
        const converted = convertAmount(source.monthly_provable.amount, source.monthly_provable.currency, screening.currency, context);
        const geographyState = incomeGeographyState(alternative.source_geography, source, countryId);
        if (geographyState === 'PASS') {
          confirmedAmount += converted;
          if (source.source_geography === 'NO_STABLE_PAYER') screeningForeignNoStablePayerAccepted = true;
        } else if (geographyState === 'UNKNOWN') unknownGeographyAmount += converted;
      }
      const periodMultiplier = screening.period === 'ANNUAL' ? 12 : 1;
      confirmedAmount *= periodMultiplier;
      unknownGeographyAmount *= periodMultiplier;
      const potentialAmount = confirmedAmount + unknownGeographyAmount;
      const confirmedState = compareFinancialAmount(screening.comparison, confirmedAmount, threshold);
      const potentialState = compareFinancialAmount(screening.comparison, potentialAmount, threshold);
      const state = confirmedState === 'PASS' ? 'PASS' : potentialState === 'PASS' ? 'UNKNOWN' : 'FAIL';
      return {
        state, alternative, amount: confirmedAmount, confirmedAmount, unknownGeographyAmount, potentialAmount,
        unknownReason: state === 'UNKNOWN' ? 'GEOGRAPHY' : null, hasUnknownGeography,
        threshold: null, currency: null, practicalScreeningThreshold: threshold,
        practicalScreeningCurrency: screening.currency, practicalScreeningPeriod: screening.period,
        incomeEligibility: 'ELIGIBLE_SOURCE',
        ...(screeningForeignNoStablePayerAccepted ? { foreignNoStablePayerAccepted: true } : {}),
      };
    }
    const state = hasConfirmedSource ? 'PASS' : hasUnknownGeography ? 'UNKNOWN' : 'FAIL';
    return {
      state, alternative, amount: null, confirmedAmount: null,
      unknownGeographyAmount: null, potentialAmount: null,
      unknownReason: state === 'UNKNOWN' ? 'GEOGRAPHY' : null,
      hasUnknownGeography, threshold: null, currency: null,
      incomeEligibility: hasConfirmedSource ? 'ELIGIBLE_SOURCE'
        : hasUnknownGeography ? 'GEOGRAPHY_UNKNOWN'
          : hasAllowedIncomeType ? 'GEOGRAPHY_REJECTED' : 'NO_ELIGIBLE_SOURCE',
      ...(foreignNoStablePayerAccepted ? { foreignNoStablePayerAccepted: true } : {}),
    };
  }
  const threshold = calculateFamilyThreshold(alternative, profile);
  if (threshold == null || alternative.currency == null) return { state: 'UNKNOWN', alternative, threshold, currency: alternative.currency };
  let confirmedAmount = 0;
  let unknownGeographyAmount = 0;
  let hasAllowedIncomeType = false;
  for (const source of sources) {
    if (allowed.size && !allowed.has(source.type)) continue;
    if (source.monthly_provable?.amount == null) continue;
    hasAllowedIncomeType = true;
    const converted = convertAmount(source.monthly_provable.amount, source.monthly_provable.currency, alternative.currency, context);
    const geographyState = incomeGeographyState(alternative.source_geography, source, countryId);
    if (geographyState === 'PASS') {
      confirmedAmount += converted;
      if (source.source_geography === 'NO_STABLE_PAYER') foreignNoStablePayerAccepted = true;
    } else if (geographyState === 'UNKNOWN') unknownGeographyAmount += converted;
  }
  const periodMultiplier = alternative.period === 'ANNUAL' ? 12 : 1;
  confirmedAmount *= periodMultiplier;
  unknownGeographyAmount *= periodMultiplier;
  const potentialAmount = confirmedAmount + unknownGeographyAmount;
  const confirmedState = compareFinancialAmount(alternative.comparison, confirmedAmount, threshold);
  const potentialState = compareFinancialAmount(alternative.comparison, potentialAmount, threshold);
  const state = confirmedState === 'PASS' ? 'PASS' : potentialState === 'PASS' ? 'UNKNOWN' : potentialState;
  return {
    state, alternative, amount: confirmedAmount, confirmedAmount, unknownGeographyAmount, potentialAmount,
    unknownReason: state === 'UNKNOWN' && unknownGeographyAmount > 0 ? 'GEOGRAPHY' : null,
    hasUnknownGeography: unknownGeographyAmount > 0,
    threshold, currency: alternative.currency,
    incomeEligibility: confirmedAmount > 0 || unknownGeographyAmount > 0 ? 'ELIGIBLE_SOURCE'
      : hasAllowedIncomeType ? 'GEOGRAPHY_REJECTED' : 'NO_ELIGIBLE_SOURCE',
    ...(foreignNoStablePayerAccepted ? { foreignNoStablePayerAccepted: true } : {}),
  };
}

function assetAlternative(alternative, profile, context) {
  const field = alternative.kind === 'SAVINGS' ? profile?.income?.savings : profile?.investment_capital;
  if (alternative.comparison === 'NO_FIXED_THRESHOLD') {
    const screening = alternative.practical_screening_threshold;
    const practicalThreshold = screening
      ? calculateFamilyThreshold({ amount: screening.amount ?? null, family_formula: screening.family_formula }, profile)
      : null;
    const practical = {
      practicalScreeningThreshold: practicalThreshold,
      practicalScreeningCurrency: screening?.currency ?? null,
      practicalScreeningPeriod: screening?.period ?? null,
    };
    if (!alternative.asked_in_questionnaire || !screening || field?.amount == null || practicalThreshold == null) {
      return { state: 'UNKNOWN', alternative, threshold: null, currency: null, ...practical };
    }
    const amount = convertAmount(field.amount, field.currency, screening.currency, context);
    return {
      state: compareFinancialAmount(screening.comparison, amount, practicalThreshold),
      alternative, amount, threshold: null, currency: null, ...practical,
    };
  }
  if (!alternative.asked_in_questionnaire) return { state: 'UNKNOWN', alternative, threshold: calculateFamilyThreshold(alternative, profile), currency: alternative.currency };
  const threshold = calculateFamilyThreshold(alternative, profile);
  if (field?.amount == null || threshold == null || alternative.currency == null) return { state: 'UNKNOWN', alternative, threshold, currency: alternative.currency };
  const amount = convertAmount(field.amount, field.currency, alternative.currency, context);
  return { state: compareFinancialAmount(alternative.comparison, amount, threshold), alternative, amount, threshold, currency: alternative.currency };
}

function evaluateAlternative(alternative, profile, context, countryId) {
  if (alternative.kind === 'INCOME' || alternative.kind === 'PENSION') return incomeAlternative(alternative, profile, context, countryId);
  if (alternative.kind === 'SAVINGS' || alternative.kind === 'CAPITAL') return assetAlternative(alternative, profile, context);
  return { state: 'UNKNOWN', alternative, unsupported: true };
}

function combineOr(items) {
  if (items.some(({ state }) => state === 'PASS')) return 'PASS';
  if (items.some(({ state }) => state === 'UNKNOWN' || state === 'UNSUPPORTED')) return 'UNKNOWN';
  return 'FAIL';
}

export const combineFinancialAlternatives = combineOr;

export function evaluateFinancialRequirement(requirement, profile, context, countryId, route = null) {
  const financial = requirement.financial;
  const hasAlternativeGates = financial.alternatives.some((item) => item.applies_if);

  if (
    hasAlternativeGates
    && !ACTIVE_ENGINE_FINANCIAL_CAPABILITIES.alternativeApplicabilityModels.includes(financial.model)
  ) {
    throw new Rp4EvaluationUnsupportedError(
      `Alternative-level applies_if is unsupported for financial model ${financial.model}.`,
      { routeId: route?.route_id, requirementId: requirement.requirement_id, model: financial.model },
    );
  }

  const alternatives = financial.alternatives.map((item) => {
    const applicability = evaluateApplicability(item.applies_if, profile, route);

    if (applicability === APPLICABILITY_STATES.FALSE) {
      return { state: 'NOT_APPLICABLE', alternative: item, applicability };
    }

    if (applicability === APPLICABILITY_STATES.UNKNOWN) {
      return { state: 'UNKNOWN', alternative: item, applicability };
    }

    return {
      ...evaluateAlternative(item, profile, context, countryId),
      applicability,
    };
  });

  const activeAlternatives = alternatives.filter(({ state }) => state !== 'NOT_APPLICABLE');

  if (hasAlternativeGates && activeAlternatives.length === 0) {
    throw new Rp4EvaluationUnsupportedError(
      `All gated financial alternatives are NOT_APPLICABLE for ${requirement.requirement_id}.`,
      { routeId: route?.route_id, requirementId: requirement.requirement_id },
    );
  }

  let state;
  switch (financial.model) {
    case 'INCOME_ONLY':
    case 'SAVINGS_ONLY':
    case 'INVESTMENT_CAPITAL':
    case 'SPONSOR_OR_SCHOLARSHIP':
    case 'INCOME_OR_SAVINGS':
      state = combineOr(activeAlternatives);
      break;
    case 'INCOME_AND_SAVINGS':
      state = alternatives.some((item) => item.state === 'FAIL') ? 'FAIL'
        : alternatives.every((item) => item.state === 'PASS') ? 'PASS' : 'UNKNOWN';
      break;
    case 'INCOME_WITH_SAVINGS_SHORTFALL': {
      const income = alternatives.find(({ alternative }) => alternative.kind === 'INCOME');
      if (income?.state === 'PASS') state = 'PASS';
      else if (income?.state === 'UNSUPPORTED') state = 'UNKNOWN';
      else if (['NO_ELIGIBLE_SOURCE', 'GEOGRAPHY_REJECTED'].includes(income?.incomeEligibility)) state = 'FAIL';
      else if (income?.state === 'UNKNOWN' && (income.unknownReason !== 'GEOGRAPHY' || !(income.confirmedAmount > 0))) state = 'UNKNOWN';
      else {
        const months = Number(financial.shortfall_coverage?.coverage_months || 0);
        const maximumShortfall = Math.max(0, Number(income?.threshold || 0) - Number(income?.confirmedAmount ?? income?.amount ?? 0)) * months;
        const minimumShortfall = Math.max(0, Number(income?.threshold || 0) - Number(income?.potentialAmount ?? income?.amount ?? 0)) * months;
        const savings = profile?.income?.savings;
        if (savings?.amount == null) state = 'UNKNOWN';
        else {
          const available = convertAmount(savings.amount, savings.currency, income.alternative.currency, context);
          state = available >= maximumShortfall ? 'PASS'
            : available < minimumShortfall ? 'FAIL'
              : minimumShortfall < maximumShortfall ? 'UNKNOWN' : 'FAIL';
        }
        if (income) {
          income.shortfall = maximumShortfall;
          income.minimumShortfall = minimumShortfall;
          income.maximumShortfall = maximumShortfall;
        }
      }
      break;
    }
    default: throw new TypeError(`Unsupported financial model: ${financial.model}`);
  }
  const geographyAlternative = activeAlternatives.find((item) => item.hasUnknownGeography && state === 'UNKNOWN');
  return {
    state, model: financial.model, alternatives,
    condition: geographyAlternative ? geographyCondition(geographyAlternative.alternative.source_geography) : null,
    unsupported: alternatives.some((item) => item.state === 'UNSUPPORTED' || item.unsupported),
  };
}

function practicalScreeningPeriodRu(period) {
  return {
    MONTHLY: 'в месяц',
    ANNUAL: 'в год',
    ONE_TIME: 'единовременно',
    ACADEMIC_YEAR: 'за учебный год',
  }[period] || '';
}

function financialBlockerReason(evaluation, profile) {
  const income = evaluation?.alternatives?.find(({ alternative }) => alternative.kind === 'INCOME');
  if (evaluation?.state !== 'FAIL') return null;
  const savings = evaluation?.alternatives?.find(({ alternative }) => alternative.kind === 'SAVINGS');
  if (savings?.state === 'FAIL' && savings.threshold != null && savings.amount != null && savings.currency) {
    const number = (value) => new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 }).format(value);
    return `Для вашего состава семьи требуется ${number(savings.threshold)} ${savings.currency} подтверждаемых средств. Ваши подтверждаемые накопления — около ${number(savings.amount)} ${savings.currency}.`;
  }

  const practicalAsset = evaluation?.alternatives?.find((item) =>
    ['SAVINGS', 'CAPITAL'].includes(item.alternative?.kind)
    && item.state === 'FAIL'
    && item.practicalScreeningThreshold != null
    && item.amount != null
    && item.practicalScreeningCurrency);

  if (practicalAsset) {
    const number = (value) => new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 }).format(value);
    const label = practicalAsset.alternative.kind === 'SAVINGS'
      ? 'Подтверждаемые накопления'
      : 'Инвестиционный капитал';
    const period = practicalScreeningPeriodRu(practicalAsset.practicalScreeningPeriod);
    const suffix = period ? ` ${period}` : '';
    return `${label} ниже практического ориентира Country Matcher: требуется не менее ${number(practicalAsset.practicalScreeningThreshold)} ${practicalAsset.practicalScreeningCurrency}${suffix}. Указано около ${number(practicalAsset.amount)} ${practicalAsset.practicalScreeningCurrency}. Это практический продуктовый порог, а не официальный минимальный порог.`;
  }

  if (income?.incomeEligibility === 'NO_ELIGIBLE_SOURCE') {
    const noIncome = profile?.income?.primary?.type === 'NO_REGULAR_INCOME';
    const shortfallModel = evaluation.model === 'INCOME_WITH_SAVINGS_SHORTFALL';
    if (noIncome) return shortfallModel
      ? 'Для этого маршрута нужен действующий доход от удалённой работы или другой допустимой удалённой профессиональной деятельности. Накопления не заменяют требуемый источник дохода.'
      : 'Для этого маршрута нужно подтвердить регулярный законный источник средств к существованию.';
    return shortfallModel
      ? 'Выбранный тип дохода не принимается для этого маршрута. Накопления не заменяют требуемый источник дохода.'
      : 'Выбранный тип дохода не соответствует требованиям этого маршрута.';
  }

  if (income?.incomeEligibility === 'GEOGRAPHY_REJECTED' && income.alternative?.comparison === 'NO_FIXED_THRESHOLD') {
    if (income.alternative.source_geography === 'FOREIGN') {
      return 'Тип дохода подходит, но его география не соответствует требованиям маршрута: учитываемый доход должен поступать из-за пределов страны назначения.';
    }
    if (income.alternative.source_geography === 'DESTINATION_COUNTRY') {
      return 'Тип дохода подходит, но его география не соответствует требованиям маршрута: учитываемый доход должен относиться к источнику в стране назначения.';
    }
  }

  if (income?.practicalScreeningThreshold != null && income.confirmedAmount != null) {
    const number = (value) => new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 }).format(value);
    const scope = income.alternative.practical_screening_threshold?.family_formula ? 'для вашего состава семьи' : 'для этого маршрута';
    const period = practicalScreeningPeriodRu(income.practicalScreeningPeriod);
    const suffix = period ? ` ${period}` : '';
    return `Подтверждаемый доход ниже практического ориентира ${scope}: около ${number(income.practicalScreeningThreshold)} ${income.practicalScreeningCurrency}${suffix}. По подтверждаемым данным — около ${number(income.confirmedAmount)} ${income.practicalScreeningCurrency}${suffix}. Это практический продуктовый порог, а не официальный минимальный порог.`;
  }

  if (income?.state === 'FAIL' && income.incomeEligibility === 'ELIGIBLE_SOURCE'
    && income.threshold != null && income.confirmedAmount != null && income.currency) {
    const number = (value) => new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 }).format(value);
    const hasFamilyFormula = Boolean(income.alternative.family_formula || income.alternative.family_formula_ordered);
    const scope = hasFamilyFormula ? 'Для вашего состава семьи требуется' : 'Для этого маршрута требуется';
    const period = practicalScreeningPeriodRu(income.alternative.period);
    const suffix = period ? ` ${period}` : '';
    const amounts = `${scope} ${number(income.threshold)} ${income.currency}${suffix}. По подтверждаемым данным — около ${number(income.confirmedAmount)} ${income.currency}${suffix}.`;
    if (evaluation.model === 'INCOME_WITH_SAVINGS_SHORTFALL' && income.shortfall != null) {
      return `${amounts} Дефицит можно покрыть подтверждаемыми накоплениями; при указанном доходе требуется около ${number(income.shortfall)} ${income.currency} накоплений за установленный период покрытия.`;
    }
    return amounts;
  }
  return null;
}

function statusEffect(requirement, state) {
  if (state === 'PASS' || requirement.unmet_effect === 'NONE') return 'NONE';
  if (state === 'UNKNOWN') return 'CONDITION';
  return requirement.unmet_effect === 'BLOCKS' ? 'BLOCKER' : 'CONDITION';
}

function practicalScreeningPresentation(alternative, profile) {
  const screening = alternative?.practical_screening_threshold;
  if (!screening) return {};
  return {
    practicalScreeningThreshold: calculateFamilyThreshold(screening, profile),
    practicalScreeningCurrency: screening.currency ?? null,
    practicalScreeningPeriod: screening.period ?? null,
  };
}

function presentUnaskedFinancialRequirement(requirement, profile) {
  return {
    state: 'UNKNOWN',
    model: requirement.financial.model,
    alternatives: requirement.financial.alternatives.map((alternative) => ({
      state: 'UNKNOWN',
      alternative,
      threshold: calculateFamilyThreshold(alternative, profile),
      currency: alternative.currency,
      ...practicalScreeningPresentation(alternative, profile),
    })),
  };
}

function presentNotApplicableFinancialRequirement(requirement, profile) {
  return {
    state: 'NOT_APPLICABLE',
    model: requirement.financial.model,
    alternatives: requirement.financial.alternatives.map((alternative) => ({
      state: 'NOT_APPLICABLE',
      alternative,
      applicability: APPLICABILITY_STATES.FALSE,
      threshold: calculateFamilyThreshold(alternative, profile),
      currency: alternative.currency,
      ...practicalScreeningPresentation(alternative, profile),
    })),
  };
}

export function evaluateRoute(route, profile, context, countryId) {
  const blockers = [];
  const conditions = [];
  const conditionActions = [];
  const displayOnlyRequirements = [];
  const requirementResults = [];
  for (const requirement of route.requirements || []) {
    if (requirement.applies_if && requirement.evaluation_mode === 'DISPLAY_ONLY') {
      throw new Rp4EvaluationUnsupportedError(
        `DISPLAY_ONLY requirement ${requirement.requirement_id} cannot use applies_if.`,
        { routeId: route.route_id, requirementId: requirement.requirement_id },
      );
    }

    if (
      requirement.type === 'FINANCIAL'
      && requirement.evaluation_mode !== 'ENGINE'
      && requirement.financial?.alternatives?.some((alternative) => alternative.applies_if)
    ) {
      throw new Rp4EvaluationUnsupportedError(
        `Alternative-level applies_if requires FINANCIAL ENGINE for ${requirement.requirement_id}.`,
        { routeId: route.route_id, requirementId: requirement.requirement_id },
      );
    }

    const applicability = evaluateApplicability(requirement.applies_if, profile, route);

    if (applicability === APPLICABILITY_STATES.FALSE) {
      const notApplicable = requirement.type === 'FINANCIAL'
        ? presentNotApplicableFinancialRequirement(requirement, profile)
        : { state: 'NOT_APPLICABLE' };

      requirementResults.push({
        requirement,
        ...notApplicable,
        applicability,
        effect: 'NONE',
      });
      continue;
    }

    if (applicability === APPLICABILITY_STATES.UNKNOWN) {
      const unresolved = requirement.type === 'FINANCIAL'
        ? presentUnaskedFinancialRequirement(requirement, profile)
        : { state: 'UNKNOWN' };

      const effect = 'CONDITION';

      if (requirement.condition_ru && !conditions.includes(requirement.condition_ru)) {
        conditions.push(requirement.condition_ru);
      }

      if (
        requirement.condition_ru
        && !conditionActions.some(
          (action) =>
            action.requirementId === requirement.requirement_id
            && action.text === requirement.condition_ru
        )
      ) {
        conditionActions.push({
          requirementId: requirement.requirement_id,
          requirementType: requirement.type,
          text: requirement.condition_ru,
        });
      }

      requirementResults.push({
        requirement,
        ...unresolved,
        applicability,
        effect,
      });
      continue;
    }

    if (requirement.evaluation_mode === 'DISPLAY_ONLY') {
      displayOnlyRequirements.push(requirement);
      const presentationOnlyFinancial = requirement.type === 'FINANCIAL' ? {
        model: requirement.financial.model,
        alternatives: requirement.financial.alternatives.map((alternative) => ({
          state: 'DISPLAY_ONLY',
          alternative,
          threshold: null,
          currency: null,
          ...practicalScreeningPresentation(alternative, profile),
        })),
      } : {};
      requirementResults.push({ requirement, ...presentationOnlyFinancial, state: 'DISPLAY_ONLY', applicability, effect: 'NONE' });
      continue;
    }
    let evaluation;
    if (requirement.evaluation_mode === 'UNASKED_CONDITION') evaluation = requirement.type === 'FINANCIAL'
      ? presentUnaskedFinancialRequirement(requirement, profile) : { state: 'UNKNOWN' };
    else if (requirement.type === 'FINANCIAL') {
      assertActiveEngineFinancialCapabilities(route, requirement);
      evaluation = evaluateFinancialRequirement(requirement, profile, context, countryId, route);
    }
    else evaluation = { state: evaluateEngineRule(requirement.engine_rule, getPath(profile, PROFILE_PATHS[requirement.profile_path] || requirement.profile_path)) };
    if (evaluation.unsupported || evaluation.state === 'UNSUPPORTED') {
      throw new Rp4EvaluationUnsupportedError(`Unsupported evaluation semantics for ${requirement.requirement_id}.`, {
        routeId: route.route_id,
        requirementId: requirement.requirement_id,
      });
    }
    const effect = statusEffect(requirement, evaluation.state);
    if (effect === 'BLOCKER') blockers.push(financialBlockerReason(evaluation, profile) || requirement.unmet_ru || requirement.condition_ru);
    if (effect === 'CONDITION') {
      for (const text of [requirement.condition_ru, evaluation.condition]) {
        if (text && !conditions.includes(text)) conditions.push(text);
        if (text && !conditionActions.some((action) => action.requirementId === requirement.requirement_id && action.text === text)) {
          conditionActions.push({
            requirementId: requirement.requirement_id,
            requirementType: requirement.type,
            text,
          });
        }
      }
    }
    requirementResults.push({ requirement, ...evaluation, applicability, effect });
  }
  const longTermGoal = evaluateLongTermGoal(route, profile);
  if (longTermGoal.blocker && !blockers.includes(longTermGoal.blocker)) blockers.push(longTermGoal.blocker);
  const routeStatus = blockers.length ? ROUTE_STATUSES.UNSUITABLE
    : conditions.length ? ROUTE_STATUSES.SUITABLE_WITH_CONDITIONS : ROUTE_STATUSES.SUITABLE;
  return {
    routeId: route.route_id,
    routeName: route.name_ru,
    routeStatus,
    blockers,
    conditions,
    conditionActions,
    conditionsCount: conditions.length,
    requirements: displayOnlyRequirements.filter((item) => item.timing !== 'AFTER_APPROVAL').map((item) => item.condition_ru),
    displayOnlyRequirements: displayOnlyRequirements.filter((item) => item.timing !== 'AFTER_APPROVAL'),
    requirementResults,
    familyFit: 'NOT_APPLICABLE',
    goalFit: longTermGoal.fit,
    applicationFit: 'NOT_APPLICABLE',
    incomeFit: 'NOT_APPLICABLE',
    incomeTypeFit: 'NOT_APPLICABLE',
  };
}

const ROUTE_LABELS_RU = Object.freeze({ ES_DNV: 'Цифровой кочевник (DNV)' });
export const FINANCIAL_KIND_LABELS_RU = Object.freeze({
  INCOME: 'Доход', SAVINGS: 'Накопления', CAPITAL: 'Инвестиционный капитал',
  SPONSOR: 'Спонсорское финансирование', SCHOLARSHIP: 'Стипендия',
});
export const APPLICATION_METHOD_LABELS_RU = Object.freeze({
  ORIGIN_COUNTRY: 'В стране гражданства',
  CURRENT_LEGAL_RESIDENCE: 'В стране законного проживания',
  IN_COUNTRY: 'Внутри страны назначения',
  THIRD_COUNTRY: 'В подтверждённой третьей стране',
  ONLINE: 'Электронная подача или электронный этап процедуры',
});
export const LGBT_LEGAL_LABELS_RU = Object.freeze({
  FULL_RECOGNITION: 'Полное признание',
  PARTIAL_RECOGNITION: 'Частичное признание',
  SIGNIFICANT_LEGAL_RESTRICTIONS: 'Существенные правовые ограничения',
  CRIMINALIZATION: 'Криминализация',
  INSUFFICIENT_RELIABLE_DATA: 'Недостаточно надёжных данных',
});
export const LGBT_PRACTICAL_LABELS_RU = Object.freeze({
  OPEN: 'Открытая', HETEROGENEOUS: 'Неоднородная', RESTRICTED: 'Ограниченная',
  STATE_PRESSURE: 'Государственное давление', INSUFFICIENT_RELIABLE_DATA: 'Недостаточно надёжных данных',
});
const roundedDisplayAmount = (amount) => amount < 1000 ? Math.round(amount)
  : amount < 100000 ? Math.round(amount / 10) * 10 : Math.round(amount / 100) * 100;

function presentPracticalGuidance(guidance, sources) {
  if (!guidance) return null;
  return {
    ...guidance,
    figures: (guidance.figures || []).map((figure) => ({
      ...figure,
      evidence: (figure.evidence || []).map((evidence) => {
        const source = sources?.get(evidence.source_id);
        return { ...evidence, sourceTitle: source?.title_ru ?? null, sourceUrl: source?.url ?? null };
      }),
    })),
  };
}

function presentEvaluatedFinancial(evaluated, context, sources = null) {
  const applicableAlternatives = (evaluated.alternatives || [])
    .filter((item) => item.state !== 'NOT_APPLICABLE');

  return {
    model: evaluated.model,
    state: evaluated.state,
    alternatives: applicableAlternatives.map((item) => ({
      requirementLabel: evaluated.requirement.condition_ru,
      kind: item.alternative.kind,
      kindLabel: FINANCIAL_KIND_LABELS_RU[item.alternative.kind],
      state: item.state,
      ...(item.foreignNoStablePayerAccepted ? { geographyNotice: FOREIGN_NO_STABLE_PAYER_NOTICE } : {}),
      amount: item.amount ?? null,
      threshold: item.threshold ?? null,
      currency: item.currency ?? null,
      period: item.alternative.period,
      practicalGuidance: presentPracticalGuidance(item.alternative?.practical_financial_guidance, sources),
      ...(item.practicalScreeningThreshold == null ? {} : {
        practicalScreeningThreshold: item.practicalScreeningThreshold,
        practicalScreeningCurrency: item.practicalScreeningCurrency,
        practicalScreeningPeriod: item.practicalScreeningPeriod,
      }),
      thresholdUsd: item.threshold == null || item.currency == null ? null
        : roundedDisplayAmount(convertAmount(item.threshold, item.currency, 'USD', context)),
      shortfall: item.shortfall ?? null,
    })),
  };
}

function presentFinancial(requirementResults, context, sources = null) {
  const evaluated = requirementResults.find(
    ({ requirement, state }) =>
      requirement.type === 'FINANCIAL'
      && state !== 'NOT_APPLICABLE'
  );
  return evaluated ? presentEvaluatedFinancial(evaluated, context, sources) : null;
}

function presentFinancialRequirements(requirementResults, context, sources = null) {
  return requirementResults
    .filter(
      ({ requirement, state }) =>
        requirement.type === 'FINANCIAL'
        && state !== 'NOT_APPLICABLE'
    )
    .map((evaluated) => ({
    requirementId: evaluated.requirement.requirement_id,
    effect: evaluated.effect,
    summary: presentEvaluatedFinancial(evaluated, context, sources),
  }));
}

function presentWorkRights(block) {
  if (!block) return null;
  return ['employment', 'self_employment', 'remote_foreign_work'].map((key) => ({
    type: key,
    status: block[key]?.status,
    rule: block[key]?.rule_ru,
  })).filter(({ rule }) => rule);
}

const FAMILY_STATES = Object.freeze({
  NOT_APPLICABLE: 'NOT_APPLICABLE', PASS: 'PASS', CONDITION: 'CONDITION',
  DATA_CONTRACT_PROBLEM: 'DATA_CONTRACT_PROBLEM',
});

function familyPathResult(scenario, member, profileFamily, routeIds) {
  const problems = [];
  if (scenario.simultaneous_move === 'NOT_RESEARCHED') problems.push('simultaneous_move is NOT_RESEARCHED');
  if (scenario.join_stage === 'NOT_RESEARCHED') problems.push('join_stage is NOT_RESEARCHED');
  if (scenario.join_stage === 'NOT_AVAILABLE') problems.push('join_stage NOT_AVAILABLE has no Final Lock family semantics');
  if (scenario.separate_route_required == null) problems.push('separate_route_required is not researched');
  if (scenario.linked_route_id && !routeIds.has(scenario.linked_route_id)) problems.push(`linked route ${scenario.linked_route_id} is missing`);
  if ((scenario.separate_route_required === true || scenario.join_stage === 'SEPARATE_ROUTE')
    && !scenario.linked_route_id && !scenario.member_long_term_path) problems.push('separate family path has no linked route or member long-term path');
  if (problems.length) return { state: FAMILY_STATES.DATA_CONTRACT_PROBLEM, scenario, problems };

  let relationshipCondition = null;
  if (member.type === 'PARTNER' || (scenario.applies_to === 'PARTNER_AND_CHILDREN' && profileFamily.partner_included === true)) {
    if (!Array.isArray(scenario.relationship_types)) return { state: FAMILY_STATES.DATA_CONTRACT_PROBLEM, scenario, problems: ['partner-applicable scenario has null relationship_types'] };
    if (!scenario.relationship_types.includes(profileFamily.relationship_type)) {
      const formalizable = scenario.relationship_types.filter((type) => type === 'MARRIED' || type === 'REGISTERED_PARTNERSHIP');
      if (!formalizable.length) return { state: FAMILY_STATES.DATA_CONTRACT_PROBLEM, scenario, problems: ['current relationship has no supported or formalizable path'] };
      relationshipCondition = formalizable.includes('MARRIED') && formalizable.includes('REGISTERED_PARTNERSHIP')
        ? 'Для этого маршрута потребуется оформить одну из признаваемых форм отношений: брак или зарегистрированное партнёрство.'
        : formalizable.includes('MARRIED')
          ? 'Для этого маршрута потребуется оформить признаваемый брак.'
          : 'Для этого маршрута потребуется оформить признаваемое зарегистрированное партнёрство.';
    }
  }
  const later = ['AFTER_INITIAL_RESIDENCE', 'AFTER_PR', 'AFTER_CITIZENSHIP'].includes(scenario.join_stage);
  const administrativeOnly = scenario.administrative_separate_filing === true;
  const administrativeSequenceOnly = administrativeOnly
    && scenario.separate_route_required === false
    && scenario.simultaneous_move !== 'NO'
    && scenario.join_stage === 'AFTER_INITIAL_RESIDENCE';
  const operationalCondition = (scenario.simultaneous_move === 'CONDITIONAL' && !administrativeOnly)
    || scenario.simultaneous_move === 'NO'
    || (later && !administrativeSequenceOnly)
    || scenario.join_stage === 'SEPARATE_ROUTE'
    || scenario.separate_route_required === true;
  if (operationalCondition && !scenario.condition_ru?.trim()) return { state: FAMILY_STATES.DATA_CONTRACT_PROBLEM, scenario, problems: ['conditional family path has no condition_ru'] };
  const conditions = [relationshipCondition, operationalCondition ? scenario.condition_ru : null].filter(Boolean);
  return {
    state: conditions.length ? FAMILY_STATES.CONDITION : FAMILY_STATES.PASS,
    scenario,
    conditions,
    classification: scenario.join_stage === 'SEPARATE_ROUTE' || scenario.separate_route_required === true ? 'SEPARATE_LINKED_ROUTE'
      : (later && !administrativeSequenceOnly) || scenario.simultaneous_move === 'NO' ? 'LATER_JOIN'
        : scenario.simultaneous_move === 'CONDITIONAL' && !administrativeOnly ? 'CONDITIONAL_SIMULTANEOUS' : 'SIMULTANEOUS',
  };
}

function scenariosForMember(scenarios, member) {
  return scenarios.filter((scenario) => {
    if (member.type === 'PARTNER') return scenario.applies_to === 'PARTNER' || scenario.applies_to === 'PARTNER_AND_CHILDREN';
    if (member.type === 'CHILD') {
      if (scenario.applies_to !== 'CHILD' && scenario.applies_to !== 'PARTNER_AND_CHILDREN') return false;
      if (scenario.child_age_min != null && member.age < scenario.child_age_min) return false;
      if (scenario.child_age_max != null && member.age > scenario.child_age_max) return false;
      return true;
    }
    return false;
  });
}

export function evaluateFamilyScenarios(route, profile, packageRoutes = []) {
  const family = profile?.family || {};
  const children = Array.isArray(family.children) ? family.children : [];
  const scenarios = route.family_scenarios || [];
  const ids = scenarios.map((scenario) => scenario.scenario_id);
  const duplicateIds = [...new Set(ids.filter((id, index) => ids.indexOf(id) !== index))];
  if (duplicateIds.length) return {
    state: FAMILY_STATES.DATA_CONTRACT_PROBLEM, classification: 'DATA_CONTRACT_PROBLEM', applicableScenarioIds: [],
    memberResults: [], conditions: [], linkedRouteIds: [], dataContractProblems: duplicateIds.map((id) => `duplicate scenario_id ${id}`),
  };
  const members = [
    ...(family.partner_included === true ? [{ id: 'PARTNER', type: 'PARTNER' }] : []),
    ...children.map((child, index) => ({ id: `CHILD_${index + 1}`, type: 'CHILD', age: child.age_years })),
  ];
  if (!members.length) return {
    state: FAMILY_STATES.NOT_APPLICABLE, classification: 'SOLO', applicableScenarioIds: [],
    memberResults: [], conditions: [], linkedRouteIds: [], dataContractProblems: [],
  };
  const routeIds = new Set(packageRoutes.map((item) => item.route_id));
  const familyPathSortRank = ({ scenario }) => {
    if (!scenario) return 3;

    const administrativeOnly = scenario.administrative_separate_filing === true;
    const administrativeSequenceOnly = administrativeOnly
      && scenario.separate_route_required === false
      && scenario.simultaneous_move !== 'NO'
      && scenario.join_stage === 'AFTER_INITIAL_RESIDENCE';
    const later = ['AFTER_INITIAL_RESIDENCE', 'AFTER_PR', 'AFTER_CITIZENSHIP'].includes(scenario.join_stage);

    if (scenario.simultaneous_move === 'NO' || (later && !administrativeSequenceOnly)) return 2;
    if (scenario.join_stage === 'SEPARATE_ROUTE' || scenario.separate_route_required === true) return 1;
    if (scenario.linked_route_id) return 1;
    return 0;
  };
  const memberResults = members.map((member) => {
    const applicable = scenariosForMember(scenarios, member);
    if (!applicable.length) return { memberId: member.id, memberType: member.type, state: FAMILY_STATES.DATA_CONTRACT_PROBLEM, applicableScenarioIds: [], problems: ['no applicable family scenario'] };
    const paths = applicable.map((scenario) => familyPathResult(scenario, member, family, routeIds));
    const preferredState = paths.some(({ state }) => state === FAMILY_STATES.PASS) ? FAMILY_STATES.PASS
      : paths.some(({ state }) => state === FAMILY_STATES.CONDITION) ? FAMILY_STATES.CONDITION : FAMILY_STATES.DATA_CONTRACT_PROBLEM;
    const preferredPaths = paths.filter(({ state }) => state === preferredState);
    const bestFamilyRank = preferredState === FAMILY_STATES.DATA_CONTRACT_PROBLEM ? 3
      : Math.min(...preferredPaths.map(familyPathSortRank));
    const selected = preferredPaths.filter((path) => familyPathSortRank(path) === bestFamilyRank);
    return {
      memberId: member.id, memberType: member.type, age: member.age ?? null, state: preferredState,
      sortRank: bestFamilyRank,
      applicableScenarioIds: selected.map(({ scenario }) => scenario.scenario_id),
      conditions: selected.flatMap(({ conditions = [] }) => conditions),
      classifications: selected.map(({ classification }) => classification).filter(Boolean),
      linkedRouteIds: selected.map(({ scenario }) => scenario.linked_route_id).filter(Boolean),
      joinStages: selected.map(({ scenario }) => scenario.join_stage),
      simultaneousMoves: selected.map(({ scenario }) => scenario.simultaneous_move),
      separationMonthsMin: selected.map(({ scenario }) => scenario.separation_months_min).filter((value) => value != null),
      separationMonthsMax: selected.map(({ scenario }) => scenario.separation_months_max).filter((value) => value != null),
      memberLongTermPaths: selected.map(({ scenario }) => scenario.member_long_term_path).filter(Boolean),
      problems: selected.flatMap(({ problems = [] }) => problems),
    };
  });
  const dataContractProblems = memberResults.flatMap(({ memberId, problems = [] }) => problems.map((problem) => `${memberId}: ${problem}`));
  const state = memberResults.some((member) => member.state === FAMILY_STATES.DATA_CONTRACT_PROBLEM) ? FAMILY_STATES.DATA_CONTRACT_PROBLEM
    : memberResults.some((member) => member.state === FAMILY_STATES.CONDITION) ? FAMILY_STATES.CONDITION : FAMILY_STATES.PASS;
  const classifications = memberResults.flatMap((member) => member.classifications || []);
  const classification = state === FAMILY_STATES.DATA_CONTRACT_PROBLEM ? 'DATA_CONTRACT_PROBLEM'
    : classifications.includes('SEPARATE_LINKED_ROUTE') ? 'SEPARATE_LINKED_ROUTE'
      : classifications.includes('LATER_JOIN') ? 'LATER_JOIN'
        : classifications.includes('CONDITIONAL_SIMULTANEOUS') ? 'CONDITIONAL_SIMULTANEOUS' : 'SIMULTANEOUS';
  const sortRank = state === FAMILY_STATES.NOT_APPLICABLE ? 0
    : state === FAMILY_STATES.DATA_CONTRACT_PROBLEM ? 3
      : Math.max(0, ...memberResults.map((member) => Number.isInteger(member.sortRank) ? member.sortRank : 3));
  return {
    state, classification, sortRank, memberResults,
    applicableScenarioIds: [...new Set(memberResults.flatMap((member) => member.applicableScenarioIds || []))],
    conditions: [...new Set(memberResults.flatMap((member) => member.conditions || []))],
    linkedRouteIds: [...new Set(memberResults.flatMap((member) => member.linkedRouteIds || []))],
    joinStages: [...new Set(memberResults.flatMap((member) => member.joinStages || []))],
    simultaneousMoves: [...new Set(memberResults.flatMap((member) => member.simultaneousMoves || []))],
    separationMonthsMin: memberResults.flatMap((member) => member.separationMonthsMin || []),
    separationMonthsMax: memberResults.flatMap((member) => member.separationMonthsMax || []),
    memberLongTermPaths: memberResults.flatMap((member) => member.memberLongTermPaths || []),
    dataContractProblems,
  };
}

export function deriveRoutePresentationGroup(route, evaluated) {
  if (route.route_type === 'INTERNATIONAL_PROTECTION' || route.is_humanitarian === true) {
    return ROUTE_PRESENTATION_GROUPS.INTERNATIONAL_PROTECTION;
  }
  if (evaluated.routeStatus === ROUTE_STATUSES.UNSUITABLE) return ROUTE_PRESENTATION_GROUPS.UNSUITABLE;
  const hasSeparateBasisCondition = evaluated.requirementResults.some(({ requirement, effect }) =>
    effect === 'CONDITION'
    && requirement.evaluation_mode === 'UNASKED_CONDITION'
    && requirement.requires_separate_basis === true);
  return hasSeparateBasisCondition ? ROUTE_PRESENTATION_GROUPS.REQUIRES_SEPARATE_BASIS : evaluated.routeStatus;
}

export function deriveRouteSpecificFollowUps(route, evaluated) {
  if (evaluated?.routeStatus === ROUTE_STATUSES.UNSUITABLE) return [];

  const questionIds = new Set();

  for (const result of evaluated?.requirementResults || []) {
    if (result.effect !== 'CONDITION') continue;

    if (
      result.applicability === APPLICABILITY_STATES.UNKNOWN
      && result.requirement?.applies_if?.question_id
    ) {
      questionIds.add(result.requirement.applies_if.question_id);
    }

    if (
      result.requirement?.type !== 'FINANCIAL'
      || result.state !== 'UNKNOWN'
    ) {
      continue;
    }

    for (const alternative of result.alternatives || []) {
      if (
        alternative.applicability === APPLICABILITY_STATES.UNKNOWN
        && alternative.alternative?.applies_if?.question_id
      ) {
        questionIds.add(alternative.alternative.applies_if.question_id);
      }
    }
  }

  if (!questionIds.size) return [];

  return (route.route_specific_questions || [])
    .filter((question) => questionIds.has(question.question_id))
    .map((question) => ({
      questionId: question.question_id,
      prompt: question.prompt_ru,
      answerType: question.answer_type,
      options: (question.options || []).map((option) => ({
        value: option.value,
        label: option.label_ru,
      })),
    }));
}

function presentRoute(route, evaluated, sources, context) {
  const source = sources.get(route.official_source_id) || null;
  const financialRequirements = presentFinancialRequirements(evaluated.requirementResults, context, sources);
  const conditionActions = (evaluated.conditionActions || []).map((action) => ({
    ...action,
    financialSummary: action.requirementType === 'FINANCIAL'
      ? financialRequirements.find(({ requirementId }) => requirementId === action.requirementId)?.summary || null
      : null,
  }));
  for (const text of evaluated.conditions) {
    if (!conditionActions.some((action) => action.text === text)) conditionActions.push({
      requirementId: null, requirementType: null, text, financialSummary: null,
    });
  }
  const presentationGroup = deriveRoutePresentationGroup(route, evaluated);
  return {
    ...evaluated,
    routeName: ROUTE_LABELS_RU[route.route_id] || route.name_ru,
    routeOfficialName: route.official_term_ru || null,
    routeType: route.route_type,
    presentationGroup,
    description: route.basis_ru,
    financialSummary: presentFinancial(evaluated.requirementResults, context, sources),
    financialRequirements,
    conditionActions,
    routeSpecificFollowUps: deriveRouteSpecificFollowUps(route, evaluated),
    application: (route.application_methods || []).filter(({ availability }) => availability === 'AVAILABLE').map((item) => ({
      method: item.method, methodLabel: APPLICATION_METHOD_LABELS_RU[item.method],
      guidance: item.condition_ru, entryGuidance: item.entry_condition_ru,
    })),
    processing: route.processing_time ? {
      officialDays: route.processing_time.official_days,
      officialRule: route.processing_time.official_rule_ru,
      practicalRange: route.processing_time.practical_range_ru,
    } : null,
    firstPermit: route.long_term_path ? {
      months: route.long_term_path.first_permit_months,
      description: route.long_term_path.initial_status_ru,
    } : null,
    family: (route.family_scenarios || []).map((item) => ({
      scenarioId: item.scenario_id,
      appliesTo: item.applies_to, simultaneousMove: item.simultaneous_move,
      joinStage: item.join_stage, description: item.condition_ru,
    })),
    workRights: {
      applicant: presentWorkRights(route.applicant_work_rights),
      partner: presentWorkRights(route.partner_work_rights),
    },
    longTerm: route.long_term_path ? {
      renewal: route.long_term_path.renewal_ru,
      permanentResidence: route.long_term_path.pr_path_ru,
      citizenship: route.long_term_path.citizenship_path_ru,
      presence: route.long_term_path.presence_rule_ru,
      language: route.long_term_path.language_requirements_ru,
    } : null,
    officialSource: source ? { title: source.title_ru, url: source.url, authority: source.authority } : null,
  };
}

const CITY_COMPARISON_COMPONENTS = ['RENT_STANDARD', 'UTILITIES', 'GROCERIES', 'TRANSPORT'];
const RECURRING_COST_PERIODS = new Set(['MONTHLY', 'ANNUAL']);

const normalizedCostScenario = (value) => String(value || '')
  .trim()
  .replace(/\s+/g, ' ')
  .replace(/[.!?;:]+$/u, '');

function presentCities(pkg, context) {
  const raw = pkg.cities || [];
  const usableByCity = raw.map((city) => new Map(city.cost_components
    .filter((item) => CITY_COMPARISON_COMPONENTS.includes(item.component) && RECURRING_COST_PERIODS.has(item.period))
    .map((item) => {
      const monthlyAmount = Number.isFinite(item.amount) ? item.amount / (item.period === 'ANNUAL' ? 12 : 1) : null;
      let amountUsd = null;
      if (monthlyAmount != null) {
        try {
          amountUsd = convertAmount(monthlyAmount, item.currency, 'USD', context);
        } catch {
          amountUsd = null;
        }
      }
      return [item.component, { item, monthlyAmount, amountUsd }];
    }).filter(([, value]) => Number.isFinite(value.monthlyAmount) && Number.isFinite(value.amountUsd))));
  const comparisonComponents = CITY_COMPARISON_COMPONENTS.filter((component) => {
    const values = usableByCity.map((items) => items.get(component));
    if (!values.length || values.some((value) => !value)) return false;
    const first = values[0].item;
    return values.every(({ item }) => item.household_basis === first.household_basis
      && normalizedCostScenario(item.condition_ru) === normalizedCostScenario(first.condition_ru));
  });
  const comparisonAvailable = comparisonComponents.includes('RENT_STANDARD');
  const comparisonScenarios = comparisonComponents.map((component) => ({
    component,
    householdBasis: usableByCity[0].get(component).item.household_basis,
    condition: usableByCity[0].get(component).item.condition_ru,
  }));
  const coolest = raw.filter((city) => city.climate?.cold_min_c != null).sort((a, b) =>
    a.climate.cold_min_c - b.climate.cold_min_c || a.climate.cold_max_c - b.climate.cold_max_c)[0]?.city_id;
  const hottest = raw.filter((city) => city.climate?.hot_max_c != null).sort((a, b) =>
    b.climate.hot_max_c - a.climate.hot_max_c || b.climate.hot_min_c - a.climate.hot_min_c)[0]?.city_id;
  const presented = raw.map((city, cityIndex) => {
    const recurring = city.cost_components.filter((item) => RECURRING_COST_PERIODS.has(item.period));
    const numeric = recurring.filter((item) => Number.isFinite(item.amount));
    const currency = numeric.length === recurring.length && numeric.length > 0
      && numeric.every((item) => item.currency === numeric[0].currency) ? numeric[0].currency : null;
    const cost = currency ? numeric.reduce((sum, item) => sum + item.amount / (item.period === 'ANNUAL' ? 12 : 1), 0) : null;
    const comparisonCostUsd = comparisonAvailable
      ? comparisonComponents.reduce((sum, component) => sum + usableByCity[cityIndex].get(component).amountUsd, 0)
      : null;
    return {
      cityId: city.city_id,
      cityName: city.name_ru,
      populationCategory: city.structural_roles.find((role) => ['LARGE', 'MEDIUM', 'SMALL'].includes(role)) || null,
      roles: city.structural_roles,
      labels: [city.city_id === coolest ? 'Самый прохладный' : null, city.city_id === hottest ? 'Самый жаркий' : null].filter(Boolean),
      costOriginal: cost == null ? null : { amount: cost, currency },
      comparisonComponents,
      comparisonScenarios,
      comparisonCostUsd,
      climate: city.climate?.category_ru || null,
      coldRange: city.climate ? [city.climate.cold_min_c, city.climate.cold_max_c] : null,
      hotRange: city.climate ? [city.climate.hot_min_c, city.climate.hot_max_c] : null,
    };
  });
  if (comparisonAvailable && presented.length > 1 && presented.every(({ comparisonCostUsd }) => Number.isFinite(comparisonCostUsd))) {
    const mostExpensive = [...presented].sort((a, b) => b.comparisonCostUsd - a.comparisonCostUsd)[0];
    const cheapest = [...presented].sort((a, b) => a.comparisonCostUsd - b.comparisonCostUsd)[0];
    mostExpensive.labels.push('Самый дорогой');
    cheapest.labels.push('Самый недорогой');
  }
  return presented;
}

function presentSchools(pkg, profile, context) {
  if (!(profile?.family?.children?.length > 0)) return null;
  const schools = pkg.schools || {};
  const researchedCities = schools.international_school_cities || [];
  const legacyCityNames = new Map((pkg.cities || []).map((city) => [city.city_id, city.name_ru]));
  const cityNames = researchedCities.length
    ? researchedCities.map((city) => city.city_name_ru)
    : (schools.international_schools || []).map((school) => legacyCityNames.get(school.city_id)).filter(Boolean);
  const tuitionObservations = schools.international_school_status === 'AVAILABLE'
    ? schools.international_school_tuition_observations || [] : [];
  const tuitionByStage = tuitionObservations.reduce((result, observation) => {
    try {
      const amountUsd = convertAmount(observation?.tuition?.amount, observation?.tuition?.currency, 'USD', context);
      if (Number.isFinite(amountUsd) && amountUsd > 0 && ['FIRST_GRADE', 'FINAL_GRADE'].includes(observation?.grade_stage)) {
        result[observation.grade_stage].push(amountUsd);
      }
    } catch {
      // An unavailable FX rate suppresses the incomplete display-only range.
    }
    return result;
  }, { FIRST_GRADE: [], FINAL_GRADE: [] });
  const minimumTuitionUsd = tuitionByStage.FIRST_GRADE.length ? Math.min(...tuitionByStage.FIRST_GRADE) : null;
  const maximumTuitionUsd = tuitionByStage.FINAL_GRADE.length ? Math.max(...tuitionByStage.FINAL_GRADE) : null;
  const tuitionRangeUsd = minimumTuitionUsd != null && maximumTuitionUsd != null
    && minimumTuitionUsd <= maximumTuitionUsd
    ? { minimum: minimumTuitionUsd, maximum: maximumTuitionUsd } : null;
  return {
    public: {
      rules: (schools.public_school_rules || []).map((rule) => ({
        jurisdiction: rule.jurisdiction_ru,
        foreignChildAccess: rule.foreign_child_access,
        language: rule.language_ru,
        compulsoryAgeMin: rule.compulsory_age_min,
        compulsoryAgeMax: rule.compulsory_age_max,
        isFree: rule.is_free,
        tuition: rule.tuition,
      })),
    },
    international: {
      status: schools.international_school_status,
      cities: [...new Set(cityNames)],
      ...(tuitionRangeUsd ? { tuitionRangeUsd } : {}),
    },
  };
}

export function resolveEntryForRussianCitizen(entry, calculationDate) {
  if (!entry) return null;
  const calculationTime = Date.parse(calculationDate);
  if (!Number.isFinite(calculationTime) || !Array.isArray(entry.scheduled_rules)) return entry;

  const applicable = entry.scheduled_rules
    .map((rule, index) => ({ rule, index, effectiveTime: Date.parse(rule.effective_at) }))
    .filter(({ effectiveTime }) => Number.isFinite(effectiveTime) && effectiveTime <= calculationTime)
    .sort((left, right) => left.effectiveTime - right.effectiveTime || left.index - right.index)
    .at(-1)?.rule;

  if (!applicable) return entry;
  const { effective_at: _effectiveAt, ...resolved } = applicable;
  return resolved;
}

function presentEntry(pkg, context) {
  const entry = resolveEntryForRussianCitizen(pkg.entry_for_russian_citizen, context?.calculation_date);
  if (!entry) return null;
  return {
    visaRequired: entry.visa_required,
    maximumStayDays: entry.maximum_stay_days,
    processingTime: entry.processing_time_ru,
    rule: entry.rule_ru,
  };
}

function presentPets(pkg, profile) {
  const petTypes = profile?.pets?.types || [];
  if (!petTypes.some((type) => type !== 'NONE')) return null;
  const pets = pkg.pets || {};
  const importRestriction = pets.import_restrictions;
  const afterEntryRestriction = pets.after_entry_restrictions;
  return {
    importText: importRestriction?.status === 'RESEARCHED_NONE_FOUND'
      ? 'Ограничений на ввоз домашних животных не выявлено.'
      : importRestriction?.status === 'RESTRICTIONS_FOUND' ? importRestriction.explanation_ru : null,
    afterEntryText: afterEntryRestriction?.status === 'RESTRICTIONS_FOUND'
      ? afterEntryRestriction.explanation_ru
      : null,
  };
}

function presentTaxes(pkg) {
  const taxes = pkg.taxes;
  if (!taxes) return null;
  return {
    checkedAt: taxes.checked_at,
    taxResidencyRule: taxes.tax_residency_rule_ru,
    personalIncomeTax: taxes.personal_income_tax_ru,
    foreignIncome: taxes.foreign_income_ru,
    doubleTaxationWithRussia: taxes.double_taxation_with_russia_ru,
  };
}

function presentLgbt(pkg, profile) {
  if (!profile?.lgbt?.enabled || !pkg.lgbt) return null;
  const value = pkg.lgbt;
  return {
    legalPosition: LGBT_LEGAL_LABELS_RU[value.legal_assessment],
    practicalEnvironment: LGBT_PRACTICAL_LABELS_RU[value.practical_assessment],
    practicalExplanation: value.assessment_basis_ru,
    loyalCities: (value.friendly_cities || []).map((city) => city.city_ru),
    rows: [
      ['Однополый брак', value.same_sex_marriage_rule_ru],
      ['Партнёрство', value.registered_partnership_rule_ru],
      ['Иностранные документы', value.foreign_document_rule_ru],
      ['Семейная иммиграция', value.family_route_available === 'YES' ? 'Семейные маршруты доступны на общих основаниях при выполнении требований конкретной процедуры.' : null],
      ['Защита от дискриминации', value.anti_discrimination?.rule_ru],
    ].filter(([, text]) => text),
  };
}

export function calculateActiveCountry(profile, pkg, context) {
  assertActiveResearchPackage(pkg);
  const fxUsage = new Set();
  const countryContext = { ...context, fx: { ...(context?.fx || {}), usage_currencies: fxUsage } };
  const sourceIndex = new Map((pkg.sources || []).map((source) => [source.source_id, source]));
  const publishableRoutes = pkg.routes.filter((route) => route.publishable === true);
  const evaluated = publishableRoutes.map((route) => {
    const calculated = evaluateRoute(route, profile, countryContext, pkg.country_id);
    const familyEvaluation = evaluateFamilyScenarios(route, profile, pkg.routes);
    if (familyEvaluation.state === FAMILY_STATES.CONDITION) {
      for (const text of familyEvaluation.conditions) if (text && !calculated.conditions.includes(text)) calculated.conditions.push(text);
      if (!calculated.blockers.length && calculated.conditions.length) calculated.routeStatus = ROUTE_STATUSES.SUITABLE_WITH_CONDITIONS;
      calculated.conditionsCount = calculated.conditions.length;
    }
    calculated.familyFit = familyEvaluation.state === FAMILY_STATES.NOT_APPLICABLE ? GOAL_FITS.NOT_APPLICABLE
      : familyEvaluation.sortRank <= 1 ? GOAL_FITS.MEETS
        : familyEvaluation.sortRank === 2 ? GOAL_FITS.DOES_NOT_MEET : GOAL_FITS.UNKNOWN;
    return { route, calculated, familyEvaluation };
  });
  const excludedRoutes = evaluated.filter(({ familyEvaluation }) => familyEvaluation.state === FAMILY_STATES.DATA_CONTRACT_PROBLEM)
    .map(({ route, familyEvaluation }) => ({ routeId: route.route_id, reason: 'FAMILY_DATA_CONTRACT_PROBLEM', problems: familyEvaluation.dataContractProblems }));
  const routes = evaluated.filter(({ familyEvaluation }) => familyEvaluation.state !== FAMILY_STATES.DATA_CONTRACT_PROBLEM)
    .map(({ route, calculated, familyEvaluation }) => ({ ...presentRoute(route, calculated, sourceIndex, countryContext), familyEvaluation }));
  const fitRank = { MEETS: 0, NOT_APPLICABLE: 0, UNKNOWN: 1, DOES_NOT_MEET: 2 };
  const comparableOfficialProcessingDifference = (a, b) => {
    const leftDays = a.processing?.officialDays;
    const rightDays = b.processing?.officialDays;
    if (!Number.isFinite(leftDays) || !Number.isFinite(rightDays)) return 0;
    const leftRule = String(a.processing?.officialRule || '').trim();
    const rightRule = String(b.processing?.officialRule || '').trim();
    if (!leftRule || leftRule !== rightRule) return 0;
    return leftDays - rightDays;
  };
  const bestRoute = [...routes].map((route, originalIndex) => ({ route, originalIndex })).sort((left, right) => {
    const a = left.route;
    const b = right.route;
    const statusDifference = (ROUTE_PRESENTATION_RANK[a.presentationGroup] ?? 99)
      - (ROUTE_PRESENTATION_RANK[b.presentationGroup] ?? 99);
    if (statusDifference) return statusDifference;
    const familyDifference = (a.familyEvaluation?.sortRank ?? fitRank[a.familyFit] ?? 1)
      - (b.familyEvaluation?.sortRank ?? fitRank[b.familyFit] ?? 1);
    if (familyDifference) return familyDifference;
    const goalDifference = (fitRank[a.goalFit] ?? 1) - (fitRank[b.goalFit] ?? 1);
    if (goalDifference) return goalDifference;
    const processingDifference = comparableOfficialProcessingDifference(a, b);
    if (processingDifference) return processingDifference;
    return left.originalIndex - right.originalIndex;
  })[0]?.route || null;
  const applicantIncome = applicantSources(profile).reduce((sum, item) => sum + convertAmount(
    item.monthly_provable?.amount || 0,
    item.monthly_provable?.currency || pkg.country_currency,
    pkg.country_currency,
    countryContext,
  ), 0);
  return {
    calculatedAt: new Date().toISOString(),
    profile: { ...profile, adults: profile.family?.adults_count || 1, children: profile.family?.children || [] },
    country: { countryId: pkg.country_id, name: pkg.country_name_ru, group: bestRoute?.routeStatus ?? null, resultCurrency: pkg.country_currency },
    evaluationState: routes.length ? 'EVALUATED' : 'NO_EVALUABLE_ROUTES',
    excludedRoutes,
    bestRoute,
    routes,
    applicantProvableIncome: {
      amount: applicantIncome,
      currency: pkg.country_currency,
      amountUsd: pkg.country_currency === 'USD' ? null : convertAmount(applicantIncome, pkg.country_currency, 'USD', countryContext),
      conversions: [],
    },
    entryForRussianCitizen: presentEntry(pkg, countryContext),
    cities: presentCities(pkg, countryContext),
    lgbt: presentLgbt(pkg, profile),
    schoolPresentation: presentSchools(pkg, profile, countryContext),
    petPresentation: presentPets(pkg, profile),
    taxPresentation: presentTaxes(pkg),
    sources: [],
    practicalMissing: [],
    fxUsedCurrencies: [...fxUsage].sort(),
  };
}

export function calculateActiveMatcher(profile, packages, context) {
  if (!Array.isArray(packages)) throw new TypeError('Active RP4 packages must be an array.');
  const results = [];
  const errors = [];
  for (const pkg of packages) {
    try {
      results.push(calculateActiveCountry(profile, pkg, context));
    } catch (error) {
      if (!(error instanceof MissingFxRateError)) throw error;
      errors.push({
        countryId: pkg.country_id,
        countryName: pkg.country_name_ru,
        code: error.code,
        currencies: error.details.currencies,
        message: `Расчёт для страны «${pkg.country_name_ru}» временно недоступен: нет курса ${error.details.currencies.join(', ')}.`,
      });
    }
  }
  return { calculatedAt: new Date().toISOString(), results, errors };
}
