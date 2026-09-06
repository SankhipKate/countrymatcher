import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { assertActiveResearchPackage, calculateActiveCountry } from '../js/engine/rp4-engine.js';

const ireland = JSON.parse(await readFile(new URL('../data/IE-research-v4.0.json', import.meta.url), 'utf8'));
const active = JSON.parse(await readFile(new URL('../data/active-countries.json', import.meta.url), 'utf8'));
const qualityOfLife = JSON.parse(await readFile(new URL('../data/quality-of-life-ru.json', import.meta.url), 'utf8'));
const context = { fx: { base_currency: 'USD', rates: { USD: 1, EUR: 0.9 }, source: 'test', as_of: '2026-09-04' } };

const profile = ({ incomeType = 'REMOTE_EMPLOYMENT', income = 0, savings = 0, partner = false, relationship = 'MARRIED', children = [] } = {}) => ({
  citizenships: ['RU'],
  residence: { current_country: 'PH', current_status: 'LEGAL_RESIDENT' },
  application_preferences: { methods: ['FROM_ABROAD'] },
  family: {
    adults_count: partner ? 2 : 1,
    adult_ages: partner ? [35, 35] : [35],
    partner_included: partner,
    relationship_type: partner ? relationship : null,
    children: children.map((age_years) => ({ age_years })),
    school_needed: children.length > 0,
  },
  lgbt: { enabled: false, consent_for_personalization: false, family_recognition_relevant: null, safety_relevant: null },
  income: {
    primary: {
      owner: 'APPLICANT', type: incomeType, source_geography: 'SINGLE_COUNTRY', country_id: 'US',
      monthly_total: { amount: income, currency: 'EUR' }, monthly_provable: { amount: income, currency: 'EUR' },
    },
    additional_sources: [], partner: { has_income: false, sources: [] }, savings: { amount: savings, currency: 'EUR' },
  },
  investment_capital: null,
  goal: { long_term: 'TEMPORARY_RESIDENCE_SUFFICIENT', keep_russian_citizenship: 'NOT_REQUIRED' },
  pets: { types: ['NONE'], dogs: [], other_pet_notes: null },
  special_circumstances: ['NONE'],
  route_specific_answers: {},
});

const calculate = (options = {}) => calculateActiveCountry(profile(options), ireland, context);
const route = (id) => ireland.routes.find(({ route_id }) => route_id === id);
const resultRoute = (options, id) => calculate(options).routes.find(({ routeId }) => routeId === id);

test('Ireland package matches the locked RP4 contract and is production-active in 18.0.0', async () => {
  const version = (await readFile(new URL('../VERSION', import.meta.url), 'utf8')).trim();
  assert.doesNotThrow(() => assertActiveResearchPackage(ireland));
  assert.equal(version, '18.0.0');
  assert.equal(ireland.country_id, 'IE');
  assert.equal(ireland.routes.length, 8);
  assert.equal(active.some(({ code, name }) => code === 'IE' && name === 'Ирландия'), true);
});

test('publication boundary keeps two narrow routes hidden and six routes visible', () => {
  assert.deepEqual(ireland.routes.filter(({ publishable }) => !publishable).map(({ route_id }) => route_id), ['IE_ICT', 'IE_FAMILY_NON_EEA']);
  const result = calculate();
  assert.equal(result.routes.length, 6);
  assert.equal(result.routes.some(({ routeId }) => routeId === 'IE_ICT' || routeId === 'IE_FAMILY_NON_EEA'), false);
});

test('Stamp 0 screens qualifying applicant income and does not substitute savings', () => {
  assert.equal(resultRoute({ incomeType: 'PENSION', income: 4166.66, savings: 100000 }, 'IE_STAMP0_INDEPENDENT').routeStatus, 'UNSUITABLE');
  assert.equal(resultRoute({ incomeType: 'PENSION', income: 4166.67 }, 'IE_STAMP0_INDEPENDENT').routeStatus, 'SUITABLE');
  assert.equal(resultRoute({ incomeType: 'REMOTE_EMPLOYMENT', income: 10000 }, 'IE_STAMP0_INDEPENDENT').routeStatus, 'UNSUITABLE');
});

