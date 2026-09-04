import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { calculateActiveCountry } from '../js/engine/rp4-engine.js';

const za = JSON.parse(await readFile(new URL('../data/ZA-research-v4.0.json', import.meta.url), 'utf8'));
const active = JSON.parse(await readFile(new URL('../data/active-countries.json', import.meta.url), 'utf8'));
const qualityOfLife = JSON.parse(await readFile(new URL('../data/quality-of-life-ru.json', import.meta.url), 'utf8'));
const context = { fx: { base_currency: 'USD', rates: { USD: 1, ZAR: 18 }, source: 'test', as_of: '2026-08-27' } };
const profile = ({ type = 'REMOTE_EMPLOYMENT', amount = 0, savings = 0, partner = false, relationship = 'MARRIED', children = [] } = {}) => ({
  citizenships: ['RU'], residence: { current_country: 'RU', current_status: 'CITIZEN' },
  application_preferences: { methods: ['FROM_ABROAD'] },
  family: { adults_count: partner ? 2 : 1, adult_ages: partner ? [35, 35] : [35], partner_included: partner, relationship_type: partner ? relationship : null, children: children.map((age_years) => ({ age_years })), school_needed: children.length > 0 },
  lgbt: { enabled: false, consent_for_personalization: false, family_recognition_relevant: null, safety_relevant: null },
  income: { primary: { owner: 'APPLICANT', type, source_geography: 'SINGLE_COUNTRY', country_id: 'US', monthly_total: { amount, currency: 'ZAR' }, monthly_provable: { amount, currency: 'ZAR' } }, additional_sources: [], partner: { has_income: false, sources: [] }, savings: { amount: savings, currency: 'ZAR' } },
  investment_capital: null, goal: { long_term: 'TEMPORARY_RESIDENCE_SUFFICIENT', keep_russian_citizenship: 'NOT_REQUIRED' }, pets: { types: ['NONE'], dogs: [], other_pet_notes: null }, special_circumstances: ['NONE'], route_specific_answers: {},
});
const result = (options, id) => calculateActiveCountry(profile(options), za, context).routes.find(({ routeId }) => routeId === id);
const route = (id) => za.routes.find(({ route_id }) => route_id === id);

test('ZA package has full Canon coverage, product-hidden narrow routes and production activation', () => {
  assert.equal(za.route_coverage.length, 13);
  assert.equal(za.routes.filter(({ publishable }) => publishable).length, 9);
  for (const id of ['ZA_ICT', 'ZA_RELATIVE', 'ZA_SA_SPOUSE_LIFE_PARTNER', 'ZA_ASYLUM']) assert.equal(route(id).publishable, false, id);
  for (const id of ['ZA_REMOTE_WORK', 'ZA_GENERAL_WORK', 'ZA_CRITICAL_SKILLS_WORK', 'ZA_BUSINESS', 'ZA_RETIRED', 'ZA_FINANCIALLY_INDEPENDENT_PR', 'ZA_STUDY', 'ZA_EXCHANGE', 'ZA_TREATY']) assert.equal(route(id).publishable, true, id);
  assert.equal(za.open_items.find(({ item_id }) => item_id === 'ZA_RG_01').blocks_publication, true);
  assert.equal(active.some(({ code }) => code === 'ZA'), true);
});

test('remote work uses only foreign remote employment and exact annual R650,976 threshold without family top-up', () => {
  assert.equal(result({ amount: 54247.99 }, 'ZA_REMOTE_WORK').routeStatus, 'UNSUITABLE');
  assert.equal(result({ amount: 54248 }, 'ZA_REMOTE_WORK').routeStatus, 'SUITABLE');
  assert.equal(result({ amount: 54248, partner: true, children: [7] }, 'ZA_REMOTE_WORK').routeStatus, 'SUITABLE');
  assert.equal(result({ type: 'FREELANCE_OR_SELF_EMPLOYED', amount: 100000 }, 'ZA_REMOTE_WORK').routeStatus, 'UNSUITABLE');
});

