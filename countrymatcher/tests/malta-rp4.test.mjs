import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { calculateActiveCountry } from '../js/engine/rp4-engine.js';

const malta = JSON.parse(await readFile(new URL('../data/MT-research-v4.0.json', import.meta.url), 'utf8'));
const context = { fx: { base_currency: 'USD', rates: { EUR: 0.9, USD: 1 }, as_of: '2026-09-02', source: 'test' } };
const incomeSource = (type, amount = 4000) => ({
  owner: 'APPLICANT', type, source_geography: 'SINGLE_COUNTRY', country_id: 'US',
  monthly_total: { amount, currency: 'EUR' }, monthly_provable: { amount, currency: 'EUR' },
});
const profile = ({ incomeType = 'REMOTE_EMPLOYMENT', partner = false, childAge = null } = {}) => ({
  residence: { current_country: 'PH', current_status: 'LEGAL_RESIDENT' },
  family: {
    adults_count: partner ? 2 : 1,
    adult_ages: partner ? [35, 35] : [35],
    partner_included: partner,
    relationship_type: partner ? 'MARRIED' : null,
    children: childAge == null ? [] : [{ age_years: childAge }],
    school_needed: childAge != null && childAge < 18,
  },
  income: {
    primary: incomeSource(incomeType), additional_sources: [],
    partner: { has_income: false, sources: [] }, savings: { amount: 100000, currency: 'EUR' },
  },
  investment_capital: null,
  goal: { long_term: 'TEMPORARY_RESIDENCE_SUFFICIENT', keep_russian_citizenship: 'NOT_REQUIRED' },
  pets: { types: ['NONE'], dogs: [], other_pet_notes: null },
});

const byId = (result, id) => result.routes.find((route) => route.routeId === id);

test('Malta keeps all 12 publishable routes evaluable across child ages', () => {
  for (const age of [10, 17, 18, 24, 25]) {
    const result = calculateActiveCountry(profile({ childAge: age }), malta, context);
    assert.equal(result.evaluationState, 'EVALUATED', `age ${age}`);
    assert.equal(result.routes.length, 12, `age ${age}`);
    assert.equal(result.excludedRoutes.length, 0, `age ${age}`);
  }
});

test('Malta publication boundary follows the approved product decisions', () => {
  const hiddenRouteIds = ['MT_ICT', 'MT_MALTESE_PARTNER'];
  const publicRouteIdsExpected = ['MT_SELF_EMPLOYED', 'MT_RESEARCHER'];

  for (const routeId of hiddenRouteIds) {
    const item = malta.routes.find(({ route_id }) => route_id === routeId);
    assert.ok(item, `Malta research route ${routeId} exists`);
    assert.equal(item.publishable, false, routeId);
  }

  for (const routeId of publicRouteIdsExpected) {
    const item = malta.routes.find(({ route_id }) => route_id === routeId);
    assert.ok(item, `Malta research route ${routeId} exists`);
    assert.equal(item.publishable, true, routeId);
  }

  const result = calculateActiveCountry(profile({ partner: true }), malta, context);
  const publicRouteIds = new Set(result.routes.map(({ routeId }) => routeId));
  for (const routeId of hiddenRouteIds) assert.equal(publicRouteIds.has(routeId), false, routeId);
  for (const routeId of publicRouteIdsExpected) assert.equal(publicRouteIds.has(routeId), true, routeId);
});

