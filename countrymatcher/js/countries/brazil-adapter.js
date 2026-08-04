import { CalculationContextError } from '../engine/calculate-country.js?v=7.1.0';
import { convertMoney } from '../engine/currency.js?v=7.1.0';
import { ROUTE_STATUSES, STATUS_LABELS_RU } from '../engine/status-contract.js?v=7.1.0';
import { evaluateRouteRequirements } from '../engine/evaluate-route-requirements.js?v=7.1.0';

const PUBLIC_ROUTE_IDS = new Set([
  'BR_DIGITAL_NOMAD',
  'BR_RETIREMENT',
  'BR_LOCAL_EMPLOYMENT',
  'BR_BRAZIL_GRADUATE_WORK',
  'BR_STUDY',
  'BR_FAMILY_REUNIFICATION',
  'BR_PRODUCTIVE_INVESTOR',
  'BR_REAL_ESTATE_INVESTOR',
]);

const FOREIGN_ACTIVE_INCOME_TYPES = new Set([
  'REMOTE_EMPLOYMENT',
  'CONTRACTOR',
  'FREELANCE_OR_SELF_EMPLOYED',
  'SOLE_PROPRIETOR',
  'COMPANY_OWNER',
  'OTHER_REGULAR_REMOTE_INCOME',
]);

const outcome = (status, code, message, options = {}) => ({
  status,
  code,
  message,
  condition: options.condition ?? null,
  action: options.action ?? null,
});

const strictest = (checks) => checks.some(({ status }) => status === ROUTE_STATUSES.UNSUITABLE)
  ? ROUTE_STATUSES.UNSUITABLE
  : checks.some(({ status }) => status === ROUTE_STATUSES.SUITABLE_WITH_CONDITIONS)
    ? ROUTE_STATUSES.SUITABLE_WITH_CONDITIONS
    : ROUTE_STATUSES.SUITABLE;

const fit = (checks) => checks.some(({ status }) => status === ROUTE_STATUSES.UNSUITABLE)
  ? 'DOES_NOT_MEET'
  : checks.some(({ status }) => status === ROUTE_STATUSES.SUITABLE_WITH_CONDITIONS)
    ? 'UNKNOWN'
    : 'MEETS';

function moneyTo(source, targetCurrency, context, field) {
  const provable = convertMoney(source?.monthly_provable ?? null, targetCurrency, context, `${field}.monthly_provable`);
  const total = convertMoney(
    source?.monthly_total ?? source?.monthly_provable ?? null,
    targetCurrency,
    context,
    `${field}.monthly_total`,
  );
  return {
    ...source,
    provableUsd: provable?.convertedAmount ?? null,
    totalUsd: total?.convertedAmount ?? null,
    provableConverted: provable?.convertedAmount ?? null,
    totalConverted: total?.convertedAmount ?? null,
    conversion: provable,
  };
}

function normalizeProfile(profile = {}, context) {
  const family = profile.family || {};
  const primary = moneyTo(profile.income?.primary || {}, 'USD', context, 'income.primary');
  const additional = (profile.income?.additional_sources || []).map((source, index) =>
    moneyTo(source, 'USD', context, `income.additional_sources[${index}]`));
  const partner = (profile.income?.partner?.sources || []).map((source, index) =>
    moneyTo(source, 'USD', context, `income.partner.sources[${index}]`));
  const applicantSources = [primary, ...additional];
  const allSources = [...applicantSources, ...partner];
  const budget = profile.preferences?.monthly_budget;
  const budgetConversion = convertMoney(budget, 'USD', context, 'preferences.monthly_budget');
  const totalMonthlyIncomeUsd = allSources.reduce((sum, source) => sum + Number(source.totalConverted || 0), 0) || null;

  return {
    citizenships: [...profile.citizenships],
    applicationNationality: 'RU',
    currentCountry: profile.residence?.current_country ?? null,
    currentStatus: profile.residence?.current_status ?? null,
    applicationMethods: profile.application_preferences?.methods ?? [],
    primaryIncome: primary,
    applicantSources,
    partnerSources: partner,
    allSources,
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
    monthlyBudgetUsd: budgetConversion?.convertedAmount ?? (budget?.currency === 'USD' && Number.isFinite(Number(budget?.amount)) ? Number(budget.amount) : null) ?? totalMonthlyIncomeUsd,
    budgetMoney: budget ?? null,
    budgetConversion,
    budgetDerivedFromIncome: budget == null && totalMonthlyIncomeUsd != null,
    citySize: profile.preferences?.city_size ?? 'ANY',
    petTypes: profile.pets?.types ?? ['NONE'],
  };
}