test('unasked future work, business, study and sponsor facts remain conditions, never current-income failures', () => {
  for (const id of ['ZA_GENERAL_WORK', 'ZA_CRITICAL_SKILLS_WORK', 'ZA_BUSINESS', 'ZA_STUDY', 'ZA_EXCHANGE', 'ZA_TREATY']) {
    assert.equal(result({ amount: 0, savings: 0 }, id).routeStatus, 'SUITABLE_WITH_CONDITIONS', id);
  }
  const capital = route('ZA_BUSINESS').requirements.find(({ requirement_id }) => requirement_id === 'ZA_BUSINESS_CAPITAL');
  assert.equal(capital.evaluation_mode, 'UNASKED_CONDITION');
  assert.equal(capital.financial.alternatives[0].asked_in_questionnaire, false);
  assert.equal(capital.financial.alternatives[0].kind, 'CAPITAL');
  const sponsor = route('ZA_RELATIVE').requirements.find(({ requirement_id }) => requirement_id === 'ZA_REL_SPONSOR');
  assert.equal(sponsor.financial.alternatives[0].asked_in_questionnaire, false);
});

test('financially independent PR never interprets R12m as savings/capital or emits a financial verdict', () => {
  const fi = route('ZA_FINANCIALLY_INDEPENDENT_PR');
  const wealth = fi.requirements.find(({ requirement_id }) => requirement_id === 'ZA_FI_NET_WORTH');
  const payment = fi.requirements.find(({ requirement_id }) => requirement_id === 'ZA_FI_PAYMENT');
  assert.equal(wealth.type, 'OTHER_BASIS');
  assert.equal(wealth.evaluation_mode, 'UNASKED_CONDITION');
  assert.equal(wealth.financial, undefined);
  assert.match(wealth.condition_ru, /net worth.+\{display_amount\}/u);
  assert.deepEqual(wealth.display_amount, { amount: 12000000, currency: 'ZAR' });
  assert.deepEqual(payment.display_amount, { amount: 120000, currency: 'ZAR', period: 'ONE_TIME' });
  assert.equal(payment.evaluation_mode, 'DISPLAY_ONLY');
  for (const savings of [0, 11999999, 12000000, 99999999]) {
    const calculated = result({ savings }, 'ZA_FINANCIALLY_INDEPENDENT_PR');
    assert.equal(calculated.routeStatus, 'SUITABLE_WITH_CONDITIONS');
    assert.equal(calculated.financialSummary, null);
  }
});

test('retired route screens only qualifying applicant recurring income at R37,000', () => {
  assert.equal(result({ type: 'PENSION', amount: 36999, savings: 99999999 }, 'ZA_RETIRED').routeStatus, 'UNSUITABLE');
  assert.equal(result({ type: 'PENSION', amount: 37000 }, 'ZA_RETIRED').routeStatus, 'SUITABLE');
  assert.equal(result({ type: 'REMOTE_EMPLOYMENT', amount: 100000 }, 'ZA_RETIRED').routeStatus, 'UNSUITABLE');
});

test('generic dependent-child family scenarios stop at 17 and reconciled city roles/cost baskets remain canonical', () => {
  for (const r of za.routes.filter(({ route_id }) => route_id !== 'ZA_ASYLUM')) {
    const child = r.family_scenarios.find(({ applies_to }) => applies_to === 'CHILD');
    assert.equal(child.child_age_max, 17, r.route_id);
  }
  assert.deepEqual(za.cities.map(({ structural_roles }) => structural_roles), [['LARGE'], ['CAPITAL', 'LARGE'], ['MEDIUM'], ['SMALL']]);
  for (const city of za.cities) assert.deepEqual(city.cost_components.map(({ component }) => component), ['RENT_STANDARD', 'UTILITIES', 'GROCERIES', 'TRANSPORT']);
  assert.match(za.cities.find(({ city_id }) => city_id === 'ZA_PRETORIA').size_basis_ru, /Кейптаун.+законодательную.+Блумфонтейн.+судебную/u);
});

test('Russian entry is visa-free for 90 days but does not authorize long-stay activity', () => {
  assert.equal(za.entry_for_russian_citizen.visa_required, false);
  assert.equal(za.entry_for_russian_citizen.maximum_stay_days, 90);
  assert.match(za.entry_for_russian_citizen.rule_ru, /не разрешение на работу, учёбу/u);
});

