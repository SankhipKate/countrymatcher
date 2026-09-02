import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { assertActiveResearchPackage, calculateActiveCountry } from '../js/engine/rp4-engine.js';

const thailand = JSON.parse(await readFile(new URL('../data/TH-research-v4.0.json', import.meta.url), 'utf8'));
const researchSchema = JSON.parse(await readFile(new URL('../data/research-package-v4.0.schema.json', import.meta.url), 'utf8'));
const appSource = await readFile(new URL('../matcher/app.js', import.meta.url), 'utf8');
const buildSource = await readFile(new URL('../scripts/build-pages-artifact.mjs', import.meta.url), 'utf8');
const version = (await readFile(new URL('../VERSION', import.meta.url), 'utf8')).trim();
const context = {
  fx: {
    base_currency: 'USD',
    rates: { USD: 1, THB: 35, RUB: 80 },
    as_of: '2026-08-25',
    source: 'thailand-qa-test',
  },
};

const income = (type, amount) => ({
  owner: 'APPLICANT',
  type,
  source_geography: 'SINGLE_COUNTRY',
  country_id: 'US',
  monthly_total: { amount, currency: 'USD' },
  monthly_provable: { amount, currency: 'USD' },
});

function profile({ age = 35, type = 'REMOTE_EMPLOYMENT', amount = 5000, savings = 20000, relationship = null } = {}) {
  const hasPartner = Boolean(relationship);
  return {
    residence: { current_country: 'RU', current_status: 'CITIZEN' },
    family: {
      adults_count: hasPartner ? 2 : 1,
      adult_ages: hasPartner ? [age, 35] : [age],
      partner_included: hasPartner,
      relationship_type: relationship,
      children: [],
      school_needed: false,
    },
    income: {
      primary: income(type, amount),
      additional_sources: [],
      partner: { has_income: false, sources: [] },
      savings: { amount: savings, currency: 'USD' },
    },
    investment_capital: null,
    goal: { long_term: 'TEMPORARY_RESIDENCE_SUFFICIENT', keep_russian_citizenship: 'NOT_REQUIRED' },
    pets: { types: ['NONE'], dogs: [], other_pet_notes: null },
  };
}

const route = (result, routeId) => {
  const found = result.routes.find((item) => item.routeId === routeId);
  assert.ok(found, `Thailand route ${routeId} exists in calculated result`);
  return found;
};

test('Thailand package is Final Lock RP4 and activated in production 14.0.0', () => {
  assert.doesNotThrow(() => assertActiveResearchPackage(thailand));
  assert.equal(thailand.country_id, 'TH');
  assert.equal(thailand.routes.length, 24);
  assert.equal(version, '14.0.0');
  const productionBlock = appSource.match(/const ACTIVE_RP4_PACKAGES = \[([\s\S]*?)\];/)?.[1] || '';
  const productionPackages = [...productionBlock.matchAll(/'([A-Z]{2}-research-v4\.0\.json)'/g)].map((match) => match[1]);
  assert.equal(productionPackages.length, 14);
  assert.ok(productionPackages.includes('EC-research-v4.0.json'));
  assert.ok(productionPackages.includes('TH-research-v4.0.json'));
  assert.match(buildSource, /data\/TH-research-v4\.0\.json/);
});

test('DTV is one route and qualifying remote work does not require a numeric income threshold', () => {
  const dtvRoutes = thailand.routes.filter(({ route_id }) => route_id.startsWith('TH_DTV_WORKCATION_'));
  assert.deepEqual(dtvRoutes.map(({ route_id }) => route_id), ['TH_DTV_WORKCATION_OWN']);

  const remote = dtvRoutes[0].requirements
    .find(({ requirement_id }) => requirement_id === 'TH_DTV_WORKCATION_OWN_REMOTE')
    .financial.alternatives[0];

  assert.equal(remote.amount_not_required_for_eligibility, true);

  const result = calculateActiveCountry(profile({ amount: 6000, savings: 20000 }), thailand, context);
  const dtv = route(result, 'TH_DTV_WORKCATION_OWN');

  assert.equal(dtv.routeStatus, 'SUITABLE');
  assert.equal(dtv.blockers.length, 0);
  assert.equal(dtv.conditions.length, 0);
});