test('STEP is unavailable to Russian citizens and Study finance does not false-block sponsor or scholarship funding', () => {
  assert.equal(route('IE_STEP'), undefined);
  const entrepreneurship = ireland.route_coverage.find(({ category }) => category === 'ENTREPRENEURSHIP_SELF_EMPLOYMENT');
  assert.equal(entrepreneurship.result, 'UNAVAILABLE_TO_RU');
  assert.match(entrepreneurship.explanation_ru, /граждан России/u);

  const studyFinance = route('IE_STUDY').requirements.find(({ requirement_id }) => requirement_id === 'IE_STUDY_FIN');
  assert.equal(studyFinance.evaluation_mode, 'UNASKED_CONDITION');
  assert.equal(studyFinance.financial.model, 'SPONSOR_OR_SCHOLARSHIP');
  assert.deepEqual(studyFinance.financial.alternatives.map(({ kind }) => kind), ['SAVINGS', 'SPONSOR', 'SCHOLARSHIP']);
  assert.equal(studyFinance.financial.alternatives.find(({ kind }) => kind === 'SCHOLARSHIP').comparison, 'OFFICIAL_FORMULA');

  for (const savings of [0, 9999, 10000]) {
    const item = resultRoute({ savings }, 'IE_STUDY');
    assert.equal(item.routeStatus, 'SUITABLE_WITH_CONDITIONS', String(savings));
    assert.equal(item.blockers.length, 0, String(savings));
    assert.match(item.conditions.join(' '), /спонсор/u);
  }
});

test('future Irish employment salary remains an unasked condition', () => {
  for (const id of ['IE_CSEP', 'IE_GEP']) {
    const item = resultRoute({ income: 0, savings: 0 }, id);
    assert.equal(item.routeStatus, 'SUITABLE_WITH_CONDITIONS', id);
    assert.equal(item.blockers.length, 0, id);
  }
});

test('current family copy follows the June 2026 Non-EEA policy instead of the obsolete post-2016 blanket rule', () => {
  const registered = resultRoute({ partner: true, relationship: 'REGISTERED_PARTNERSHIP' }, 'IE_CSEP');
  assert.equal(registered.familyEvaluation.state, 'CONDITION');
  assert.match(registered.familyEvaluation.conditions.join(' '), /эквивалент брака/u);
  assert.doesNotMatch(registered.familyEvaluation.conditions.join(' '), /не признаётся автоматически/u);

  const unregistered = resultRoute({ partner: true, relationship: 'UNREGISTERED_PARTNERSHIP' }, 'IE_CSEP');
  assert.equal(unregistered.familyEvaluation.state, 'CONDITION');
  assert.match(unregistered.familyEvaluation.conditions.join(' '), /два года совместного проживания/u);
});

test('married partner gets no false instruction to enter a new marriage and child path remains direct', () => {
  const partner = resultRoute({ partner: true, relationship: 'MARRIED' }, 'IE_CSEP');
  assert.equal(partner.familyEvaluation.state, 'CONDITION');
  assert.doesNotMatch(partner.familyEvaluation.conditions.join(' '), /оформить.+брак/u);
  const child = resultRoute({ children: [13] }, 'IE_CSEP');
  assert.equal(child.familyEvaluation.state, 'PASS');
});

test('GEP family retains 12-month separation and Category C financial condition', () => {
  const item = resultRoute({ partner: true, relationship: 'MARRIED', children: [13] }, 'IE_GEP');
  assert.equal(item.familyEvaluation.state, 'CONDITION');
  assert.deepEqual([...new Set(item.familyEvaluation.separationMonthsMin)], [12]);
  assert.match(item.familyEvaluation.conditions.join(' '), /финансов/u);
});

test('Stamp 0 and ordinary Study expose explicit family blockers', () => {
  assert.equal(resultRoute({ incomeType: 'PENSION', income: 5000, partner: true }, 'IE_STAMP0_INDEPENDENT').familyEvaluation.state, 'BLOCKER');
  assert.equal(resultRoute({ savings: 10000, children: [13] }, 'IE_STUDY').familyEvaluation.state, 'BLOCKER');
});


test('adult children 18-25 have explicit researched outcomes instead of a family data-contract gap', () => {
  for (const age of [18, 19, 25]) {
    const csep = resultRoute({ children: [age] }, 'IE_CSEP');
    assert.ok(csep, `CSEP child ${age}`);
    assert.equal(csep.familyEvaluation.state, 'CONDITION', `CSEP child ${age}`);
    assert.deepEqual(csep.familyEvaluation.separationMonthsMin, [24], `CSEP child ${age}`);
    assert.match(csep.familyEvaluation.conditions.join(' '), /совершеннолетн|adult child/u);

    const gep = resultRoute({ children: [age] }, 'IE_GEP');
    assert.ok(gep, `GEP child ${age}`);
    assert.equal(gep.familyEvaluation.state, 'CONDITION', `GEP child ${age}`);
    assert.deepEqual(gep.familyEvaluation.separationMonthsMin, [60], `GEP child ${age}`);

    const researcher = resultRoute({ children: [age] }, 'IE_RESEARCHER');
    assert.ok(researcher, `Researcher child ${age}`);
    assert.equal(researcher.familyEvaluation.state, 'CONDITION', `Researcher child ${age}`);
    assert.deepEqual(researcher.familyEvaluation.separationMonthsMin, [24], `Researcher child ${age}`);

    const protection = resultRoute({ children: [age] }, 'IE_PROTECTION');
    assert.ok(protection, `Protection child ${age}`);
    assert.equal(protection.familyEvaluation.state, 'CONDITION', `Protection child ${age}`);
    assert.deepEqual(protection.familyEvaluation.separationMonthsMin, [24], `Protection child ${age}`);

    assert.equal(resultRoute({ incomeType: 'PENSION', income: 5000, children: [age] }, 'IE_STAMP0_INDEPENDENT').familyEvaluation.state, 'BLOCKER');
    assert.equal(resultRoute({ savings: 10000, children: [age] }, 'IE_STUDY').familyEvaluation.state, 'BLOCKER');
  }
});

