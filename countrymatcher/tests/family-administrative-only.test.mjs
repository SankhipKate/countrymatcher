import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateFamilyScenarios } from '../js/engine/rp4-engine.js';

const profile = {
  family: {
    adults_count: 2,
    partner_included: true,
    relationship_type: 'MARRIED',
    children: [],
  },
};

function scenario(overrides = {}) {
  return {
    scenario_id: 'ADMIN_ONLY',
    applies_to: 'PARTNER_AND_CHILDREN',
    relationship_types: ['MARRIED', 'REGISTERED_PARTNERSHIP'],
    child_age_min: 0,
    child_age_max: 17,
    simultaneous_move: 'CONDITIONAL',
    administrative_separate_filing: true,
    separate_route_required: false,
    linked_route_id: 'FAMILY_ROUTE',
    join_stage: 'AFTER_INITIAL_RESIDENCE',
    separation_months_min: null,
    separation_months_max: null,
    member_long_term_path: null,
    condition_ru: 'Отдельное административное заявление члена семьи.',
    source_ids: ['TEST_SOURCE'],
    ...overrides,
  };
}

function evaluate(value) {
  return evaluateFamilyScenarios(
    { route_id: 'MAIN_ROUTE', family_scenarios: [value] },
    profile,
    [{ route_id: 'MAIN_ROUTE' }, { route_id: 'FAMILY_ROUTE' }],
  );
}

test('administrative-only derivative family filing does not create a condition', () => {
  const result = evaluate(scenario());
  assert.equal(result.state, 'PASS');
  assert.equal(result.classification, 'SIMULTANEOUS');
  assert.equal(result.sortRank, 1);
  assert.deepEqual(result.linkedRouteIds, ['FAMILY_ROUTE']);
});

test('administrative-only same-route sequence ranks as direct family fit', () => {
  const result = evaluate(scenario({ linked_route_id: null }));
  assert.equal(result.state, 'PASS');
  assert.equal(result.classification, 'SIMULTANEOUS');
  assert.equal(result.sortRank, 0);
  assert.deepEqual(result.linkedRouteIds, []);
});

test('actual inability to move together still creates a family condition', () => {
  const result = evaluate(scenario({ simultaneous_move: 'NO' }));
  assert.equal(result.state, 'CONDITION');
  assert.equal(result.classification, 'LATER_JOIN');
  assert.equal(result.sortRank, 2);
});

test('a substantive separate route is never hidden by the administrative marker', () => {
  const result = evaluate(scenario({
    join_stage: 'WITH_INITIAL_APPLICATION',
    separate_route_required: true,
  }));
  assert.equal(result.state, 'CONDITION');
  assert.equal(result.classification, 'SEPARATE_LINKED_ROUTE');
  assert.equal(result.sortRank, 1);
});

test('AFTER_PR is a real later join even when filing is also administratively separate', () => {
  const result = evaluate(scenario({ join_stage: 'AFTER_PR' }));
  assert.equal(result.state, 'CONDITION');
  assert.equal(result.classification, 'LATER_JOIN');
  assert.equal(result.sortRank, 2);
});

test('Canon distinguishes administrative status sequence from real later family join', async () => {
  const { readFile } = await import('node:fs/promises');
  const researchStandard = await readFile(new URL('../../source-documents/canon-v4.0/COUNTRY_RESEARCH_STANDARD.md', import.meta.url), 'utf8');
  const matchingStandard = await readFile(new URL('../../source-documents/canon-v4.0/MATCHING_AND_RESULT_STANDARD.md', import.meta.url), 'utf8');
  for (const text of [researchStandard, matchingStandard]) {
    assert.match(text, /administrative_separate_filing = true/u);
    assert.match(text, /separate_route_required = false/u);
    assert.match(text, /simultaneous_move != NO/u);
    assert.match(text, /AFTER_PR/u);
    assert.match(text, /AFTER_CITIZENSHIP/u);
    assert.match(text, /SEPARATE_ROUTE/u);
  }
});
