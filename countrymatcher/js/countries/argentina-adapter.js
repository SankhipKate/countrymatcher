import { CalculationContextError } from '../engine/calculate-country.js?v=7.1.2';
import { convertMoney } from '../engine/currency.js?v=7.1.2';
import { ROUTE_STATUSES, STATUS_LABELS_RU } from '../engine/status-contract.js?v=7.1.2';
import { evaluateRouteRequirements } from '../engine/evaluate-route-requirements.js?v=7.1.2';

const PUBLIC_STATUSES = Object.freeze({
  SUITABLE: ROUTE_STATUSES.SUITABLE,
  SUITABLE_WITH_CONDITIONS: ROUTE_STATUSES.SUITABLE_WITH_CONDITIONS,
  UNSUITABLE: ROUTE_STATUSES.UNSUITABLE,
});

const REMOTE_INCOME_TYPES = new Set([
  'REMOTE_EMPLOYMENT',
  'CONTRACTOR',
  'FREELANCE_OR_SELF_EMPLOYED',
  'SOLE_PROPRIETOR',
  'COMPANY_OWNER',
]);

const outcome = (status, code, message, options = {}) => ({
  status,
  code,
  message,
  condition: options.condition ?? null,
  action: options.action ?? null,
});

const strictest = (checks) => checks.some(({ status }) => status === PUBLIC_STATUSES.UNSUITABLE)
  ? PUBLIC_STATUSES.UNSUITABLE
  : checks.some(({ status }) => status === PUBLIC_STATUSES.SUITABLE_WITH_CONDITIONS)
    ? PUBLIC_STATUSES.SUITABLE_WITH_CONDITIONS
    : PUBLIC_STATUSES.SUITABLE;

const fit = (checks) => checks.some(({ status }) => status === PUBLIC_STATUSES.UNSUITABLE)
  ? 'DOES_NOT_MEET'
  : checks.some(({ status }) => status === PUBLIC_STATUSES.SUITABLE_WITH_CONDITIONS)
    ? 'UNKNOWN'
    : 'MEETS';

function convertedMoney(money, context, field) {
  return convertMoney(money, 'USD', context, field);
}

function sourceWithUsd(source, context, field) {
  const conversion = convertedMoney(source?.monthly_provable ?? null, context, `${field}.monthly_provable`);
  const totalConversion = convertedMoney(source?.monthly_total ?? source?.monthly_provable ?? null, context, `${field}.monthly_total`);
  return {
    ...source,
    provableUsd: conversion?.convertedAmount ?? null,
    totalUsd: totalConversion?.convertedAmount ?? null,
    conversion,
  };
}

function normalizeProfile(profile = {}, context) {
  const family = profile.family || {};
  const primary = sourceWithUsd(profile.income?.primary || {}, context, 'income.primary');
  const additional = (profile.income?.additional_sources || []).map((source, index) => sourceWithUsd(source, context, `income.additional_sources[${index}]`));
  const partner = (profile.income?.partner?.sources || []).map((source, index) => sourceWithUsd(source, context, `income.partner.sources[${index}]`));
  const applicantSources = [primary, ...additional];
  const allSources = [...applicantSources, ...partner];
  const budget = profile.preferences?.monthly_budget;
  const budgetConversion = convertedMoney(budget, context, 'preferences.monthly_budget');
  const totalMonthlyIncomeUsd = allSources.reduce((sum, source) => sum + Number(source.totalUsd || 0), 0) || null;
  return {
    citizenships: [...profile.citizenships],
    applicationNationality: 'RU',
    currentCountry: profile.residence?.current_country ?? null,
    currentStatus: profile.residence?.current_status ?? null,
    applicationMethods: profile.application_preferences?.methods ?? [],
    primaryIncome: primary,
    applicantSources,
    partnerSources: partner,
    monthlyIncomeUsd: primary.provableUsd,
    totalMonthlyIncomeUsd,
    incomeMoney: primary.monthly_provable ?? null,
    incomeConversion: primary.conversion,
    adults: family.adults_count ?? 1,
    children: Array.isArray(family.children) ? family.children.map((child) => ({ ...child })) : [],
    partnerIncluded: Boolean(family.partner_included),
    relationshipType: family.relationship_type ?? null,
    schoolNeeded: Boolean(family.school_needed),
    lgbt: profile.lgbt ?? null,
    goal: profile.goal?.long_term ?? null,
    keepRuCitizenship: profile.goal?.keep_russian_citizenship ?? null,
    monthlyBudgetUsd: budgetConversion?.convertedAmount ?? totalMonthlyIncomeUsd,
    budgetMoney: budget ?? null,
    budgetConversion,
    budgetDerivedFromIncome: budget == null && totalMonthlyIncomeUsd != null,
    citySize: profile.preferences?.city_size ?? 'ANY',
    petTypes: profile.pets?.types ?? ['NONE'],
    routeSpecificAnswers: profile.route_specific_answers || {},
  };
}

