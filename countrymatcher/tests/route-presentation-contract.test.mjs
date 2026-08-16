import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import { calculateActiveCountry, deriveRoutePresentationGroup } from '../js/engine/rp4-engine.js';
import { ROUTE_STATUSES } from '../js/engine/status-contract.js';
import { ROUTE_PRESENTATION_LABELS_RU, ROUTE_PRESENTATION_RANK } from '../js/engine/route-presentation-contract.js';

const schema = JSON.parse(await readFile(new URL('../data/research-package-v4.0.schema.json', import.meta.url), 'utf8'));
const spain = JSON.parse(await readFile(new URL('../data/ES-research-v4.0.json', import.meta.url), 'utf8'));
const argentina = JSON.parse(await readFile(new URL('../data/AR-research-v4.0.json', import.meta.url), 'utf8'));
const uruguay = JSON.parse(await readFile(new URL('../data/UY-research-v4.0.json', import.meta.url), 'utf8'));
const brazil = JSON.parse(await readFile(new URL('../data/BR-research-v4.0.json', import.meta.url), 'utf8'));
const ajv = new Ajv2020({ allErrors: true, strict: false });
addFormats(ajv);
ajv.addSchema(schema);
const validateRequirement = ajv.getSchema(`${schema.$id}#/$defs/routeRequirement`);
const validateRoute = ajv.getSchema(`${schema.$id}#/$defs/route`);
const context = { fx: { base_currency: 'USD', rates: { USD: 1, EUR: 0.9, ARS: 1500, BRL: 5.4, UYU: 40 }, as_of: '2026-08-15', source: 'test' } };

const incomeSource = (type, amount, currency = 'USD', countryId = 'US') => ({
  owner: 'APPLICANT', type, source_geography: 'SINGLE_COUNTRY', country_id: countryId,
  monthly_total: { amount, currency }, monthly_provable: { amount, currency },
});
const profile = ({ type = 'REMOTE_EMPLOYMENT', amount = 6000, currency = 'USD' } = {}) => ({
  residence: { current_country: 'RU', current_status: 'CITIZEN' },
  family: { adults_count: 1, adult_ages: [35], partner_included: false, relationship_type: null, children: [], school_needed: false },
  income: { primary: incomeSource(type, amount, currency), additional_sources: [], partner: { has_income: false, sources: [] }, savings: null },
  investment_capital: null,
  goal: { long_term: 'TEMPORARY_RESIDENCE_SUFFICIENT', keep_russian_citizenship: 'NOT_REQUIRED' },
  pets: { types: ['NONE'], dogs: [], other_pet_notes: null },
});
const routeById = (result, routeId) => result.routes.find((route) => route.routeId === routeId);
const requirementById = (pkg, requirementId) => pkg.routes.flatMap(({ requirements = [] }) => requirements
  .filter(({ requirement_id }) => requirement_id === requirementId))[0];

test('requires_separate_basis schema is optional true-only and limited to UNASKED_CONDITION', () => {
  const unasked = structuredClone(requirementById(spain, 'ES_EMP_OFFER'));
  unasked.requires_separate_basis = true;
  assert.equal(validateRequirement(unasked), true, JSON.stringify(validateRequirement.errors));
  unasked.requires_separate_basis = false;
  assert.equal(validateRequirement(unasked), false);

  for (const requirementId of ['ES_DNV_FIN', 'ES_DNV_BASIS']) {
    const invalid = structuredClone(requirementById(spain, requirementId));
    assert.ok(['ENGINE', 'DISPLAY_ONLY'].includes(invalid.evaluation_mode));
    invalid.requires_separate_basis = true;
    assert.equal(validateRequirement(invalid), false, requirementId);
  }
});