test('DTV insufficient own funds becomes a condition because sponsor or family evidence may be available', () => {
  const result = calculateActiveCountry(profile({ amount: 6000, savings: 5000 }), thailand, context);
  const dtv = route(result, 'TH_DTV_WORKCATION_OWN');

  assert.equal(dtv.routeStatus, 'SUITABLE_WITH_CONDITIONS');
  assert.equal(dtv.blockers.length, 0);
  assert.match(dtv.conditions.join(' '), /500 000 THB/u);
  assert.doesNotMatch(dtv.conditions.join(' '), /Нужен действующий иностранный источник дохода/u);
});

test('retirement age 50+ and fixed financial branch can produce a fully suitable Non-O route', () => {
  const result = calculateActiveCountry(profile({ age: 55, type: 'PENSION', amount: 7000, savings: 30000 }), thailand, context);
  const retirement = route(result, 'TH_RETIREMENT_NON_O_FIXED');
  assert.equal(retirement.routeStatus, 'SUITABLE');
  assert.equal(retirement.blockers.length, 0);
  assert.equal(retirement.conditions.length, 0);
});

test('retirement routes reject a known under-50 applicant', () => {
  const result = calculateActiveCountry(profile({ age: 45, type: 'PENSION', amount: 7000, savings: 30000 }), thailand, context);
  assert.equal(route(result, 'TH_RETIREMENT_NON_O_FIXED').routeStatus, 'UNSUITABLE');
  assert.equal(route(result, 'TH_LTR_PENSIONER_HIGH').routeStatus, 'UNSUITABLE');
});

test('Thai local employment never passes from current foreign salary alone', () => {
  const result = calculateActiveCountry(profile({ amount: 20000, savings: 50000 }), thailand, context);
  const employment = route(result, 'TH_NON_B_EMPLOYMENT');
  assert.equal(employment.routeStatus, 'SUITABLE_WITH_CONDITIONS');
  assert.ok(employment.conditions.some((text) => /Thai|тайск|работодател|job/i.test(text)));
});

test('SMART S remains conditional even with enough savings because startup basis is unasked', () => {
  const result = calculateActiveCountry(profile({ savings: 30000 }), thailand, context);
  const smart = route(result, 'TH_SMART_S');
  assert.equal(smart.routeStatus, 'SUITABLE_WITH_CONDITIONS');
  assert.equal(smart.blockers.length, 0);
  assert.ok(smart.conditions.length > 0);
});

test('Thai-spouse route treats registered partnership as a correctable condition, not hard rejection', () => {
  const result = calculateActiveCountry(profile({ relationship: 'REGISTERED_PARTNERSHIP' }), thailand, context);
  const spouse = route(result, 'TH_FAMILY_THAI_SPOUSE_FIXED');
  assert.notEqual(spouse.routeStatus, 'UNSUITABLE');
  assert.ok(spouse.conditions.some((text) => /брак/i.test(text)));
});

test('relationship formalization drives conditional status but is rendered in the Family section instead of duplicated as a generic action', () => {
  const result = calculateActiveCountry(profile({ relationship: 'REGISTERED_PARTNERSHIP' }), thailand, context);
  const dtv = route(result, 'TH_DTV_WORKCATION_OWN');
  assert.ok(dtv.conditions.some((text) => /признаваем.*брак/i.test(text)));
  assert.ok(dtv.familyEvaluation.relationshipConditions.some((text) => /признаваем.*брак/i.test(text)));
  assert.match(appSource, /filter\(\(action\) => !familyRelationshipNotes\.includes\(action\.text\)\)/);
});

test('SMART S excludes a non-recognized partner from dependant financial addition', () => {
  const result = calculateActiveCountry(profile({ relationship: 'REGISTERED_PARTNERSHIP', savings: 20000 }), thailand, context);
  const smart = route(result, 'TH_SMART_S');
  const fin = smart.financialRequirements.find((item) => item.requirementId === 'TH_SMART_S_FUNDS');
  assert.equal(fin.summary.alternatives[0].threshold, 600000);
});