test('General Work keeps future offer and 100 points unasked with both official salary figures traceable', () => {
  const general = route('ZA_GENERAL_WORK');
  const offer = general.requirements.find(({ requirement_id }) => requirement_id === 'ZA_GW_OFFER');
  const points = general.requirements.find(({ requirement_id }) => requirement_id === 'ZA_GW_POINTS');
  assert.equal(offer.evaluation_mode, 'UNASKED_CONDITION');
  assert.equal(offer.requires_separate_basis, true);
  assert.equal(points.evaluation_mode, 'UNASKED_CONDITION');
  assert.match(points.condition_ru, /100 баллов/u);
  assert.match(points.condition_ru, /R650,976–R976,194/u);
  assert.match(points.condition_ru, /R650,796/u);
  for (const amount of [0, 650796, 650976, 976194, 9999999]) {
    assert.equal(result({ amount }, 'ZA_GENERAL_WORK').routeStatus, 'SUITABLE_WITH_CONDITIONS');
    assert.equal(result({ amount }, 'ZA_GENERAL_WORK').financialSummary, null);
  }
});

test('Study keeps NO_FIXED_THRESHOLD practical guidance display-only without NaN or a false verdict', () => {
  const funds = route('ZA_STUDY').requirements.find(({ requirement_id }) => requirement_id === 'ZA_STUDY_FUNDS');
  const alternative = funds.financial.alternatives[0];
  assert.equal(alternative.comparison, 'NO_FIXED_THRESHOLD');
  assert.equal(alternative.amount, null);
  assert.equal(alternative.currency, null);
  assert.equal(alternative.practical_financial_guidance.evaluation_mode, 'DISPLAY_ONLY');
  assert.equal(alternative.practical_financial_guidance.figures[0].amount, 3000);
  const calculated = result({ amount: 9999999, savings: 9999999 }, 'ZA_STUDY');
  assert.equal(calculated.routeStatus, 'SUITABLE_WITH_CONDITIONS');
  assert.equal(calculated.financialSummary.state, 'UNKNOWN');
  assert.equal(calculated.financialSummary.alternatives[0].threshold, null);
  assert.equal(JSON.stringify(calculated).includes('NaN'), false);
});

test('route-specific protection blocker remains non-country-blocking and asylum stays unpublished', () => {
  const protection = za.completeness.blocks.find(({ block }) => block === 'PROTECTION');
  const gap = za.open_items.find(({ item_id }) => item_id === 'ZA_RG_01');
  assert.equal(protection.status, 'PARTIAL_NON_BLOCKING');
  assert.equal(gap.related_route_id, 'ZA_ASYLUM');
  assert.equal(gap.blocks_publication, true);
  assert.match(gap.missing_ru, /маршрута убежища.+необходимый для публикации этого маршрута/u);
  assert.equal(route('ZA_ASYLUM').publishable, false);
  assert.notEqual(za.completeness.country_ready_status, 'BLOCKED');
});

test('spouse and permanent-partner research is preserved but the narrow family route is not published', () => {
  const spouse = route('ZA_SA_SPOUSE_LIFE_PARTNER');
  const basis = spouse.requirements.find(({ requirement_id }) => requirement_id === 'ZA_SPOUSE_BASIS');
  assert.equal(spouse.publishable, false);
  assert.match(basis.condition_ru, /зарегистрированное партнёрство не считается браком автоматически/u);
  assert.match(spouse.requirements.find(({ requirement_id }) => requirement_id === 'ZA_SPOUSE_EVIDENCE').condition_ru, /постоянного партнёрства/u);
  assert.equal(calculateActiveCountry(profile({ partner: true, relationship: 'MARRIED' }), za, context).routes.some(({ routeId }) => routeId === 'ZA_SA_SPOUSE_LIFE_PARTNER'), false);
});