test('Malta Researcher handles unsupported unmarried partner and adult dependent child explicitly', () => {
  const unmarried = structuredClone(profile({ partner: true }));
  unmarried.family.relationship_type = 'UNREGISTERED_PARTNERSHIP';
  const researcherUnmarried = byId(calculateActiveCountry(unmarried, malta, context), 'MT_RESEARCHER');
  assert.ok(researcherUnmarried);
  assert.equal(researcherUnmarried.routeStatus, 'SUITABLE_WITH_CONDITIONS');
  assert.notEqual(researcherUnmarried.familyEvaluation.state, 'DATA_CONTRACT_PROBLEM');
  assert.ok(researcherUnmarried.familyEvaluation.conditions.length > 0);
  assert.equal(researcherUnmarried.blockers.length, 0);

  const adultChild = byId(calculateActiveCountry(profile({ childAge: 25 }), malta, context), 'MT_RESEARCHER');
  assert.ok(adultChild);
  assert.notEqual(adultChild.familyEvaluation.state, 'DATA_CONTRACT_PROBLEM');
  assert.ok(adultChild.familyEvaluation.applicableScenarioIds.includes('MT_RESEARCHER_FAM_ADULT_DEPENDENT'));
});

test('Malta Study and Seasonal stay visible as UNSUITABLE with a family blocker', () => {
  const result = calculateActiveCountry(profile({ partner: true }), malta, context);
  for (const id of ['MT_STUDY', 'MT_SEASONAL_WORKER']) {
    const route = byId(result, id);
    assert.ok(route, id);
    assert.equal(route.routeStatus, 'UNSUITABLE', id);
    assert.equal(route.familyEvaluation.state, 'BLOCKER', id);
    assert.equal(route.familyEvaluation.classification, 'NOT_AVAILABLE', id);
    assert.ok(route.familyEvaluation.applicableScenarioIds.length > 0, id);
    assert.ok(route.blockers.length > 0, id);
    assert.ok(route.blockers.every((text) => typeof text === 'string' && text.trim().length > 0), id);
  }
});

test('Malta Retirement Programme requires an actual pension income source', () => {
  const withoutPension = byId(calculateActiveCountry(profile(), malta, context), 'MT_MRP');
  assert.equal(withoutPension.routeStatus, 'UNSUITABLE');
  assert.ok(withoutPension.blockers.length > 0);

  const withPension = byId(calculateActiveCountry(profile({ incomeType: 'PENSION' }), malta, context), 'MT_MRP');
  assert.notEqual(withPension.routeStatus, 'UNSUITABLE');
  assert.equal(withPension.blockers.length, 0);
});

test('Malta cities expose a comparable monthly cost basket with rent', () => {
  const result = calculateActiveCountry(profile(), malta, context);
  assert.equal(result.cities.length, 4);
  for (const city of result.cities) {
    assert.deepEqual(city.comparisonComponents, ['RENT_STANDARD', 'TRANSPORT'], city.cityId);
    assert.ok(Number.isFinite(city.comparisonCostUsd), city.cityId);
  }
  const costs = Object.fromEntries(result.cities.map(({ cityId, comparisonCostUsd }) => [cityId, comparisonCostUsd]));
  assert.ok(costs.MT_VALLETTA > costs.MT_MOSTA);
  assert.ok(costs.MT_MOSTA > costs.MT_BIRKIRKARA);
  assert.ok(costs.MT_BIRKIRKARA > costs.MT_VICTORIA);
});


