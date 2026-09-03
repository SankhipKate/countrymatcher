import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  evaluateFamilyScenarios,
  resolveEntryForRussianCitizen,
} from '../js/engine/rp4-engine.js';

const marriedPartnerProfile = {
  family: {
    adults_count: 2,
    partner_included: true,
    relationship_type: 'MARRIED',
    children: [],
  },
};

function scenario(overrides = {}) {
  return {
    scenario_id: 'TEST_FAMILY',
    applies_to: 'PARTNER_AND_CHILDREN',
    relationship_types: ['MARRIED', 'REGISTERED_PARTNERSHIP'],
    child_age_min: 0,
    child_age_max: 17,
    simultaneous_move: 'CONDITIONAL',
    separate_route_required: false,
    linked_route_id: null,
    join_stage: 'AFTER_INITIAL_RESIDENCE',
    separation_months_min: null,
    separation_months_max: null,
    member_long_term_path: null,
    condition_ru: 'Проверяемое семейное условие.',
    source_ids: ['TEST_SOURCE'],
    ...overrides,
  };
}

function routeWith(value) {
  return { route_id: 'TEST_ROUTE', family_scenarios: [value] };
}

function evaluate(value, extraRoutes = []) {
  return evaluateFamilyScenarios(
    routeWith(value),
    marriedPartnerProfile,
    [{ route_id: 'TEST_ROUTE' }, ...extraRoutes],
  );
}

test('admin-only sponsor-first residence sequence is PASS', () => {
  const result = evaluate(scenario({ administrative_separate_filing: true }));
  assert.equal(result.state, 'PASS');
  assert.equal(result.classification, 'SIMULTANEOUS');
  assert.equal(result.sortRank, 0);
});

test('admin-only conditional filing WITH_INITIAL_APPLICATION is PASS', () => {
  const result = evaluate(scenario({
    administrative_separate_filing: true,
    join_stage: 'WITH_INITIAL_APPLICATION',
  }));
  assert.equal(result.state, 'PASS');
  assert.equal(result.classification, 'SIMULTANEOUS');
});

test('non-admin AFTER_INITIAL_RESIDENCE remains CONDITION', () => {
  const result = evaluate(scenario());
  assert.equal(result.state, 'CONDITION');
  assert.equal(result.classification, 'LATER_JOIN');
  assert.equal(result.sortRank, 2);
});

test('admin AFTER_PR remains a real CONDITION', () => {
  const result = evaluate(scenario({
    administrative_separate_filing: true,
    join_stage: 'AFTER_PR',
  }));
  assert.equal(result.state, 'CONDITION');
  assert.equal(result.classification, 'LATER_JOIN');
  assert.equal(result.sortRank, 2);
});

test('admin AFTER_CITIZENSHIP remains a real CONDITION', () => {
  const result = evaluate(scenario({
    administrative_separate_filing: true,
    join_stage: 'AFTER_CITIZENSHIP',
  }));
  assert.equal(result.state, 'CONDITION');
  assert.equal(result.classification, 'LATER_JOIN');
  assert.equal(result.sortRank, 2);
});

test('separate_route_required stays CONDITION even with admin flag', () => {
  const result = evaluate(
    scenario({
      administrative_separate_filing: true,
      join_stage: 'WITH_INITIAL_APPLICATION',
      separate_route_required: true,
      linked_route_id: 'FAMILY_ROUTE',
    }),
    [{ route_id: 'FAMILY_ROUTE' }],
  );
  assert.equal(result.state, 'CONDITION');
  assert.equal(result.classification, 'SEPARATE_LINKED_ROUTE');
  assert.equal(result.sortRank, 1);
});

test('SEPARATE_ROUTE stays CONDITION even with admin flag', () => {
  const result = evaluate(
    scenario({
      administrative_separate_filing: true,
      join_stage: 'SEPARATE_ROUTE',
      separate_route_required: true,
      linked_route_id: 'FAMILY_ROUTE',
    }),
    [{ route_id: 'FAMILY_ROUTE' }],
  );
  assert.equal(result.state, 'CONDITION');
  assert.equal(result.classification, 'SEPARATE_LINKED_ROUTE');
  assert.equal(result.sortRank, 1);
});