test('application channels are visible and asylum uses only the in-country protection mechanism', () => {
  for (const item of za.routes.filter(({ publishable }) => publishable)) {
    assert.ok(item.application_methods.some(({ availability }) => availability === 'AVAILABLE'), item.route_id);
    assert.ok(item.application_methods.some(({ method }) => ['ORIGIN_COUNTRY', 'CURRENT_LEGAL_RESIDENCE'].includes(method)), item.route_id);
  }
  assert.deepEqual(route('ZA_ASYLUM').application_methods.map(({ method }) => method), ['IN_COUNTRY']);
  assert.equal(route('ZA_ASYLUM').application_methods[0].availability, 'AVAILABLE');
});

test('current engine preserves supported application methods and presentation labels', () => {
  const calculated = calculateActiveCountry(profile(), za, context);
  assert.equal(calculated.routes.length, 9);
  for (const item of calculated.routes) {
    assert.ok(item.application.length > 0, item.routeId);
    for (const method of item.application) {
      assert.ok(['ORIGIN_COUNTRY', 'CURRENT_LEGAL_RESIDENCE', 'IN_COUNTRY'].includes(method.method), `${item.routeId}/${method.method}`);
      assert.equal(typeof method.methodLabel, 'string');
      assert.ok(method.methodLabel.length > 0);
    }
  }
  assert.ok(za.routes.some(({ application_methods }) => application_methods.some(({ applicant_status_requirement }) => applicant_status_requirement === 'CITIZEN_OR_RESIDENT')));
  assert.ok(za.routes.some(({ application_methods }) => application_methods.some(({ applicant_status_requirement }) => applicant_status_requirement === 'PHYSICAL_PRESENCE')));
});

test('financially independent direct PR has internally consistent citizenship residence semantics', () => {
  const path = route('ZA_FINANCIALLY_INDEPENDENT_PR').long_term_path;
  assert.equal(path.pr_path_status, 'DIRECT');
  assert.equal(path.years_to_pr, 0);
  assert.equal(path.residence_counts_for_pr, 'YES');
  assert.equal(path.years_to_citizenship, 5);
  assert.equal(path.residence_counts_for_citizenship, 'YES');
  assert.equal(route('ZA_SA_SPOUSE_LIFE_PARTNER').long_term_path.years_to_pr, null);
});

test('coverage explanations are Russian presentation copy without internal category enums', () => {
  const internalEnums = za.route_coverage.map(({ category }) => category);
  for (const item of za.route_coverage) {
    for (const value of internalEnums) assert.equal(item.explanation_ru.includes(value), false, item.category);
  }
});

test('each school tuition observation resolves only to its school-owned source set', () => {
  const sources = new Map(za.sources.map((item) => [item.source_id, item]));
  const expected = {
    'American International School of Johannesburg': ['ZA_S37_AISJ'],
    'International School of Cape Town': ['ZA_S38_ISCT'],
    'Crawford International Pretoria': ['ZA_S64_CRAWFORD'],
    'Curro Westbrook': ['ZA_S64_CURRO_PRIMARY', 'ZA_S64_CURRO_HIGH'],
    'Glenwood House': ['ZA_S64_GLENWOOD'],
  };
  for (const observation of za.schools.international_school_tuition_observations) {
    for (const id of observation.source_ids) {
      assert.ok(sources.has(id), id);
      assert.ok(expected[observation.school_name_ru].includes(id), `${observation.school_name_ru}/${id}`);
      assert.equal(sources.get(id).source_type, 'RELIABLE_SECONDARY');
    }
  }
  const isctFinals = za.schools.international_school_tuition_observations.filter(({ school_name_ru, grade_stage }) => school_name_ru === 'International School of Cape Town' && grade_stage === 'FINAL_GRADE');
  for (const observation of isctFinals) {
    const supportingText = observation.source_ids.map((id) => sources.get(id)?.supports_ru || '').join(' ');
    assert.match(supportingText, /фиксированн.+итогов.+год/u, 'ISCT FINAL_GRADE requires an explicitly published fixed annual total');
    assert.doesNotMatch(supportingText, /за предмет/u, 'per-subject Year 13 fee must not be converted to a fixed annual total');
  }
});

