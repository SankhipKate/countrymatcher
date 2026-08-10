import { ROUTE_STATUSES } from './status-contract.js?v=7.1.1';

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
  if (!(fromRate > 0) || !(toRate > 0)) throw new Error(`Missing FX rate for ${from}/${to}.`);
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

function incomeAlternative(alternative, profile, context, countryId) {
  if (!alternative.asked_in_questionnaire) return { state: 'UNKNOWN', alternative };
  if (alternative.income_owners?.includes('SPONSOR')) return { state: 'UNKNOWN', alternative };
  const threshold = calculateFamilyThreshold(alternative, profile);
  if (threshold == null || alternative.currency == null) return { state: 'UNKNOWN', alternative, threshold, currency: alternative.currency };
  const sources = sourcesForOwners(profile, alternative.income_owners || []);
  const allowed = new Set(alternative.allowed_income_types || []);
  let confirmedAmount = 0;
  let unknownGeographyAmount = 0;
  for (const source of sources) {
    if (allowed.size && !allowed.has(source.type)) continue;
    if (source.monthly_provable?.amount == null) continue;
    const converted = convertAmount(source.monthly_provable.amount, source.monthly_provable.currency, alternative.currency, context);
    const geographyState = incomeGeographyState(alternative.source_geography, source, countryId);
    if (geographyState === 'PASS') confirmedAmount += converted;
    else if (geographyState === 'UNKNOWN') unknownGeographyAmount += converted;
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
  };
}