test('simultaneous_move NO stays CONDITION even with admin flag', () => {
  const result = evaluate(scenario({
    administrative_separate_filing: true,
    simultaneous_move: 'NO',
  }));
  assert.equal(result.state, 'CONDITION');
  assert.equal(result.classification, 'LATER_JOIN');
  assert.equal(result.sortRank, 2);
});

test('relationship mismatch still creates CONDITION on admin-only path', () => {
  const value = scenario({ administrative_separate_filing: true });
  const profile = structuredClone(marriedPartnerProfile);
  profile.family.relationship_type = 'UNREGISTERED_PARTNERSHIP';
  const result = evaluateFamilyScenarios(
    routeWith(value),
    profile,
    [{ route_id: 'TEST_ROUTE' }],
  );
  assert.equal(result.state, 'CONDITION');
  assert.match(result.conditions.join(' '), /брак|партнёрство/u);
});

test('explicit NOT_AVAILABLE family path is a normal blocker with explanation', () => {
  const result = evaluate(scenario({
    scenario_id: 'NO_FAMILY_PATH',
    simultaneous_move: 'NO',
    join_stage: 'NOT_AVAILABLE',
    condition_ru: 'Партнёр не может присоединиться по этому маршруту.',
  }));
  assert.equal(result.state, 'BLOCKER');
  assert.equal(result.classification, 'NOT_AVAILABLE');
  assert.deepEqual(result.applicableScenarioIds, ['NO_FAMILY_PATH']);
  assert.deepEqual(result.blockers, ['Партнёр не может присоединиться по этому маршруту.']);
  assert.equal(result.dataContractProblems.length, 0);
});

test('missing family scenario remains a data-contract problem', () => {
  const value = scenario({ child_age_min: 0, child_age_max: 17 });
  const childProfile = structuredClone(marriedPartnerProfile);
  childProfile.family.partner_included = false;
  childProfile.family.relationship_type = null;
  childProfile.family.adults_count = 1;
  childProfile.family.children = [{ age_years: 18 }];
  const result = evaluateFamilyScenarios(
    routeWith(value),
    childProfile,
    [{ route_id: 'TEST_ROUTE' }],
  );
  assert.equal(result.state, 'DATA_CONTRACT_PROBLEM');
  assert.match(result.dataContractProblems.join(' '), /no applicable family scenario/u);
});

const baseEntry = {
  entry_type: 'VISA_FREE',
  visa_required: false,
  rule_ru: 'До 31 октября 2026 года — без визы до 30 дней.',
  authorization_validity_days: null,
  maximum_stay_days: 30,
  processing_time_ru: null,
  source_ids: ['CURRENT'],
  scheduled_rules: [
    {
      effective_at: '2026-11-01T00:00:00+01:00',
      entry_type: 'CONSULAR_VISA',
      visa_required: true,
      rule_ru: 'С 1 ноября 2026 года требуется виза.',
      authorization_validity_days: null,
      maximum_stay_days: 90,
      processing_time_ru: null,
      source_ids: ['FUTURE'],
    },
  ],
};

test('entry keeps base rule immediately before Montenegro cutover', () => {
  const entry = resolveEntryForRussianCitizen(baseEntry, '2026-10-31T22:59:59.999Z');
  assert.equal(entry.visa_required, false);
  assert.equal(entry.maximum_stay_days, 30);
});

test('entry switches exactly at Montenegro cutover instant', () => {
  const entry = resolveEntryForRussianCitizen(baseEntry, '2026-10-31T23:00:00.000Z');
  assert.equal(entry.visa_required, true);
  assert.equal(entry.maximum_stay_days, 90);
  assert.equal('effective_at' in entry, false);
});