test('all user-facing Russian strings reject known replacement artifacts and repeated words', () => {
  const broken = /(постоянный\s+постоянный\s+партнёр|permanent\s+постоянный\s+партнёрship|партнёрship)/iu;
  const meaninglessRepeat = /\b([А-ЯЁа-яё-]{4,})\s+\1\b/iu;
  const visit = (value, path = '$') => {
    if (Array.isArray(value)) return value.forEach((item, index) => visit(item, `${path}[${index}]`));
    if (!value || typeof value !== 'object') return;
    for (const [key, item] of Object.entries(value)) {
      if (key.endsWith('_ru') && typeof item === 'string') {
        assert.doesNotMatch(item, broken, `${path}.${key}`);
        assert.doesNotMatch(item, meaninglessRepeat, `${path}.${key}`);
      }
      visit(item, `${path}.${key}`);
    }
  };
  visit(za);
});

test('city populations use one official Stats SA municipality basis without agglomeration substitution', () => {
  const sources = new Map(za.sources.map((item) => [item.source_id, item]));
  const expected = [
    ['ZA_JOHANNESBURG', 4803262, 'ZA_POP_JHB_2022'],
    ['ZA_PRETORIA', 4040315, 'ZA_POP_TSHWANE_2022'],
    ['ZA_GQEBERHA', 1190496, 'ZA_POP_NMB_2022'],
    ['ZA_GEORGE', 294929, 'ZA_POP_GEORGE_2022'],
  ];
  for (const [cityId, population, sourceId] of expected) {
    const city = za.cities.find(({ city_id }) => city_id === cityId);
    assert.equal(city.population_municipality, population);
    assert.equal(city.population_agglomeration, null);
    assert.ok(city.source_ids.includes(sourceId));
    assert.equal(sources.get(sourceId).source_type, 'OFFICIAL_STATISTICS');
    assert.equal(sources.get(sourceId).authority, 'Statistics South Africa');
    assert.match(city.size_basis_ru, /муниципал/u);
  }
  for (const id of ['ZA_CITY_JHB', 'ZA_CITY_PRETORIA', 'ZA_CITY_GQEBERHA', 'ZA_CITY_GEORGE']) {
    assert.match(sources.get(id).supports_ru, /не используется как демографическая основа/u);
  }
});

test('researched empty legacy school and LGBT city containers remain valid', () => {
  assert.deepEqual(za.schools.international_schools, []);
  assert.deepEqual(za.lgbt.friendly_cities, []);
});

test('SARS 2027 personal income tax table preserves all seven marginal bands and formulas', () => {
  const rates = za.taxes.personal_income_tax_rates;
  assert.equal(rates.length, 7);
  assert.deepEqual(rates.map(({ rate_percent }) => rate_percent), [18, 26, 31, 36, 39, 41, 45]);
  assert.deepEqual(rates.map(({ from_amount }) => from_amount), [1, 245101, 383101, 530201, 695801, 887001, 1878601]);
  assert.equal(rates.at(-1).to_amount, null);
  assert.match(rates[1].rule_ru, /R44 118.+26%.+R245 100/u);
  assert.match(rates.at(-1).rule_ru, /R666 339.+45%.+R1 878 600/u);
  assert.ok(rates.every(({ source_ids }) => source_ids.includes('ZA_SARS_PIT_2027')));
});

test('prescribed R37k, R12m net worth and R120k payment resolve to their correct Gazette notices', () => {
  const retired = route('ZA_RETIRED').requirements.find(({ requirement_id }) => requirement_id === 'ZA_RETIRED_INCOME');
  const fi = route('ZA_FINANCIALLY_INDEPENDENT_PR');
  assert.ok(retired.source_ids.includes('ZA_GAZETTE_451'));
  assert.ok(retired.financial.alternatives[0].source_ids.includes('ZA_GAZETTE_451'));
  assert.deepEqual(fi.requirements.find(({ requirement_id }) => requirement_id === 'ZA_FI_NET_WORTH').source_ids, ['ZA_GAZETTE_454']);
  assert.deepEqual(fi.requirements.find(({ requirement_id }) => requirement_id === 'ZA_FI_PAYMENT').source_ids, ['ZA_GAZETTE_454']);
});