function validateContext(profile, countryPackage, context) {
  const arsRate = Number(context?.fx?.rates?.ARS);
  const asOf = Date.parse(context?.fx?.as_of);
  const calculationDate = Date.parse(context?.calculation_date);
  const maxAge = Number(context?.fx?.max_age_hours);
  const stale = context?.fx?.is_saved_fallback ? false : Number.isFinite(asOf) && Number.isFinite(calculationDate) && Number.isFinite(maxAge)
    ? calculationDate - asOf > maxAge * 3600000
    : true;
  if (!(arsRate > 0) || stale) {
    throw new CalculationContextError('Для расчёта Аргентины необходим актуальный положительный курс ARS к USD.', { currency: 'ARS' });
  }
}

function buildIndexes(data) {
  return {
    data,
    sources: new Map((data.sources || []).map((source) => [source.source_id, source])),
  };
}

const PUBLIC_ROUTE_IDS = new Set([
  'AR_NOMAD',
  'AR_RENTISTA',
  'AR_PENSIONADO',
  'AR_WORKER',
  'AR_SPECIALIST_TRANSFER',
  'AR_STUDENT',
]);

function listRoutes(data) {
  return (data.routes || []).filter((route) =>
    PUBLIC_ROUTE_IDS.has(route.route_id)
    && route.publishable === true
    && route.available_to_russian_citizen === true
  );
}

function familyEvaluation(route, profile) {
  const checks = [];
  if (route.route_id === 'AR_NOMAD' && (profile.partnerIncluded || profile.children.length > 0)) {
    checks.push(outcome(PUBLIC_STATUSES.SUITABLE_WITH_CONDITIONS, 'nomad_separate_family_routes_required', 'Семья не включается в разрешение цифрового кочевника автоматически.', {
      condition: profile.children.length > 0
        ? 'Подтвердить отдельный допустимый маршрут ребёнка и второго взрослого либо выбрать семейно-совместимый маршрут.'
        : 'Если второй взрослый отвечает требованиям цифрового кочевника, подать два отдельных заявления; иначе подтвердить для него другой законный маршрут.',
    }));
    return checks;
  }
  if (profile.partnerIncluded && profile.relationshipType === 'UNREGISTERED_PARTNER') {
    checks.push(outcome(PUBLIC_STATUSES.SUITABLE_WITH_CONDITIONS, 'partnership_registration_required', 'Для семейной резиденции фактическое партнёрство должно быть официально зарегистрировано.', {
      condition: 'Зарегистрировать фактическое партнёрство и подготовить подтверждающие документы.',
      action: 'Официально зарегистрировать партнёрство; иностранный документ при необходимости зарегистрировать в Аргентине.',
    }));
  }
  if (checks.length === 0) checks.push(outcome(PUBLIC_STATUSES.SUITABLE, 'family_configuration_supported', 'Состав семьи не создаёт известного препятствия для этого маршрута.'));
  return checks;
}

function goalEvaluation(route, profile) {
  if (route.route_id !== 'AR_NOMAD') return [outcome(PUBLIC_STATUSES.SUITABLE, 'long_term_path_available', 'Маршрут относится к временной резиденции с подтверждённым дальнейшим путём при соблюдении требований проживания.')];
  if (['PR_REQUIRED', 'CITIZENSHIP_REQUIRED'].includes(profile.goal)) {
    return [outcome(PUBLIC_STATUSES.UNSUITABLE, 'direct_long_term_path_unavailable', 'Не соответствует выбранной долгосрочной цели: это краткосрочный статус без прямого пути к ПМЖ или гражданству.')];
  }
  if (profile.goal === 'CITIZENSHIP_DESIRED') {
    return [outcome(PUBLIC_STATUSES.SUITABLE_WITH_CONDITIONS, 'long_term_transition_required', 'Это краткосрочный статус. Сам по себе он не является основанием для долгосрочного проживания или гражданства.', {
      condition: 'Учитывать, что для долгосрочной цели потребуется отдельное основание временной резиденции.',
    })];
  }
  return [outcome(PUBLIC_STATUSES.SUITABLE, 'temporary_goal_supported', 'Краткосрочный маршрут соответствует цели временного проживания.')];
}