test('Malta Russian presentation copy contains no untranslated English research jargon', () => {
  const allowedTerms = [
    'Nomad Residence Permit', 'Malta Permanent Residence Programme', 'Single Permit',
    'Startup Residence Programme', 'Global Residence Programme', 'Malta Retirement Programme',
    'Family Members Policy', 'Pre-Departure Course', 'Key Employee Initiative',
    'Specialist Employee Initiative', 'EU Blue Card', 'Malta Enterprise', 'University of Malta',
    'Expatriates Portal', 'Expatriates Online Portal', 'Researcher Permit', 'Seasonal Worker',
    'Intra-Corporate Transferee', 'QSI International School of Malta', 'Verdala International School',
    'Pets Arrival Notification', 'Animal Health and Welfare Department', 'Residency Malta', 'Jobsplus',
    'Identità', 'MTCA', 'NSO', 'ISCO', 'MQF', 'KEI', 'SEI', 'GRP', 'MRP', 'MPRP', 'ICT',
    'VFS', 'I Belong', 'S.L.', 'DLA Piper', 'CSB Group', 'Zampa Partners', 'GB Partners',
    'Equitas', 'Frank Salt Real Estate', 'Legislation Malta', 'Aġenzija Komunità Malta',
    'Servizz.gov', 'EMD', 'Mifsud Advocates', 'Papilio',
  ];
  const forbidden = /\b(?:basis|branch|qualifying|dependants?|sponsor|ordinary|naturalisation|aggregate|regular residence|integration measures|attendance|employment route|job offer|gross\/year|bonuses|allowances|waiver|registered partnership|framework|criteria|numeric|processing SLA|family filing|discretionary family|guidance|self-employment|innovator|business plan|project leader|sole representative|co-founders?|personal bank resources|practitioner|maintenance benchmark|programme application|de-facto|principally dependent|automatic labour-market|remote work dependant|programme-specific|chargeable income|standalone threshold|practical-finance|stable and regular|study-specific|admission|student-dependent|authorisation|generic|settlement|continuity|intra-group|prior group|role evidence|manager|specialist|trainee|hosting agreement|approved research|teaching|unrelated employment|lawful basis|unmarried partner|stable relationship|renewal duration|downstream|genuine relationship|locality|research role|state schools|holders|fee exemption|pet-movement|identification|rabies|breeding|keeping|advertising|phenotype|pre-travel|immigration definitions|same-sex|civil union|documentary|second-parent|co-parent|equality|sexual orientation|gender identity|gender expression|harassment|victimisation|presentation assessment|eligibility score|city-level|route matching|legal framework|tax treatment|ordinarily resident|worldwide basis|remittance basis|territorial basis|day-count|single schedule|marginal|social-security|Malta-source|foreign income|capital gains|audited research)\b/iu;
  const violations = [];
  const stripAllowed = (text) => allowedTerms.reduce((value, term) => value.split(term).join(''), text);
  const visit = (value, path = '') => {
    if (Array.isArray(value)) return value.forEach((item, index) => visit(item, `${path}[${index}]`));
    if (!value || typeof value !== 'object') return;
    for (const [key, child] of Object.entries(value)) {
      const childPath = path ? `${path}.${key}` : key;
      if (typeof child === 'string' && key.endsWith('_ru') && !['official_term_ru', 'school_name_ru', 'supports_ru'].includes(key)) {
        if (forbidden.test(stripAllowed(child))) violations.push([childPath, child]);
      } else if (key !== 'open_items') {
        visit(child, childPath);
      }
    }
  };
  for (const key of ['entry_for_russian_citizen', 'routes', 'cities', 'schools', 'pets', 'lgbt', 'taxes']) {
    visit(malta[key], key);
  }
  if (forbidden.test(stripAllowed(malta.country_summary_ru))) violations.push(['country_summary_ru', malta.country_summary_ru]);
  for (const [index, source] of malta.sources.entries()) {
    if (forbidden.test(stripAllowed(source.title_ru))) violations.push([`sources[${index}].title_ru`, source.title_ru]);
  }
  assert.deepEqual(violations, []);
});

test('Malta Researcher user copy is Russian-first in every visible section', () => {
  const researcher = malta.routes.find(({ route_id }) => route_id === 'MT_RESEARCHER');
  assert.equal(researcher.basis_ru, 'Работа исследователем в одобренной исследовательской организации на основании соглашения о приёме исследователя по S.L. 217.22.');
  assert.equal(researcher.requirements[0].condition_ru, 'Нужны одобренная исследовательская организация и соглашение о приёме исследователя.');
  assert.match(researcher.processing_time.official_rule_ru, /90 дней/u);
  assert.doesNotMatch(researcher.applicant_work_rights.employment.rule_ru, /approved|teaching|unrelated/iu);
  assert.doesNotMatch(researcher.long_term_path.initial_status_ru, /researcher permit|hosting agreement|mobility programmes/iu);
});