test('every Ireland publishable route resolves the full questionnaire family domain without DATA_CONTRACT_PROBLEM', () => {
  const publishableIds = ireland.routes.filter(({ publishable }) => publishable).map(({ route_id }) => route_id);

  for (let age = 0; age <= 25; age += 1) {
    const result = calculate({ children: [age] });
    for (const id of publishableIds) {
      const item = result.routes.find(({ routeId }) => routeId === id);
      assert.ok(item, `${id} missing for child age ${age}`);
      assert.notEqual(item.familyEvaluation.state, 'DATA_CONTRACT_PROBLEM', `${id} child age ${age}`);
    }
  }

  for (const relationship of ['MARRIED', 'REGISTERED_PARTNERSHIP', 'UNREGISTERED_PARTNERSHIP']) {
    const result = calculate({ partner: true, relationship });
    for (const id of publishableIds) {
      const item = result.routes.find(({ routeId }) => routeId === id);
      assert.ok(item, `${id} missing for ${relationship}`);
      assert.notEqual(item.familyEvaluation.state, 'DATA_CONTRACT_PROBLEM', `${id} ${relationship}`);
    }
  }

  const mixed = calculate({ partner: true, relationship: 'UNREGISTERED_PARTNERSHIP', children: [0, 17, 18, 25] });
  for (const id of publishableIds) {
    const item = mixed.routes.find(({ routeId }) => routeId === id);
    assert.ok(item, `${id} missing for mixed family`);
    assert.notEqual(item.familyEvaluation.state, 'DATA_CONTRACT_PROBLEM', `${id} mixed family`);
  }
});

test('Ireland adult-child evidence and direct relationship coverage are pinned in RP4', () => {
  assert.ok(ireland.sources.some(({ source_id }) => source_id === 'IE_SRC_AGE_MAJORITY'));
  for (const item of ireland.routes) {
    const partnerScenarios = item.family_scenarios.filter(({ applies_to }) => applies_to === 'PARTNER' || applies_to === 'PARTNER_AND_CHILDREN');
    for (const relationship of ['MARRIED', 'REGISTERED_PARTNERSHIP', 'UNREGISTERED_PARTNERSHIP']) {
      assert.equal(partnerScenarios.some(({ relationship_types }) => relationship_types?.includes(relationship)), true, `${item.route_id} ${relationship}`);
    }
    for (let age = 0; age <= 25; age += 1) {
      const childCovered = item.family_scenarios.some((scenario) => {
        if (scenario.applies_to !== 'CHILD' && scenario.applies_to !== 'PARTNER_AND_CHILDREN') return false;
        if (scenario.child_age_min != null && age < scenario.child_age_min) return false;
        if (scenario.child_age_max != null && age > scenario.child_age_max) return false;
        return true;
      });
      assert.equal(childCovered, true, `${item.route_id} child ${age}`);
    }
  }
});

test('Ireland entry, cities and editorial quality-of-life layer are complete', () => {
  assert.equal(ireland.entry_for_russian_citizen.visa_required, true);
  assert.deepEqual(ireland.cities.map(({ structural_roles }) => structural_roles), [['CAPITAL', 'LARGE'], ['MEDIUM'], ['SMALL']]);
  for (const city of ireland.cities) assert.deepEqual(city.cost_components.map(({ component }) => component), ['RENT_STANDARD', 'UTILITIES', 'GROCERIES', 'TRANSPORT']);
  const editorial = qualityOfLife.countries.IE;
  assert.equal(editorial.score, 8.0);
  assert.ok(editorial.narrative_ru.length >= 8);
  assert.ok(editorial.formula_ru.length > 100);
});

test('active Ireland user copy contains no product self-reference or known replacement artifacts', () => {
  const forbidden = /(?:анкета|questionnaire|product boundary|route-card|партнёрship|постоянный\s+постоянный)/iu;
  const visit = (value, key = '') => {
    if (Array.isArray(value)) return value.forEach((item) => visit(item, key));
    if (!value || typeof value !== 'object') return;
    for (const [childKey, child] of Object.entries(value)) {
      if (childKey.endsWith('_ru') && typeof child === 'string') assert.doesNotMatch(child, forbidden, childKey);
      else visit(child, childKey);
    }
  };
  visit(ireland);
});