test('entry resolver chooses the latest applicable scheduled rule', () => {
  const value = structuredClone(baseEntry);
  value.scheduled_rules.push({
    ...value.scheduled_rules[0],
    effective_at: '2027-01-01T00:00:00+01:00',
    maximum_stay_days: 60,
    rule_ru: 'Позднее правило.',
  });
  assert.equal(resolveEntryForRussianCitizen(value, '2026-12-31T22:59:59Z').maximum_stay_days, 90);
  assert.equal(resolveEntryForRussianCitizen(value, '2026-12-31T23:00:00Z').maximum_stay_days, 60);
});

test('entry resolver falls back to base rule if calculation date is absent/invalid', () => {
  assert.equal(resolveEntryForRussianCitizen(baseEntry, null).visa_required, false);
  assert.equal(resolveEntryForRussianCitizen(baseEntry, 'not-a-date').visa_required, false);
});

test('ME data contains derivative family mapping, real seasonal separate path, and dated entry', async () => {
  const pkg = JSON.parse(await readFile(new URL('../data/ME-research-v4.0.json', import.meta.url), 'utf8'));

  const targetIds = new Set([
    'ME_DNV_FAMILY',
    'ME_LOCAL_EMPLOYMENT_FAMILY',
    'ME_IT_EMPLOYMENT_FAMILY',
    'ME_HEALTHCARE_EMPLOYMENT_FAMILY',
    'ME_ICT_FAMILY',
    'ME_ENTREPRENEUR_DIRECTOR_FAMILY',
    'ME_PROPERTY_FAMILY',
    'ME_STUDY_FAMILY',
    'ME_CONTRACTED_SERVICES_FAMILY',
    'ME_RESEARCH_FAMILY',
    'ME_EXCHANGE_YOUTH_FAMILY',
    'ME_TRAINING_FAMILY',
    'ME_MEDICAL_FAMILY',
    'ME_HUMANITARIAN_FAMILY',
    'ME_RELIGIOUS_FAMILY',
    'ME_EVS_FAMILY',
  ]);

  const found = [];
  for (const route of pkg.routes) {
    for (const item of route.family_scenarios || []) {
      if (!targetIds.has(item.scenario_id)) continue;
      found.push(item.scenario_id);
      assert.equal(item.administrative_separate_filing, true, item.scenario_id);
      assert.equal(item.separate_route_required, false, item.scenario_id);
      assert.equal(item.join_stage, 'AFTER_INITIAL_RESIDENCE', item.scenario_id);
      assert.notEqual(item.simultaneous_move, 'NO', item.scenario_id);
      assert.equal(item.linked_route_id, 'ME_FAMILY', item.scenario_id);
    }
  }
  assert.equal(new Set(found).size, targetIds.size);

  const seasonal = pkg.routes.flatMap((route) => route.family_scenarios || [])
    .find((item) => item.scenario_id === 'ME_SEASONAL_EMPLOYMENT_FAMILY');
  assert.ok(seasonal);
  assert.equal(seasonal.simultaneous_move, 'NO');
  assert.equal(seasonal.separate_route_required, true);
  assert.equal(seasonal.join_stage, 'SEPARATE_ROUTE');
  assert.ok(seasonal.member_long_term_path);

  const future = pkg.entry_for_russian_citizen.scheduled_rules
    .find((item) => item.effective_at === '2026-11-01T00:00:00+01:00');
  assert.ok(future);
  assert.equal(future.entry_type, 'CONSULAR_VISA');
  assert.equal(future.visa_required, true);
  assert.equal(future.maximum_stay_days, 90);
});

test('scheduled entry schema is optional on base entry and complete per scheduled record', async () => {
  const schema = JSON.parse(await readFile(new URL('../data/research-package-v4.0.schema.json', import.meta.url), 'utf8'));
  const entryDef = schema.$defs.entryForRussianCitizen;
  assert.equal(entryDef.required.includes('scheduled_rules'), false);
  assert.equal(entryDef.properties.scheduled_rules.items.$ref, '#/$defs/scheduledEntryRule');

  const required = new Set(schema.$defs.scheduledEntryRule.required);
  for (const field of [
    'effective_at',
    'entry_type',
    'visa_required',
    'rule_ru',
    'authorization_validity_days',
    'maximum_stay_days',
    'processing_time_ru',
    'source_ids',
  ]) assert.ok(required.has(field), field);
});