test('Thailand route names contain no monetary thresholds', () => {
  for (const item of thailand.routes) {
    assert.doesNotMatch(item.name_ru, /\d|\b(?:THB|USD|RUB)\b/u, item.route_id);
  }
});

test('Thailand Russian user-facing copy contains no internal English research jargon or Colombia residue', () => {
  const forbidden = /\b(?:basis|branch|qualifying|dependants?|mission|work authorization|questionnaire|screening|guidance|maintenance|admission|employment|contractor|framework|route|current|temporary|presence|naturalization|matching|engine|QA)\b/iu;
  const violations = [];
  const visit = (value, path = '') => {
    if (Array.isArray(value)) return value.forEach((item, index) => visit(item, `${path}[${index}]`));
    if (!value || typeof value !== 'object') return;
    for (const [key, child] of Object.entries(value)) {
      const childPath = path ? `${path}.${key}` : key;
      if (typeof child === 'string' && key.endsWith('_ru') && key !== 'official_term_ru' && forbidden.test(child)) {
        violations.push([childPath, child]);
      } else {
        visit(child, childPath);
      }
    }
  };
  visit(thailand);
  assert.deepEqual(violations, []);
  assert.doesNotMatch(JSON.stringify(thailand), /Migración Colombia|Cartagena|\bSC-2\b|Колумби/iu);
});

test('Thailand expanded route copy is clean Russian in processing and long-term sections', () => {
  const processingRules = thailand.routes.map(({ processing_time }) => processing_time?.official_rule_ru).filter(Boolean);
  assert.ok(processingRules.length > 0);
  for (const text of processingRules) assert.doesNotMatch(text, /в источник исследования/u);

  const dependant = thailand.routes.find(({ route_id }) => route_id === 'TH_DEPENDANT_NON_O');
  assert.equal(dependant.long_term_path.initial_status_ru, 'Семейный временный статус иждивенца по Non-O.');
  assert.equal(dependant.long_term_path.renewal_ru, 'Продление зависит от сохранения статуса основного спонсора.');

  const business = thailand.routes.find(({ route_id }) => route_id === 'TH_NON_B_BUSINESS');
  assert.equal(business.long_term_path.initial_status_ru, 'Бизнес-статус Non-B с возможностью годового продления.');
  assert.equal(business.long_term_path.renewal_ru, 'Годовые продления возможны при сохранении бизнес-основания и выполнении действующих требований.');
  assert.equal(business.long_term_path.pr_path_ru, 'Бизнес-категория может вести к ПМЖ после требуемой истории продлений и при выполнении остальных условий.');
  assert.equal(business.long_term_path.citizenship_path_ru, 'Натурализация требует отдельного выполнения правил проживания, домициля и других условий.');

  const retirementOa = thailand.routes.find(({ route_id }) => route_id === 'TH_RETIREMENT_NON_OA');
  assert.equal(retirementOa.long_term_path.renewal_ru, 'Продление возможно при сохранении пенсионного основания и выполнении действующих требований.');

  const privilege = thailand.routes.find(({ route_id }) => route_id === 'TH_PRIVILEGE');
  assert.equal(privilege.long_term_path.initial_status_ru, 'Длительное пребывание в рамках программы Thailand Privilege; срок зависит от выбранного варианта участия.');
  assert.equal(privilege.long_term_path.renewal_ru, 'Продолжение участия зависит от срока и условий выбранного варианта программы.');

  const guardian = thailand.routes.find(({ route_id }) => route_id === 'TH_GUARDIAN');
  const guardianFunds = guardian.requirements.find(({ requirement_id }) => requirement_id === 'TH_GUARDIAN_FUNDS');
  assert.equal(guardianFunds.met_ru, 'Сбережения достигают 500 000 THB.');
  assert.equal(guardianFunds.unmet_ru, 'Сбережения ниже 500 000 THB.');
});

