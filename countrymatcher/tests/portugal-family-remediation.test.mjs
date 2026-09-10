import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { evaluateFamilyScenarios } from '../js/engine/rp4-engine.js';

const portugal = JSON.parse(
  await readFile(new URL('../data/PT-research-v4.0.json', import.meta.url), 'utf8'),
);

const route = (id) => portugal.routes.find(({ route_id }) => route_id === id);

const childProfile = (age) => ({
  family: {
    adults_count: 1,
    adult_ages: [40],
    partner_included: false,
    relationship_type: null,
    children: [{ age_years: age }],
    school_needed: false,
  },
});

const evaluateChild = (routeId, age) =>
  evaluateFamilyScenarios(route(routeId), childProfile(age), portugal.routes);

test('Portugal ordinary residence routes cover the full 0-25 child questionnaire domain', () => {
  const routeIds = [
    'PT_REMOTE_WORK',
    'PT_OWN_INCOME',
    'PT_EMPLOYMENT',
    'PT_INDEPENDENT',
    'PT_ENTREPRENEUR',
    'PT_STARTUP',
    'PT_HQ_NATIONAL',
    'PT_BLUE_CARD',
    'PT_RESEARCHER',
    'PT_ICT',
  ];

  for (const routeId of routeIds) {
    for (const age of [17, 18, 20, 21, 25]) {
      assert.notEqual(evaluateChild(routeId, age).state, 'DATA_CONTRACT_PROBLEM', `${routeId} age ${age}`);
    }
    const adult = evaluateChild(routeId, 25);
    assert.equal(adult.state, 'CONDITION', routeId);
    assert.match(adult.conditions.join(' '), /иждивен/u, routeId);
    assert.match(adult.conditions.join(' '), /учится/u, routeId);
  }
});

test('Portugal higher-education and protection routes keep adult-child eligibility narrow', () => {
  for (const routeId of ['PT_HIGHER_EDUCATION', 'PT_PROTECTION']) {
    for (const age of [18, 25]) {
      const result = evaluateChild(routeId, age);
      assert.equal(result.state, 'CONDITION', `${routeId} age ${age}`);
      assert.match(result.conditions.join(' '), /недееспособ/u, routeId);
      assert.match(result.conditions.join(' '), /иждивен/u, routeId);
    }
  }
});

test('Portugal EU/Portuguese family route preserves the legal under-21 boundary', () => {
  const age20 = evaluateChild('PT_EU_PORTUGUESE_FAMILY', 20);
  assert.equal(age20.state, 'CONDITION');
  assert.match(age20.conditions.join(' '), /младше 21/u);
  assert.doesNotMatch(age20.conditions.join(' '), /только при нахождении на иждивении/u);

  const age21 = evaluateChild('PT_EU_PORTUGUESE_FAMILY', 21);
  assert.equal(age21.state, 'CONDITION');
  assert.match(age21.conditions.join(' '), /только при нахождении на иждивении/u);

  const age25 = evaluateChild('PT_EU_PORTUGUESE_FAMILY', 25);
  assert.equal(age25.state, 'CONDITION');
  assert.match(age25.conditions.join(' '), /иждивении/u);
});

test('Portugal ARI adult-child rule does not invent a Portugal-only study location', () => {
  const result = evaluateChild('PT_ARI', 25);
  assert.equal(result.state, 'CONDITION');
  assert.match(result.conditions.join(' '), /продолжает обучение/u);
  assert.match(result.conditions.join(' '), /не ограничивает это обучение учебным заведением в Португалии/u);
});

test('Portugal humanitarian adult-child path remains later and linked to family reunification', () => {
  const result = evaluateChild('PT_HUMANITARIAN', 25);
  assert.equal(result.state, 'CONDITION');
  assert.equal(result.classification, 'SEPARATE_LINKED_ROUTE');
  assert.deepEqual(result.linkedRouteIds, ['PT_FAMILY_REUNIFICATION']);
  assert.match(result.conditions.join(' '), /иждивен/u);
});

test('Portugal Skilled Job Seeker explicitly carries the unresolved full family domain', () => {
  const source = route('PT_SKILLED_JOB_SEEKER');
  const family = source.family_scenarios.find(({ scenario_id }) => scenario_id === 'PT_SKILLED_JOB_SEEKER_FAMILY');
  assert.equal(family.child_age_min, 0);
  assert.equal(family.child_age_max, 25);
  assert.equal(evaluateChild('PT_SKILLED_JOB_SEEKER', 25).state, 'DATA_CONTRACT_PROBLEM');
  assert.ok(portugal.open_items.some(({ block, related_route_id, blocks_publication }) =>
    block === 'FAMILY'
    && related_route_id === 'PT_SKILLED_JOB_SEEKER'
    && blocks_publication === true));
});

test('Portugal family supporting route covers adult children without an implicit missing-scenario refusal', () => {
  for (const age of [18, 20, 21, 25]) {
    const result = evaluateChild('PT_FAMILY_REUNIFICATION', age);
    assert.equal(result.state, 'CONDITION', `age ${age}`);
    assert.notEqual(result.classification, 'DATA_CONTRACT_PROBLEM', `age ${age}`);
    assert.match(result.conditions.join(' '), /иждивен/u, `age ${age}`);
  }
});