function structuredRequirementEvaluation(route, profile, context) {
  const evaluation = evaluateRouteRequirements(route, profile, context, { countryId: 'AR' });
  const financial = evaluation.financial[0] || null;
  const primary = financial?.primary || null;
  const financialCheck = financial?.check || null;
  return {
    checks: evaluation.checks,
    thresholdUsd: primary?.thresholdUsd ?? null,
    thresholdConversion: primary?.thresholdConversion ?? null,
    amountUsd: primary?.amountUsd ?? null,
    incomeOriginal: primary?.sources?.length === 1 ? primary.sources[0].monthly_provable : null,
    incomeConversion: primary?.sources?.length === 1 ? primary.sources[0].conversion : null,
    incomeTypeFit: financial ? primary?.sources?.length ? 'MEETS' : 'DOES_NOT_MEET' : 'NOT_APPLICABLE',
    incomeFit: financialCheck
      ? financialCheck.status === ROUTE_STATUSES.SUITABLE ? 'MEETS'
        : financialCheck.status === ROUTE_STATUSES.UNSUITABLE ? 'DOES_NOT_MEET' : 'UNKNOWN'
      : 'NOT_APPLICABLE',
    basisMissing: route.requirements.some(({ evaluation_mode }) => evaluation_mode === 'UNASKED_CONDITION'),
    incomeGuidance: route.income_rule_ru || null,
  };
}

function evaluateRoute(route, indexes, profile, context) {
  const income = structuredRequirementEvaluation(route, profile, context);
  const family = familyEvaluation(route, profile);
  const goal = goalEvaluation(route, profile);
  const application = [outcome(PUBLIC_STATUSES.SUITABLE, 'application_path_researched', 'Для маршрута подтверждён порядок подачи внутри Аргентины и/или из-за рубежа.')];
  const checks = [...application, ...income.checks, ...family, ...goal];
  const routeStatus = strictest(checks);
  const blockers = [...new Set(checks.filter((check) => check.status === PUBLIC_STATUSES.UNSUITABLE).map((check) => check.message))];
  const conditions = [...new Set(checks.filter((check) => check.status === PUBLIC_STATUSES.SUITABLE_WITH_CONDITIONS).map((check) => check.condition || check.message))];
  const actions = [...new Set(checks.map((check) => check.action).filter(Boolean))];
  const primarySourceId = route.source_ids?.[0] ?? null;
  const applicationGuidance = [route.application_inside_ru && `Внутри Аргентины: ${route.application_inside_ru}`, route.application_abroad_ru && `Из-за рубежа: ${route.application_abroad_ru}`].filter(Boolean).join(' ');
  return {
    routeId: route.route_id,
    routeName: route.name_ru,
    routeStatus,
    statusLabel: STATUS_LABELS_RU[routeStatus],
    applicationNationality: 'RU',
    viaSecondaryNationality: false,
    thresholdUsd: income.thresholdUsd,
    thresholdEur: null,
    incomeUsd: income.amountUsd,
    incomeEur: null,
    incomeOriginal: income.incomeOriginal ?? profile.incomeMoney,
    incomeConversion: income.incomeConversion ?? profile.incomeConversion,
    incomeRequirementConversion: income.thresholdConversion,
    basisMissing: Boolean(income.basisMissing),
    goalFit: fit(goal),
    applicationFit: fit(application),
    familyFit: fit(family),
    incomeTypeFit: income.incomeTypeFit,
    incomeFit: income.incomeFit,
    countryMissingCount: 0,
    clientMissingCount: conditions.length,
    conditionsCount: conditions.length,
    scenarioAffinity: route.route_id === 'AR_NOMAD' && REMOTE_INCOME_TYPES.has(profile.primaryIncome.type)
      || route.route_id === 'AR_RENTISTA' && profile.primaryIncome.type === 'PASSIVE_INCOME'
      || route.route_id === 'AR_PENSIONADO' && profile.primaryIncome.type === 'PENSION'
      ? 1 : 0,
    checks,
    conditions,
    blockers,
    missing: [],
    countryMissing: [],
    preliminary: [],
    clientMissing: conditions,
    review: [],
    actions,
    initialPermitRequirements: [],
    incomeGuidance: income.incomeGuidance || route.income_rule_ru || null,
    applicationGuidance,
    followUpQuestions: [],
    primarySourceId,
    primarySource: indexes.sources.get(primarySourceId) || null,
    longTerm: {
      pr_path_ru: route.pr_path_ru,
      citizenship_path_ru: route.citizenship_path_ru,
      presence_rule_ru: route.presence_rule_ru,
      dual_citizenship_ru: route.dual_citizenship_ru,
    },
    work: null,
    family: { rule_ru: route.family_rule_ru, partner_work_rights_ru: route.partner_work_rights_ru },
  };
}

function familyCost(city, profile) {
  const adults = Number(profile.adults || 1);
  const children = profile.children?.length || 0;
  const single = Number(city.budget_single_usd);
  const couple = Number(city.budget_couple_usd);
  const familyOneChild = Number(city.budget_family_1_child_usd);
  const additionalAdult = Math.max(0, couple - single);
  const additionalChild = Math.max(0, familyOneChild - couple);
  return Math.round(single + Math.max(0, adults - 1) * additionalAdult + children * additionalChild);
}