function validateContext(profile, countryPackage, context) {
  const brlRate = Number(context?.fx?.rates?.BRL);
  const asOf = Date.parse(context?.fx?.as_of);
  const calculationDate = Date.parse(context?.calculation_date);
  const maxAge = Number(context?.fx?.max_age_hours);
  const stale = context?.fx?.is_saved_fallback ? false : Number.isFinite(asOf) && Number.isFinite(calculationDate) && Number.isFinite(maxAge)
    ? calculationDate - asOf > maxAge * 3600000
    : true;
  if (!(brlRate > 0) || stale) {
    throw new CalculationContextError('Для расчёта Бразилии необходим актуальный положительный курс BRL к USD.', { currency: 'BRL' });
  }
}

function buildIndexes(data) {
  return {
    data,
    sources: new Map((data.sources || []).map((source) => [source.source_id, source])),
  };
}

function listRoutes(data) {
  return (data.routes || []).filter((route) =>
    PUBLIC_ROUTE_IDS.has(route.route_id)
    && route.publishable === true
    && route.available_to_russian_citizen === true);
}

function structuredRequirementEvaluation(route, profile, context) {
  const evaluation = evaluateRouteRequirements(route, profile, context, { countryId: 'BR' });
  const financial = evaluation.financial[0] || null;
  const primary = financial?.primary || null;
  const financialCheck = financial?.check || null;
  const evaluatesCurrentIncome = financial?.evaluated.some(({ alternative }) =>
    ['INCOME', 'PENSION'].includes(alternative.kind) && alternative.asked_in_questionnaire) || false;
  return {
    checks: evaluation.checks,
    thresholdUsd: primary?.thresholdUsd ?? null,
    thresholdConversion: primary?.thresholdConversion ?? null,
    amountUsd: primary?.amountUsd ?? null,
    incomeOriginal: primary?.sources?.length === 1 ? primary.sources[0].monthly_provable : null,
    incomeConversion: primary?.sources?.length === 1 ? primary.sources[0].conversion : null,
    incomeTypeFit: evaluatesCurrentIncome
      ? primary?.sources?.length ? 'MEETS' : 'DOES_NOT_MEET'
      : 'NOT_APPLICABLE',
    incomeFit: evaluatesCurrentIncome && financialCheck
      ? financialCheck.status === ROUTE_STATUSES.SUITABLE ? 'MEETS'
        : financialCheck.status === ROUTE_STATUSES.UNSUITABLE ? 'DOES_NOT_MEET' : 'UNKNOWN'
      : financial ? 'UNKNOWN' : 'NOT_APPLICABLE',
    basisMissing: route.requirements.some(({ evaluation_mode }) => evaluation_mode === 'UNASKED_CONDITION'),
    scenarioAffinity: route.route_id === 'BR_DIGITAL_NOMAD' && FOREIGN_ACTIVE_INCOME_TYPES.has(profile.primaryIncome.type)
      || route.route_id === 'BR_RETIREMENT' && profile.primaryIncome.type === 'PENSION'
      ? 1 : 0,
    incomeGuidance: route.income_rule_ru || null,
  };
}