test('current product publication policy hides narrow ICT and standalone special-family routes', () => {
  for (const id of ['ZA_ICT', 'ZA_RELATIVE', 'ZA_SA_SPOUSE_LIFE_PARTNER']) {
    assert.equal(route(id).publishable, false, id);
    assert.equal(calculateActiveCountry(profile(), za, context).routes.some(({ routeId }) => routeId === id), false, id);
  }
  assert.equal(route('ZA_CRITICAL_SKILLS_WORK').publishable, true);
  assert.equal(route('ZA_BUSINESS').publishable, true);
  assert.equal(route('ZA_STUDY').publishable, true);
});

test('ZA user-facing Russian copy contains no product self-reference', () => {
  const forbidden = /(анкета\s+(?:не\s+)?(?:спрашивает|знает|устанавливает)|Country Matcher|движк|matching|presentation[-\s]?only|engine|questionnaire)/iu;
  const violations = [];
  const walk = (value, path = '') => {
    if (Array.isArray(value)) return value.forEach((item, index) => walk(item, `${path}[${index}]`));
    if (value && typeof value === 'object') return Object.entries(value).forEach(([key, item]) => walk(item, path ? `${path}.${key}` : key));
    if (typeof value === 'string' && path.split('.').pop()?.includes('_ru') && forbidden.test(value)) violations.push({ path, value });
  };
  walk(za);
  assert.deepEqual(violations, []);
});

test('ZA keeps the locked RP4 schema and Canon revision', () => {
  assert.equal(za.schema_version, '4.0');
  assert.equal(za.canon_revision, '2026-08-08-final-lock');
});

test('ZA pet presentation is Russian-first and does not leak research sentinel values', () => {
  const imported = za.pets.import_restrictions.explanation_ru;
  const afterEntry = za.pets.after_entry_restrictions.explanation_ru;
  assert.match(imported, /ветеринарное разрешение на импорт/u);
  assert.match(imported, /ветеринарный сертификат/u);
  assert.match(imported, /титр антител к бешенству/u);
  assert.doesNotMatch(imported, /NOT_FOUND|shipment-specific|health certificate|veterinary import permit|RNATT/u);
  assert.doesNotMatch(afterEntry, /banned|property rules|NOT_FOUND/u);
  const petOpenItems = za.open_items.filter(({ block }) => block === 'PETS');
  const petOpenItemCopy = petOpenItems.flatMap(({ missing_ru, handling_ru }) => [missing_ru, handling_ru]).join(' ');
  assert.doesNotMatch(petOpenItemCopy, /NOT_FOUND|permit|property|pre-clearance|shipment|RNATT/u);
});

test('ZA has a complete presentation-only quality-of-life editorial entry', () => {
  const entry = qualityOfLife.countries.ZA;
  assert.ok(entry);
  assert.equal(entry.score, 6.5);
  assert.equal(entry.updated_at, '2026-09-03');
  assert.ok(Array.isArray(entry.narrative_ru));
  assert.ok(entry.narrative_ru.length >= 6);
  assert.match(entry.narrative_ru.join(' '), /безопасност/u);
  assert.match(entry.narrative_ru.join(' '), /частн.+медицин/u);
  assert.match(entry.narrative_ru.join(' '), /английск/u);
  assert.match(entry.formula_ru, /насильственной преступности/u);
});

test('ZA Russian copy rejects known release-blocking English fragments', () => {
  const forbidden = /(?:\band\b|residence clock|city-proper|city proper|municipality-level|пенсионные-person|admissions and fees|staffing rules|Work-visa|R650,976\/year)/iu;
  const violations = [];
  const walk = (value, path = '$') => {
    if (Array.isArray(value)) return value.forEach((item, index) => walk(item, `${path}[${index}]`));
    if (!value || typeof value !== 'object') return;
    for (const [key, item] of Object.entries(value)) {
      if (key.endsWith('_ru') && typeof item === 'string' && forbidden.test(item)) violations.push({ path: `${path}.${key}`, value: item });
      walk(item, `${path}.${key}`);
    }
  };
  walk(za);
  assert.deepEqual(violations, []);
});