function sizeCode(value) {
  return value === 'крупный' ? 'LARGE' : value === 'средний' ? 'MEDIUM' : value === 'небольшой' ? 'SMALL' : 'ANY';
}

function evaluatePractical(data, profile) {
  const cities = (data.cities || []).map((city) => {
    const costUsd = familyCost(city, profile);
    const budgetDifference = profile.monthlyBudgetUsd == null ? null : profile.monthlyBudgetUsd - costUsd;
    const budgetFit = budgetDifference == null ? 'NOT_APPLICABLE' : budgetDifference >= 0 ? 'MEETS' : 'DOES_NOT_MEET';
    return {
      cityId: city.city_id,
      cityName: city.name_ru,
      populationCategory: sizeCode(city.size),
      roles: city.roles_ru || [],
      costUsd,
      costIsFamilySpecific: true,
      budgetDifference,
      budgetFit,
      practicalEvaluation: 'MEETS',
      missing: [],
      failures: [],
      climate: city.climate_category_ru,
      coldRange: city.cold_period_temperature_range_c,
      hotRange: city.hot_period_temperature_range_c,
      lgbtSafety: city.lgbt_safety_ru,
      publicSchoolAvailable: city.public_school_available,
      publicSchoolLanguage: city.public_school_language,
      internationalSchoolStatus: city.international_school_status_ru,
      internationalSchoolCost: city.international_school_cost_ru,
      sourceIds: city.source_ids || [],
    };
  });
  cities.sort((a, b) => a.costUsd - b.costUsd);
  for (const city of cities) {
    city.roles = (city.roles || [])
      .map((role) => String(role).replace(/\s+из выбранных городов/gi, '').trim())
      .filter((role) => !/самый недорог/i.test(role));
  }
  if (cities[0]) cities[0].roles = ['Самый недорогой', ...cities[0].roles];
  const petSelected = profile.petTypes?.some((type) => !['NONE', 'OTHER'].includes(type));
  return {
    cities,
    recommendedCity: cities[0] || null,
    usedCitySizeFallback: false,
    requestedCitySize: profile.citySize,
    petSummary: petSelected ? data.pets?.breed_rule_ru || null : null,
    schoolSummary: profile.schoolNeeded ? data.schools?.international_school_ru || null : data.schools?.public_school_ru || null,
    entryForRussianCitizen: data.entry_for_russian_citizen || null,
  };
}

function evaluateLgbt(data, profile) {
  if (!profile.lgbt?.enabled || !data.lgbt) return null;
  const rule = data.lgbt;
  return {
    enabled: true,
    legalPosition: 'Полное признание',
    practicalEnvironment: 'Открытая',
    practicalExplanation: 'Однополый брак и семейные права признаны на национальном уровне; открытая жизнь парой юридически защищена.',
    rules: [{ id: 'AR_LGBT', legalStatus: 'YES' }],
    rows: [
      ['Брак и переезд с супругом', rule.same_sex_marriage_rule_ru],
      ['Зарегистрированные отношения', rule.registered_partnership_rule_ru],
      ['Иностранные документы', rule.foreign_document_rule_ru],
      ['Международная защита', rule.international_protection_ru],
    ],
    safety: {
      level: rule.country_safety_category_ru,
      tone: 'safe',
      text: rule.safety_explanation_ru,
    },
    pendingChanges: Array.isArray(rule.pending_changes) ? rule.pending_changes : [],
  };
}

function determineCountryGroup(bestRoute, practical, profile, routes = []) {
  if (!bestRoute || routes.every((route) => route.routeStatus === PUBLIC_STATUSES.UNSUITABLE)) return 'UNSUITABLE';
  return bestRoute.routeStatus;
}

function collectSources(data, indexes, bestRoute, practical) {
  const ids = new Set([
    ...(bestRoute?.primarySourceId ? [bestRoute.primarySourceId] : []),
    ...(practical?.recommendedCity?.sourceIds || []),
    ...(data.entry_for_russian_citizen?.source_ids || []),
  ]);
  return [...ids].map((id) => indexes.sources.get(id)).filter(Boolean);
}

function collectPracticalMissing(data, profile) {
  return profile.petTypes?.includes('OTHER') ? ['Правила ввоза другого вида животного проверяются отдельно.'] : [];
}

export const argentinaAdapter = Object.freeze({
  id: 'argentina',
  normalizeProfile,
  validateContext,
  buildIndexes,
  listRoutes,
  evaluateRoute,
  evaluatePractical,
  evaluateLgbt,
  determineCountryGroup,
  collectSources,
  collectPracticalMissing,
});