function applicationEvaluation(route, profile) {
  const methods = new Set(profile.applicationMethods || []);
  const any = methods.has('ANY');
  const wantsInside = any || methods.has('IN_COUNTRY_AFTER_ENTRY');
  const wantsAbroad = any || methods.has('RUSSIA') || methods.has('CURRENT_COUNTRY');
  const insideOnly = route.route_id === 'BR_BRAZIL_GRADUATE_WORK';
  const available = insideOnly ? wantsInside : wantsInside || wantsAbroad;
  if (!available) {
    return [outcome(
      ROUTE_STATUSES.UNSUITABLE,
      'brazil_application_method_mismatch',
      'Пользователь не выбрал ни одного способа подачи, доступного для этого маршрута.',
      { action: insideOnly ? 'Рассмотреть законный въезд и подачу из Бразилии.' : 'Рассмотреть консульскую подачу или подачу после законного въезда.' },
    )];
  }
  if (insideOnly && !profile.currentCountry?.includes('BR')) {
    return [outcome(
      ROUTE_STATUSES.SUITABLE,
      'brazil_inside_application_trip_required',
      'Этот маршрут подаётся из Бразилии; необходимость законно приехать и подать заявление внутри страны является этапом оформления.',
    )];
  }
  return [outcome(ROUTE_STATUSES.SUITABLE, 'brazil_application_available', 'Выбран хотя бы один допустимый способ подачи.')];
}

function familyEvaluation(route, profile) {
  const checks = [outcome(ROUTE_STATUSES.SUITABLE, 'brazil_family_general_available', 'Семейное воссоединение предусмотрено для супруга, партнёра, детей и других установленных родственников.')];
  if (profile.partnerIncluded && profile.relationshipType === 'UNREGISTERED_PARTNERSHIP') {
    checks.push(outcome(
      ROUTE_STATUSES.SUITABLE_WITH_CONDITIONS,
      'brazil_unregistered_union_evidence',
      'Незарегистрированный партнёр может использовать união estável, но устойчивый союз нужно доказать документами.',
      {
        condition: 'Подтвердить устойчивый семейный союз.',
        action: 'Подготовить документы о совместной жизни, общих обязательствах и иных признаках união estável.',
      },
    ));
  }
  return checks;
}

function goalEvaluation(route, profile) {
  const longTermGoal = profile.goal !== 'TEMPORARY_RESIDENCE_SUFFICIENT';
  return [outcome(
    ROUTE_STATUSES.SUITABLE,
    longTermGoal ? 'brazil_long_term_information_available' : 'brazil_initial_residence_goal_supported',
    longTermGoal
      ? 'Долгосрочные требования показываются отдельно и не изменяют оценку доступности первоначального ВНЖ.'
      : 'Маршрут оценивается по требованиям первоначального ВНЖ.',
  )];
}