test('active packages mark exactly the approved 20 separate-basis requirements', () => {
  const expected = [
    'ES_EMP_OFFER', 'ES_SELF_PROJECT', 'ES_FAMSP_BASIS', 'ES_STUDY_ADMIT', 'ES_ENT_PROJECT', 'ES_BLUE_JOB',
    'ES_HQPN_JOB', 'ES_ICT_BASIS', 'ES_REUN_BASIS', 'ES_RES_BASIS', 'ES_AUDIO_BASIS', 'ES_INT_BASIS',
    'AR_WORKER_OFFER', 'AR_SPEC_BASIS', 'AR_STUDY_ADMISSION', 'AR_FAMILY_BASIS',
    'UY_WORK_BASIS', 'UY_STUDY_ADMISSION', 'UY_SPECIALIST_BASIS', 'UY_URUGUAYAN_LINK_BASIS',
  ].sort();
  const actual = [spain, argentina, uruguay].flatMap((pkg) => pkg.routes.flatMap(({ requirements = [] }) =>
    requirements.filter(({ requires_separate_basis }) => requires_separate_basis === true).map(({ requirement_id }) => requirement_id))).sort();
  assert.deepEqual(actual, expected);
  for (const requirementId of [
    'AR_PENS_BASIS', 'ES_STUDY_FIN', 'ES_BLUE_SAL', 'ES_REUN_FIN', 'UY_WORK_FUTURE_SALARY', 'UY_STUDY_MEANS',
    'ES_PROT_RISK', 'AR_PROT_BASIS', 'UY_PROTECTION_BASIS', 'AR_HUM_BASIS', 'UY_HUMANITARIAN_BASIS',
  ]) assert.equal(requirementById(requirementId.startsWith('ES_') ? spain : requirementId.startsWith('AR_') ? argentina : uruguay, requirementId).requires_separate_basis, undefined, requirementId);
});

test('real separate-basis routes retain every ordinary financial condition', () => {
  const es = calculateActiveCountry(profile(), spain, context);
  const study = routeById(es, 'ES_STUDY');
  assert.equal(study.presentationGroup, 'REQUIRES_SEPARATE_BASIS');
  assert.ok(study.conditions.includes(requirementById(spain, 'ES_STUDY_ADMIT').condition_ru));
  assert.ok(study.conditions.includes(requirementById(spain, 'ES_STUDY_FIN').condition_ru));
  const blue = routeById(es, 'ES_HQP_BLUE');
  assert.equal(blue.presentationGroup, 'REQUIRES_SEPARATE_BASIS');
  assert.ok(blue.conditions.includes(requirementById(spain, 'ES_BLUE_JOB').condition_ru));
  assert.ok(blue.conditions.includes(requirementById(spain, 'ES_BLUE_SAL').condition_ru));

  const ar = calculateActiveCountry(profile(), argentina, context);
  assert.equal(routeById(ar, 'AR_WORKER').presentationGroup, 'REQUIRES_SEPARATE_BASIS');
  const uy = calculateActiveCountry(profile(), uruguay, context);
  const work = routeById(uy, 'UY_TEMP_WORK');
  assert.equal(work.presentationGroup, 'REQUIRES_SEPARATE_BASIS');
  assert.ok(work.conditions.includes(requirementById(uruguay, 'UY_WORK_BASIS').condition_ru));
  assert.ok(work.conditions.includes(requirementById(uruguay, 'UY_WORK_FUTURE_SALARY').condition_ru));
});

test('Argentina Pensionado remains ordinary conditional at the valid 5-SMVM threshold', () => {
  const result = calculateActiveCountry(profile({ type: 'PENSION', amount: 1883000, currency: 'ARS' }), argentina, context);
  const pensionado = routeById(result, 'AR_PENSIONADO');
  assert.equal(pensionado.routeStatus, 'SUITABLE_WITH_CONDITIONS');
  assert.equal(pensionado.presentationGroup, 'SUITABLE_WITH_CONDITIONS');
  assert.equal(requirementById(argentina, 'AR_PENS_BASIS').requires_separate_basis, undefined);
});