function assetAlternative(alternative, profile, context) {
  if (!alternative.asked_in_questionnaire) return { state: 'UNKNOWN', alternative, threshold: calculateFamilyThreshold(alternative, profile), currency: alternative.currency };
  const field = alternative.kind === 'SAVINGS' ? profile?.income?.savings : profile?.investment_capital;
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

export function evaluateFinancialRequirement(requirement, profile, context, countryId) {
  const financial = requirement.financial;
  const alternatives = financial.alternatives.map((item) => evaluateAlternative(item, profile, context, countryId));
  let state;
  switch (financial.model) {
    case 'INCOME_ONLY':
    case 'SAVINGS_ONLY':
    case 'INVESTMENT_CAPITAL':
    case 'SPONSOR_OR_SCHOLARSHIP':
    case 'INCOME_OR_SAVINGS':
      state = combineOr(alternatives);
      break;
    case 'INCOME_AND_SAVINGS':
      state = alternatives.some((item) => item.state === 'FAIL') ? 'FAIL'
        : alternatives.every((item) => item.state === 'PASS') ? 'PASS' : 'UNKNOWN';
      break;
    case 'INCOME_WITH_SAVINGS_SHORTFALL': {
      const income = alternatives.find(({ alternative }) => alternative.kind === 'INCOME');
      if (income?.state === 'PASS') state = 'PASS';
      else if (income?.state === 'UNSUPPORTED') state = 'UNKNOWN';
      else if (income?.state === 'UNKNOWN' && income.unknownReason !== 'GEOGRAPHY') state = 'UNKNOWN';
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
  const geographyAlternative = alternatives.find((item) => item.hasUnknownGeography && state === 'UNKNOWN');
  return {
    state, model: financial.model, alternatives,
    condition: geographyAlternative ? geographyCondition(geographyAlternative.alternative.source_geography) : null,
    unsupported: alternatives.some((item) => item.state === 'UNSUPPORTED' || item.unsupported),
  };
}

function statusEffect(requirement, state) {
  if (state === 'PASS' || requirement.unmet_effect === 'NONE') return 'NONE';
  if (state === 'UNKNOWN') return 'CONDITION';
  return requirement.unmet_effect === 'BLOCKS' ? 'BLOCKER' : 'CONDITION';
}

export function evaluateRoute(route, profile, context, countryId) {
  const blockers = [];
  const conditions = [];
  const displayOnlyRequirements = [];
  const requirementResults = [];
  for (const requirement of route.requirements || []) {
    if (requirement.evaluation_mode === 'DISPLAY_ONLY') {
      displayOnlyRequirements.push(requirement);
      requirementResults.push({ requirement, state: 'DISPLAY_ONLY', effect: 'NONE' });
      continue;
    }
    let evaluation;
    if (requirement.evaluation_mode === 'UNASKED_CONDITION') evaluation = { state: 'UNKNOWN' };
    else if (requirement.type === 'FINANCIAL') evaluation = evaluateFinancialRequirement(requirement, profile, context, countryId);
    else evaluation = { state: evaluateEngineRule(requirement.engine_rule, getPath(profile, PROFILE_PATHS[requirement.profile_path] || requirement.profile_path)) };
    if (evaluation.unsupported || evaluation.state === 'UNSUPPORTED') {
      throw new Rp4EvaluationUnsupportedError(`Unsupported evaluation semantics for ${requirement.requirement_id}.`, {
        routeId: route.route_id,
        requirementId: requirement.requirement_id,
      });
    }
    const effect = statusEffect(requirement, evaluation.state);
    if (effect === 'BLOCKER') blockers.push(requirement.unmet_ru || requirement.condition_ru);
    if (effect === 'CONDITION') {
      for (const text of [requirement.condition_ru, evaluation.condition]) {
        if (text && !conditions.includes(text)) conditions.push(text);
      }
    }
    requirementResults.push({ requirement, ...evaluation, effect });
  }
  const routeStatus = blockers.length ? ROUTE_STATUSES.UNSUITABLE
    : conditions.length ? ROUTE_STATUSES.SUITABLE_WITH_CONDITIONS : ROUTE_STATUSES.SUITABLE;
  return {
    routeId: route.route_id,
    routeName: route.name_ru,
    routeStatus,
    blockers,
    conditions,
    conditionsCount: conditions.length,
    requirements: displayOnlyRequirements.map((item) => item.condition_ru),
    displayOnlyRequirements,
    requirementResults,
    familyFit: 'NOT_APPLICABLE',
    goalFit: 'NOT_APPLICABLE',
    applicationFit: 'NOT_APPLICABLE',
    incomeFit: 'NOT_APPLICABLE',
    incomeTypeFit: 'NOT_APPLICABLE',
  };
}

const ROUTE_LABELS_RU = Object.freeze({ ES_DNV: 'Цифровой кочевник (DNV)' });
const roundedDisplayAmount = (amount) => amount < 1000 ? Math.round(amount)
  : amount < 100000 ? Math.round(amount / 10) * 10 : Math.round(amount / 100) * 100;

function presentFinancial(requirementResults, context) {
  const evaluated = requirementResults.find(({ requirement }) => requirement.type === 'FINANCIAL');
  if (!evaluated) return null;
  return {
    model: evaluated.model,
    state: evaluated.state,
    alternatives: (evaluated.alternatives || []).map((item) => ({
      kind: item.alternative.kind,
      state: item.state,
      amount: item.amount ?? null,
      threshold: item.threshold ?? null,
      currency: item.currency ?? null,
      period: item.alternative.period,
      thresholdUsd: item.threshold == null || item.currency == null ? null
        : roundedDisplayAmount(convertAmount(item.threshold, item.currency, 'USD', context)),
      shortfall: item.shortfall ?? null,
    })),
  };
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
  const operationalCondition = scenario.simultaneous_move === 'CONDITIONAL'
    || scenario.simultaneous_move === 'NO' || later || scenario.join_stage === 'SEPARATE_ROUTE'
    || scenario.separate_route_required === true;
  if (operationalCondition && !scenario.condition_ru?.trim()) return { state: FAMILY_STATES.DATA_CONTRACT_PROBLEM, scenario, problems: ['conditional family path has no condition_ru'] };
  const conditions = [relationshipCondition, operationalCondition ? scenario.condition_ru : null].filter(Boolean);
  return {
    state: conditions.length ? FAMILY_STATES.CONDITION : FAMILY_STATES.PASS,
    scenario,
    conditions,
    classification: scenario.join_stage === 'SEPARATE_ROUTE' || scenario.separate_route_required === true ? 'SEPARATE_LINKED_ROUTE'
      : later || scenario.simultaneous_move === 'NO' ? 'LATER_JOIN'
        : scenario.simultaneous_move === 'CONDITIONAL' ? 'CONDITIONAL_SIMULTANEOUS' : 'SIMULTANEOUS',
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
  const memberResults = members.map((member) => {
    const applicable = scenariosForMember(scenarios, member);
    if (!applicable.length) return { memberId: member.id, memberType: member.type, state: FAMILY_STATES.DATA_CONTRACT_PROBLEM, applicableScenarioIds: [], problems: ['no applicable family scenario'] };
    const paths = applicable.map((scenario) => familyPathResult(scenario, member, family, routeIds));
    const preferredState = paths.some(({ state }) => state === FAMILY_STATES.PASS) ? FAMILY_STATES.PASS
      : paths.some(({ state }) => state === FAMILY_STATES.CONDITION) ? FAMILY_STATES.CONDITION : FAMILY_STATES.DATA_CONTRACT_PROBLEM;
    const selected = paths.filter(({ state }) => state === preferredState);
    return {
      memberId: member.id, memberType: member.type, age: member.age ?? null, state: preferredState,
      applicableScenarioIds: selected.map(({ scenario }) => scenario.scenario_id),
      conditions: selected.flatMap(({ conditions = [] }) => conditions),
      classifications: selected.map(({ classification }) => classification).filter(Boolean),
      linkedRouteIds: selected.map(({ scenario }) => scenario.linked_route_id).filter(Boolean),
      joinStages: selected.map(({ scenario }) => scenario.join_stage),
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
  return {
    state, classification, memberResults,
    applicableScenarioIds: [...new Set(memberResults.flatMap((member) => member.applicableScenarioIds || []))],
    conditions: [...new Set(memberResults.flatMap((member) => member.conditions || []))],
    linkedRouteIds: [...new Set(memberResults.flatMap((member) => member.linkedRouteIds || []))],
    joinStages: [...new Set(memberResults.flatMap((member) => member.joinStages || []))],
    separationMonthsMin: memberResults.flatMap((member) => member.separationMonthsMin || []),
    separationMonthsMax: memberResults.flatMap((member) => member.separationMonthsMax || []),
    memberLongTermPaths: memberResults.flatMap((member) => member.memberLongTermPaths || []),
    dataContractProblems,
  };
}

function presentRoute(route, evaluated, sources, context) {
  const source = sources.get(route.official_source_id) || null;
  return {
    ...evaluated,
    routeName: ROUTE_LABELS_RU[route.route_id] || route.name_ru,
    routeOfficialName: route.official_term_ru || null,
    routeType: route.route_type,
    description: route.basis_ru,
    financialSummary: presentFinancial(evaluated.requirementResults, context),
    application: (route.application_methods || []).filter(({ availability }) => availability === 'AVAILABLE').map((item) => ({
      method: item.method, guidance: item.condition_ru, entryGuidance: item.entry_condition_ru,
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

function presentCities(pkg, context) {
  const raw = pkg.cities || [];
  const signatures = raw.map((city) => city.cost_components.map((item) =>
    `${item.component}:${item.currency}:${item.period}:${item.household_basis}`).sort().join('|'));
  const costComparable = signatures.length > 0 && signatures.every((value) => value === signatures[0]);
  const coolest = raw.filter((city) => city.climate?.cold_min_c != null).sort((a, b) =>
    a.climate.cold_min_c - b.climate.cold_min_c || a.climate.cold_max_c - b.climate.cold_max_c)[0]?.city_id;
  const hottest = raw.filter((city) => city.climate?.hot_max_c != null).sort((a, b) =>
    b.climate.hot_max_c - a.climate.hot_max_c || b.climate.hot_min_c - a.climate.hot_min_c)[0]?.city_id;
  return raw.map((city) => {
    const numeric = city.cost_components.filter((item) => item.amount != null && item.period === 'MONTHLY');
    const currency = numeric.length && numeric.every((item) => item.currency === numeric[0].currency) ? numeric[0].currency : null;
    const cost = currency ? numeric.reduce((sum, item) => sum + item.amount, 0) : null;
    return {
      cityId: city.city_id,
      cityName: city.name_ru,
      populationCategory: city.structural_roles.find((role) => ['LARGE', 'MEDIUM', 'SMALL'].includes(role)) || null,
      roles: city.structural_roles,
      labels: [city.city_id === coolest ? 'Самый прохладный' : null, city.city_id === hottest ? 'Самый жаркий' : null].filter(Boolean),
      costOriginal: cost == null ? null : { amount: cost, currency },
      costUsd: cost == null ? null : convertAmount(cost, currency, 'USD', context),
      costComparable,
      climate: city.climate?.category_ru || null,
      coldRange: city.climate ? [city.climate.cold_min_c, city.climate.cold_max_c] : null,
      hotRange: city.climate ? [city.climate.hot_min_c, city.climate.hot_max_c] : null,
    };
  });
}

function presentLgbt(pkg, profile) {
  if (!profile?.lgbt?.enabled || !pkg.lgbt) return null;
  const value = pkg.lgbt;
  return {
    legalPosition: value.legal_assessment,
    practicalEnvironment: value.practical_assessment,
    practicalExplanation: value.assessment_basis_ru,
    rows: [
      ['Однополый брак', value.same_sex_marriage_rule_ru],
      ['Партнёрство', value.registered_partnership_rule_ru],
      ['Иностранные документы', value.foreign_document_rule_ru],
      ['Семейная иммиграция', value.family_route_available === 'YES' ? 'Семейные маршруты доступны на общих основаниях при выполнении требований конкретной процедуры.' : null],
      ['Защита от дискриминации', value.anti_discrimination?.rule_ru],
      ['Практическая среда', value.systemic_practical_restrictions_ru],
      ['Региональные различия', value.regional_differences_ru],
    ].filter(([, text]) => text),
  };
}

const statusRank = { SUITABLE: 0, SUITABLE_WITH_CONDITIONS: 1, UNSUITABLE: 2 };

export function calculateActiveCountry(profile, pkg, context) {
  assertActiveResearchPackage(pkg);
  const sourceIndex = new Map((pkg.sources || []).map((source) => [source.source_id, source]));
  const publishableRoutes = pkg.routes.filter((route) => route.publishable === true);
  const evaluated = publishableRoutes.map((route) => {
    const calculated = evaluateRoute(route, profile, context, pkg.country_id);
    const familyEvaluation = evaluateFamilyScenarios(route, profile, pkg.routes);
    if (familyEvaluation.state === FAMILY_STATES.CONDITION) {
      for (const text of familyEvaluation.conditions) if (text && !calculated.conditions.includes(text)) calculated.conditions.push(text);
      if (!calculated.blockers.length && calculated.conditions.length) calculated.routeStatus = ROUTE_STATUSES.SUITABLE_WITH_CONDITIONS;
      calculated.conditionsCount = calculated.conditions.length;
    }
    return { route, calculated, familyEvaluation };
  });
  const excludedRoutes = evaluated.filter(({ familyEvaluation }) => familyEvaluation.state === FAMILY_STATES.DATA_CONTRACT_PROBLEM)
    .map(({ route, familyEvaluation }) => ({ routeId: route.route_id, reason: 'FAMILY_DATA_CONTRACT_PROBLEM', problems: familyEvaluation.dataContractProblems }));
  const routes = evaluated.filter(({ familyEvaluation }) => familyEvaluation.state !== FAMILY_STATES.DATA_CONTRACT_PROBLEM)
    .map(({ route, calculated, familyEvaluation }) => ({ ...presentRoute(route, calculated, sourceIndex, context), familyEvaluation }));
  const bestRoute = [...routes].sort((a, b) => statusRank[a.routeStatus] - statusRank[b.routeStatus])[0] || null;
  const applicantIncome = applicantSources(profile).reduce((sum, item) => sum + convertAmount(
    item.monthly_provable?.amount || 0,
    item.monthly_provable?.currency || pkg.country_currency,
    pkg.country_currency,
    context,
  ), 0);
  return {
    calculatedAt: new Date().toISOString(),
    profile: { ...profile, adults: profile.family?.adults_count || 1, children: profile.family?.children || [] },
    country: { countryId: pkg.country_id, name: pkg.country_name_ru, group: bestRoute?.routeStatus ?? null, resultCurrency: pkg.country_currency },
    evaluationState: routes.length ? 'EVALUATED' : 'NO_EVALUABLE_ROUTES',
    excludedRoutes,
    bestRoute,
    routes,
    applicantProvableIncome: { amount: applicantIncome, currency: pkg.country_currency, conversions: [] },
    cities: presentCities(pkg, context),
    lgbt: presentLgbt(pkg, profile),
    schoolSummary: profile?.family?.school_needed ? pkg.schools?.public_school_rules?.[0]?.rule_ru || null : null,
    sources: [],
    practicalMissing: [],
  };
}

export function calculateActiveMatcher(profile, pkg, context) {
  return { calculatedAt: new Date().toISOString(), results: [calculateActiveCountry(profile, pkg, context)], errors: [] };
}