function evaluateRoute(route, indexes, profile, context) {
  const basis = structuredRequirementEvaluation(route, profile, context);
  const application = applicationEvaluation(route, profile);
  const family = familyEvaluation(route, profile);
  const goal = goalEvaluation(route, profile);
  const checks = [...application, ...basis.checks, ...family, ...goal];
  const routeStatus = strictest(checks);
  const blockers = [...new Set(checks.filter((check) => check.status === ROUTE_STATUSES.UNSUITABLE).map((check) => check.message))];
  const conditions = [...new Set(checks.filter((check) => check.status === ROUTE_STATUSES.SUITABLE_WITH_CONDITIONS).map((check) => check.condition || check.message))];
  const actions = [...new Set(checks.map((check) => check.action).filter(Boolean))];
  const primarySourceId = route.source_ids?.[0] ?? null;
  const applicationGuidance = [
    route.application_abroad_ru && `Из-за рубежа: ${route.application_abroad_ru}`,
    route.application_inside_ru && `После въезда: ${route.application_inside_ru}`,
  ].filter(Boolean).join(' ');

  return {
    routeId: route.route_id,
    routeName: route.name_ru,
    routeStatus,
    statusLabel: STATUS_LABELS_RU[routeStatus],
    applicationNationality: profile.applicationNationality,
    viaSecondaryNationality: profile.applicationNationality !== 'RU',
    thresholdUsd: basis.thresholdUsd ?? null,
    thresholdEur: null,
    incomeUsd: basis.amountUsd ?? null,
    incomeEur: null,
    incomeOriginal: basis.incomeOriginal ?? profile.incomeMoney,
    incomeConversion: basis.incomeConversion ?? profile.incomeConversion,
    incomeRequirementConversion: basis.thresholdConversion ?? null,
    basisMissing: Boolean(basis.basisMissing),
    goalFit: fit(goal),
    applicationFit: fit(application),
    familyFit: fit(family),
    incomeTypeFit: basis.incomeTypeFit ?? 'NOT_APPLICABLE',
    incomeFit: basis.incomeFit ?? 'NOT_APPLICABLE',
    countryMissingCount: 0,
    clientMissingCount: conditions.length,
    conditionsCount: conditions.length,
    scenarioAffinity: basis.scenarioAffinity ?? (
      route.route_id === 'BR_DIGITAL_NOMAD' && FOREIGN_ACTIVE_INCOME_TYPES.has(profile.primaryIncome.type)
      || route.route_id === 'BR_RETIREMENT' && profile.primaryIncome.type === 'PENSION'
        ? 1
        : 0
    ),
    checks,
    conditions,
    blockers,
    missing: [],
    countryMissing: [],
    preliminary: [],
    clientMissing: conditions,
    review: route.open_questions || [],
    actions,
    initialPermitRequirements: [],
    incomeGuidance: basis.incomeGuidance || route.income_rule_ru || null,
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
    work: {
      local_work_allowed: route.local_work_allowed,
      remote_foreign_work_allowed: route.remote_foreign_work_allowed,
      business_allowed: route.business_allowed,
      rule_ru: [
        route.local_work_allowed ? 'местная работа' : null,
        route.remote_foreign_work_allowed ? 'удалённая работа на иностранный источник' : null,
        route.business_allowed ? 'предпринимательство' : null,
      ].filter(Boolean).join(', ') || 'только деятельность в пределах основания маршрута',
    },
    family: {
      rule_ru: route.family_rule_ru,
      partner_work_rights_ru: route.partner_work_rights_ru,
    },
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
    practicalEnvironment: 'Неоднородная',
    practicalExplanation: 'Семейные права признаны на национальном уровне, но практическая среда заметно различается между регионами и городами.',
    loyalCities: ['Сан-Паулу', 'Флорианополис'],
    rules: [{ id: 'BR_LGBT', legalStatus: rule.same_sex_marriage_recognized ? 'YES' : 'NO' }],
    rows: [
      ['Брак и переезд с супругом', rule.same_sex_marriage_rule_ru],
      ['Зарегистрированные отношения', rule.registered_partnership_rule_ru],
      ['Иностранные документы', rule.foreign_document_rule_ru],
      ['Международная защита', rule.international_protection_ru],
    ],
    safety: {
      level: rule.country_safety_category_ru,
      tone: rule.country_safety_category_ru === 'безопасно' || rule.country_safety_category_ru === 'достаточно безопасно' ? 'safe' : 'caution',
      text: rule.safety_explanation_ru,
    },
    pendingChanges: Array.isArray(rule.pending_changes) ? rule.pending_changes : [],
  };
}

function determineCountryGroup(bestRoute, practical, profile, routes = []) {
  if (!bestRoute || routes.every((route) => route.routeStatus === ROUTE_STATUSES.UNSUITABLE)) {
    return ROUTE_STATUSES.UNSUITABLE;
  }
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
  return profile.petTypes?.includes('OTHER')
    ? ['Правила ввоза другого вида животного проверяются отдельно.']
    : [];
}

export const brazilAdapter = Object.freeze({
  id: 'brazil',
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