test('generic renderer retains dynamic USD equivalents for local-currency amounts', () => {
  assert.match(appSource, /withDynamicFinancialTextEquivalents/);
  assert.match(appSource, /thresholdUsd/);
});

test('LTR Wealthy Global Citizen keeps the USD 1m worldwide-assets rule as an unasked condition', () => {
  const result = calculateActiveCountry(profile({ savings: 2000000 }), thailand, context);
  const wealthy = route(result, 'TH_LTR_WGC');
  assert.equal(wealthy.routeStatus, 'SUITABLE_WITH_CONDITIONS');
  assert.ok(wealthy.conditions.some((text) => /1 000 000 USD/u.test(text)));
});

test('Thai retirement combination computes annual income plus savings against 800k THB', () => {
  const pass = calculateActiveCountry(profile({ age: 55, type: 'PENSION', amount: 1000, savings: 12000 }), thailand, context);
  assert.notEqual(route(pass, 'TH_RETIREMENT_NON_O_COMBINATION').routeStatus, 'UNSUITABLE');
  const fail = calculateActiveCountry(profile({ age: 55, type: 'PENSION', amount: 200, savings: 1000 }), thailand, context);
  assert.equal(route(fail, 'TH_RETIREMENT_NON_O_COMBINATION').routeStatus, 'UNSUITABLE');
});

test('Thai-spouse combination computes annual income plus savings against 400k THB', () => {
  const pass = calculateActiveCountry(profile({ relationship: 'MARRIED', amount: 500, savings: 7000 }), thailand, context);
  assert.notEqual(route(pass, 'TH_FAMILY_THAI_SPOUSE_COMBINATION').routeStatus, 'UNSUITABLE');
  const fail = calculateActiveCountry(profile({ relationship: 'MARRIED', amount: 100, savings: 500 }), thailand, context);
  assert.equal(route(fail, 'TH_FAMILY_THAI_SPOUSE_COMBINATION').routeStatus, 'UNSUITABLE');
});

test('LTR parent expansion is pending rather than active family eligibility', () => {
  const ltrRoutes = thailand.routes.filter(({ route_id }) => route_id.startsWith('TH_LTR_'));
  for (const item of ltrRoutes) {
    assert.equal((item.family_scenarios || []).some(({ applies_to }) => applies_to === 'OTHER_ADULT'), false, item.route_id);
  }
  const pending = thailand.pending_changes.find(({ change_id }) => change_id === 'TH_PENDING_LTR_DEPENDENT_EXPANSION');
  assert.ok(pending);
  assert.equal(pending.status, 'ADOPTED_NOT_IN_FORCE');
  assert.equal(pending.expected_effective_date, null);
});

test('2026 visa-free reform is pending with unknown effective date while the current 60-day rule remains active', () => {
  assert.equal(thailand.entry_for_russian_citizen.maximum_stay_days, 60);
  assert.equal(thailand.open_items.some(({ item_id }) => item_id === 'TH_OPEN_03_ENTRY_REFORM_2026'), false);
  const pending = thailand.pending_changes.find(({ change_id }) => change_id === 'TH_PENDING_ENTRY_REFORM_2026');
  assert.ok(pending);
  assert.equal(pending.status, 'ADOPTED_NOT_IN_FORCE');
  assert.equal(pending.expected_effective_date, null);
  const entryBlock = thailand.completeness.blocks.find(({ block }) => block === 'ENTRY_APPLICATION');
  assert.equal(entryBlock.status, 'COMPLETE');
});


test('pending-change contract permits unknown dates only for adopted-not-in-force changes', () => {
  const pending = researchSchema.$defs.pendingChange;
  assert.deepEqual(pending.properties.expected_effective_date.type, ['string', 'null']);
  const scheduledRule = pending.allOf.find((item) => item.if?.properties?.status?.const === 'OFFICIALLY_SCHEDULED');
  assert.ok(scheduledRule);
  assert.equal(scheduledRule.then.properties.expected_effective_date.type, 'string');
});
