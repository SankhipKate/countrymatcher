import { CalculationContextError } from '../engine/calculate-country.js?v=7.1.1';
import { convertMoney } from '../engine/currency.js?v=7.1.1';
import { evaluateRouteRequirements } from '../engine/evaluate-route-requirements.js?v=7.1.1';
import { ROUTE_STATUSES, STATUS_LABELS_RU } from '../engine/status-contract.js?v=7.1.1';

const PUBLIC_ROUTE_IDS = new Set([
  'MX_TEMP_ECONOMIC_SOLVENCY',
  'MX_TEMP_LOCAL_JOB_OFFER',
  'MX_INTERNATIONAL_PROTECTION',
  'MX_FAMILY_TEMP_SPONSOR',
  'MX_FAMILY_MEXICAN_OR_PERMANENT_PARTNER',
  'MX_FAMILY_DIRECT_PERMANENT',
  'MX_PERMANENT_PENSIONER',
  'MX_TEMP_STUDENT',
]);

const ECONOMIC_INCOME_TYPES = new Set([
  'REMOTE_EMPLOYMENT',
  'CONTRACTOR',
  'FREELANCE_OR_SELF_EMPLOYED',
  'SOLE_PROPRIETOR',
  'COMPANY_OWNER',
  'PASSIVE_INCOME',
  'PENSION',
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

function sourceWithUsd(source, context, field) {
  const provable = convertMoney(source?.monthly_provable ?? null, 'USD', context, `${field}.monthly_provable`);
  const total = convertMoney(
    source?.monthly_total ?? source?.monthly_provable ?? null,
    'USD',
    context,
    `${field}.monthly_total`,
  );
  return {
    ...source,
    provableUsd: provable?.convertedAmount ?? null,
    totalUsd: total?.convertedAmount ?? null,
    conversion: provable,
  };
}

function normalizeProfile(profile = {}, context) {
  const family = profile.family || {};
  const primary = sourceWithUsd(profile.income?.primary || {}, context, 'income.primary');
  const additional = (profile.income?.additional_sources || []).map((source, index) =>
    sourceWithUsd(source, context, `income.additional_sources[${index}]`));
  const partner = (profile.income?.partner?.sources || []).map((source, index) =>
    sourceWithUsd(source, context, `income.partner.sources[${index}]`));
  const applicantSources = [primary, ...additional];
  const allSources = [...applicantSources, ...partner];
  const budget = profile.preferences?.monthly_budget;
  const budgetConversion = convertMoney(budget, 'USD', context, 'preferences.monthly_budget');
  const savingsConversion = convertMoney(profile.income?.savings ?? null, 'USD', context, 'income.savings');
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
    allSources,
    totalMonthlyIncomeUsd,
    incomeMoney: primary.monthly_provable ?? null,
    incomeConversion: primary.conversion,
    savingsUsd: savingsConversion?.convertedAmount ?? null,
    savingsMoney: profile.income?.savings ?? null,
    savingsConversion,
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
  const mxnRate = Number(context?.fx?.rates?.MXN);
  const asOf = Date.parse(context?.fx?.as_of);
  const calculationDate = Date.parse(context?.calculation_date);
  const maxAge = Number(context?.fx?.max_age_hours);
  const stale = context?.fx?.is_saved_fallback ? false : Number.isFinite(asOf) && Number.isFinite(calculationDate) && Number.isFinite(maxAge)
    ? calculationDate - asOf > maxAge * 3600000
    : true;
  if (!(mxnRate > 0) || stale) {
    throw new CalculationContextError('Для расчёта Мексики необходим актуальный положительный курс MXN к USD.', { currency: 'MXN' });
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

function incomeEvaluation(route, profile, context) {
  const evaluation = evaluateRouteRequirements(route, profile, context, { countryId: 'MX' });
  const financial = evaluation.financial[0] || null;
  const primary = financial?.primary || null;
  const financialCheck = financial?.check || null;
  const onlyUnaskedBasis = route.requirements.every(({ evaluation_mode }) => evaluation_mode === 'UNASKED_CONDITION');
  return {
    checks: evaluation.checks,
    thresholdUsd: primary?.thresholdUsd ?? null,
    thresholdConversion: primary?.thresholdConversion ?? null,
    amountUsd: primary?.amountUsd ?? null,
    incomeOriginal: primary?.sources?.length === 1 ? primary.sources[0].monthly_provable : null,
    incomeConversion: primary?.sources?.length === 1 ? primary.sources[0].conversion : null,
    incomeTypeFit: financial ? primary?.sources?.length ? 'MEETS' : 'NOT_APPLICABLE' : 'NOT_APPLICABLE',
    incomeFit: financialCheck
      ? financialCheck.status === ROUTE_STATUSES.SUITABLE ? 'MEETS'
        : financialCheck.status === ROUTE_STATUSES.UNSUITABLE ? 'DOES_NOT_MEET' : 'UNKNOWN'
      : 'NOT_APPLICABLE',
    basisMissing: onlyUnaskedBasis || primary?.state === 'UNASKED',
    incomeGuidance: route.income_rule_ru,
  };
}

function applicationEvaluation(route, profile) {
  if (route.route_id === 'MX_INTERNATIONAL_PROTECTION') {
    return [outcome(
      profile.currentCountry === 'MX' ? ROUTE_STATUSES.SUITABLE : ROUTE_STATUSES.SUITABLE_WITH_CONDITIONS,
      'mexico_protection_in_country_filing',
      'Заявление о международной защите подаётся после нахождения в Мексике в COMAR или через INM.',
      profile.currentCountry === 'MX' ? {} : { condition: 'Законно въехать в Мексику и подать заявление в COMAR или через INM.' },
    )];
  }
  if (route.route_type?.startsWith('FAMILY_')) {
    return [outcome(ROUTE_STATUSES.SUITABLE, 'mexico_family_filing_paths_recorded', 'Доступные способы подачи семейного маршрута перечислены в карточке.')];
  }
  const methods = new Set(profile.applicationMethods || []);
  const consularAccepted = methods.has('RUSSIA') || methods.has('CURRENT_COUNTRY') || methods.has('ANY');
  if (!consularAccepted) {
    return [outcome(
      ROUTE_STATUSES.UNSUITABLE,
      'mexico_consular_filing_required',
      'Первоначальная подача требует мексиканского консульства; обычная подача только после въезда для этих маршрутов не подтверждена.',
      { action: 'Выбрать подачу из России или из страны законного пребывания.' },
    )];
  }
  return [outcome(
    ROUTE_STATUSES.SUITABLE,
    'mexico_consular_path_available',
    'Первоначальная виза оформляется через мексиканское консульство; после въезда карта резидента оформляется в INM.',
  )];
}

function familyEvaluation(route, profile) {
  if (route.route_id === 'MX_INTERNATIONAL_PROTECTION') {
    return [outcome(ROUTE_STATUSES.SUITABLE, 'protection_family_rules_recorded', route.family_rule_ru)];
  }
  if (route.route_type?.startsWith('FAMILY_')) {
    return [outcome(ROUTE_STATUSES.SUITABLE, 'mexico_family_basis_shown_as_route_condition', route.family_rule_ru)];
  }
  const checks = [];
  if (!profile.partnerIncluded && profile.children.length === 0) {
    return [outcome(ROUTE_STATUSES.SUITABLE, 'family_not_applicable', 'Семейное присоединение для текущего состава семьи не требуется.')];
  }

  checks.push(outcome(
    ROUTE_STATUSES.SUITABLE,
    'family_unity_after_residence',
    'Партнёр и дети присоединяются по отдельной процедуре семейного единства после оформления статуса основного резидента.',
  ));

  if (profile.partnerIncluded && profile.relationshipType === 'UNREGISTERED_PARTNER') {
    checks.push(outcome(
      ROUTE_STATUSES.SUITABLE_WITH_CONDITIONS,
      'concubinato_evidence_required',
      'Незарегистрированному партнёру требуется подтвердить фактический союз по правилам concubinato или общей семьи.',
      {
        condition: 'Подтвердить фактический союз или наличие общего ребёнка.',
        action: 'Подготовить доказательства совместной жизни, общий акт о ребёнке либо документ эквивалентной семейной фигуры.',
      },
    ));
  }
  return checks;
}

function goalEvaluation(route, profile) {
  return [outcome(
    ROUTE_STATUSES.SUITABLE,
    'long_term_path_available',
    'Временная резиденция засчитывается для общего перехода к постоянной резиденции и натурализации при соблюдении правил проживания.',
  )];
}

function evaluateRoute(route, indexes, profile, context) {
  const income = incomeEvaluation(route, profile, context);
  const application = applicationEvaluation(route, profile);
  const family = familyEvaluation(route, profile);
  const goal = goalEvaluation(route, profile);
  const checks = [...application, ...income.checks, ...family, ...goal];
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
    scenarioAffinity: route.route_id === 'MX_TEMP_ECONOMIC_SOLVENCY'
      && ECONOMIC_INCOME_TYPES.has(profile.primaryIncome.type)
      || route.route_id === 'MX_TEMP_LOCAL_JOB_OFFER'
      && profile.primaryIncome.source_country === 'MX'
      ? 1 : 0,
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
    practicalExplanation: 'Однополый брак признаётся по всей стране, но практическая среда и доступность профильной поддержки различаются по штатам и городам.',
    loyalCities: ['Мехико', 'Пуэрто-Вальярта'],
    rules: [{ id: 'MX_LGBT', legalStatus: rule.same_sex_marriage_recognized ? 'YES' : 'NO' }],
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

export const mexicoAdapter = Object.freeze({
  id: 'mexico',
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