test('protection and explicitly marked humanitarian routes share the protection presentation group', () => {
  for (const [pkg, protectionId] of [[spain, 'ES_PROTECTION'], [argentina, 'AR_PROTECTION'], [uruguay, 'UY_PROTECTION'], [brazil, 'BR_REFUGEE_PROTECTION']]) {
    assert.equal(routeById(calculateActiveCountry(profile(), pkg, context), protectionId).presentationGroup, 'INTERNATIONAL_PROTECTION');
  }
  for (const [pkg, routeId, requirementId] of [
    [argentina, 'AR_HUMANITARIAN', 'AR_HUM_BASIS'],
    [uruguay, 'UY_HUMANITARIAN', 'UY_HUMANITARIAN_BASIS'],
  ]) {
    const route = pkg.routes.find(({ route_id }) => route_id === routeId);
    assert.equal(route.route_type, 'OTHER');
    assert.equal(route.is_humanitarian, true);
    assert.equal(requirementById(pkg, requirementId).requires_separate_basis, undefined);
    assert.equal(routeById(calculateActiveCountry(profile(), pkg, context), routeId).presentationGroup, 'INTERNATIONAL_PROTECTION');
  }
});

test('route schema accepts only explicit true for the optional humanitarian marker', () => {
  const humanitarian = structuredClone(argentina.routes.find(({ route_id }) => route_id === 'AR_HUMANITARIAN'));
  assert.equal(validateRoute(humanitarian), true, JSON.stringify(validateRoute.errors));
  humanitarian.is_humanitarian = false;
  assert.equal(validateRoute(humanitarian), false);
});

test('hard blockers outrank separate basis while protection classification has first precedence', () => {
  const requirementResult = {
    requirement: { evaluation_mode: 'UNASKED_CONDITION', requires_separate_basis: true }, effect: 'CONDITION',
  };
  assert.equal(deriveRoutePresentationGroup(
    { route_type: 'LOCAL_EMPLOYMENT' },
    { routeStatus: 'UNSUITABLE', requirementResults: [requirementResult] },
  ), 'UNSUITABLE');
  assert.equal(deriveRoutePresentationGroup(
    { route_type: 'INTERNATIONAL_PROTECTION' },
    { routeStatus: 'UNSUITABLE', requirementResults: [requirementResult] },
  ), 'INTERNATIONAL_PROTECTION');
  assert.equal(deriveRoutePresentationGroup(
    { route_type: 'OTHER', is_humanitarian: true },
    { routeStatus: 'UNSUITABLE', requirementResults: [requirementResult] },
  ), 'INTERNATIONAL_PROTECTION');
});

test('presentation contract has five labels/order while internal status contract stays three-valued', () => {
  assert.deepEqual(Object.keys(ROUTE_STATUSES).sort(), ['SUITABLE', 'SUITABLE_WITH_CONDITIONS', 'UNSUITABLE'].sort());
  assert.deepEqual(Object.entries(ROUTE_PRESENTATION_RANK).sort((a, b) => a[1] - b[1]).map(([group]) => group), [
    'SUITABLE', 'SUITABLE_WITH_CONDITIONS', 'REQUIRES_SEPARATE_BASIS', 'INTERNATIONAL_PROTECTION', 'UNSUITABLE',
  ]);
  assert.equal(ROUTE_PRESENTATION_LABELS_RU.REQUIRES_SEPARATE_BASIS, 'Требует отдельного основания');
  assert.equal(ROUTE_PRESENTATION_LABELS_RU.INTERNATIONAL_PROTECTION, 'Международная защита');
});

test('no publishable route disappears from solo presentation', () => {
  for (const pkg of [spain, argentina, uruguay, brazil]) {
    const result = calculateActiveCountry(profile(), pkg, context);
    const publishable = pkg.routes.filter(({ publishable }) => publishable).map(({ route_id }) => route_id).sort();
    assert.deepEqual(result.routes.map(({ routeId }) => routeId).sort(), publishable, pkg.country_id);
    assert.deepEqual(result.excludedRoutes, [], pkg.country_id);
    assert.equal(
      ROUTE_PRESENTATION_RANK[result.bestRoute.presentationGroup],
      Math.min(...result.routes.map(({ presentationGroup }) => ROUTE_PRESENTATION_RANK[presentationGroup])),
      `${pkg.country_id} bestRoute`,
    );
  }
});
