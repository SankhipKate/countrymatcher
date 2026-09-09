import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const load = async (code) => JSON.parse(await readFile(new URL(`../data/${code}-research-v4.0.json`, import.meta.url), 'utf8'));
const [argentina, uruguay, france] = await Promise.all(['AR', 'UY', 'FR'].map(load));

test('Argentina resolves adult disabled children and unregistered-partner formalization on researched routes', () => {
  for (const route of argentina.routes.filter(({ route_id }) => !['AR_PROTECTION', 'AR_INVESTOR_HIDDEN'].includes(route_id))) {
    assert.ok(route.family_scenarios.some(({ applies_to, child_age_min, child_age_max }) =>
      applies_to === 'CHILD' && child_age_min === 18 && child_age_max === 25), route.route_id);
    assert.ok(route.family_scenarios.some(({ applies_to, relationship_types }) =>
      applies_to === 'PARTNER' && relationship_types?.includes('UNREGISTERED_PARTNERSHIP')), route.route_id);
  }
});

test('Argentina unresolved hidden investor family domain is bound to a blocking FAMILY item', () => {
  const route = argentina.routes.find(({ route_id }) => route_id === 'AR_INVESTOR_HIDDEN');
  assert.equal(route.publishable, false);
  assert.equal(route.family_scenarios[0].join_stage, 'NOT_RESEARCHED');
  assert.ok(argentina.open_items.some(({ block, related_route_id, blocks_publication }) =>
    block === 'FAMILY' && related_route_id === route.route_id && blocks_publication === true));
});

test('Uruguay preserves direct relationship scenarios and covers adult disabled children', () => {
  for (const route of uruguay.routes) {
    const relationships = new Set(route.family_scenarios.flatMap(({ relationship_types }) => relationship_types ?? []));
    assert.deepEqual([...relationships].sort(), ['MARRIED', 'REGISTERED_PARTNERSHIP', 'UNREGISTERED_PARTNERSHIP']);
    const ages = new Set();
    for (const item of route.family_scenarios.filter(({ applies_to }) => applies_to === 'CHILD' || applies_to === 'PARTNER_AND_CHILDREN')) {
      for (let age = item.child_age_min ?? 0; age <= (item.child_age_max ?? 25); age += 1) ages.add(age);
    }
    assert.equal(ages.size, 26, route.route_id);
  }
});

test('France keeps marriage distinct while representing registered and unregistered private-family paths', () => {
  for (const route of france.routes.filter(({ route_id }) => route_id !== 'FR_ASYLUM')) {
    const privatePath = route.family_scenarios.find(({ scenario_id }) => scenario_id.endsWith('_PRIVATE_FAMILY_TIES_PARTNER'));
    assert.deepEqual(privatePath.relationship_types, ['REGISTERED_PARTNERSHIP', 'UNREGISTERED_PARTNERSHIP'], route.route_id);
    assert.equal(privatePath.join_stage, 'SEPARATE_ROUTE', route.route_id);
    assert.deepEqual(privatePath.source_ids, ['FR_SRC_PRIVATE_FAMILY_TIES'], route.route_id);
  }
});
