import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { evaluateFamilyScenarios } from '../js/engine/rp4-engine.js';

const paraguay = JSON.parse(
  await readFile(new URL('../data/PY-research-v4.0.json', import.meta.url), 'utf8'),
);

const route = (id) => paraguay.routes.find(({ route_id }) => route_id === id);

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

const partnerProfile = (relationshipType = 'MARRIED') => ({
  family: {
    adults_count: 2,
    adult_ages: [40, 40],
    partner_included: true,
    relationship_type: relationshipType,
    children: [],
    school_needed: false,
  },
});

const evaluateChild = (routeId, age) =>
  evaluateFamilyScenarios(route(routeId), childProfile(age), paraguay.routes);

test('Paraguay ordinary temporary residence closes ages 18-25 only through the adult-disabled-child condition', () => {
  for (const age of [18, 20, 21, 25]) {
    const result = evaluateChild('PY_GENERAL_TEMPORARY', age);
    assert.equal(result.state, 'CONDITION', `age ${age}`);
    assert.equal(result.classification, 'CONDITIONAL_SIMULTANEOUS', `age ${age}`);
    assert.match(result.conditions.join(' '), /инвалид/u, `age ${age}`);
  }
});

test('Paraguay investor and hidden family routes use the linked general route for adult disabled children', () => {
  for (const routeId of ['PY_INVESTOR_PASS', 'PY_FAMILY_PARAGUAYAN', 'PY_FAMILY_REPATRIATED']) {
    for (const age of [18, 25]) {
      const result = evaluateChild(routeId, age);
      assert.equal(result.state, 'CONDITION', `${routeId} age ${age}`);
      assert.equal(result.classification, 'SEPARATE_LINKED_ROUTE', `${routeId} age ${age}`);
      assert.deepEqual(result.linkedRouteIds, ['PY_GENERAL_TEMPORARY'], `${routeId} age ${age}`);
      assert.match(result.conditions.join(' '), /инвалид/u, `${routeId} age ${age}`);
    }
  }
});

test('Paraguay protection covers descendants through age 25 without diverting them to ordinary residence', () => {
  for (const age of [0, 17, 18, 21, 25]) {
    const result = evaluateChild('PY_PROTECTION', age);
    assert.equal(result.state, 'PASS', `age ${age}`);
    assert.equal(result.classification, 'SIMULTANEOUS', `age ${age}`);
    assert.deepEqual(result.linkedRouteIds, [], `age ${age}`);
  }
});

test('Paraguay protection spouse/de-facto family extension is not represented as a separate ordinary-residence route', () => {
  for (const relationshipType of ['MARRIED', 'REGISTERED_PARTNERSHIP', 'UNREGISTERED_PARTNERSHIP']) {
    const result = evaluateFamilyScenarios(route('PY_PROTECTION'), partnerProfile(relationshipType), paraguay.routes);
    assert.equal(result.state, 'PASS', relationshipType);
    assert.equal(result.classification, 'SIMULTANEOUS', relationshipType);
    assert.deepEqual(result.linkedRouteIds, [], relationshipType);
  }
});

test('Paraguay family coverage has no implicit 18-25 data-contract hole in any route', () => {
  for (const { route_id: routeId } of paraguay.routes) {
    for (const age of [18, 20, 21, 25]) {
      assert.notEqual(evaluateChild(routeId, age).state, 'DATA_CONTRACT_PROBLEM', `${routeId} age ${age}`);
    }
  }
});
