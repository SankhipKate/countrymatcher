import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

const validatorScript = `
import importlib.util, json, pathlib, sys
path = pathlib.Path('data/validate-v4.0.py').resolve()
spec = importlib.util.spec_from_file_location('validator', path)
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
print(json.dumps(module.validate_family_coverage(json.load(sys.stdin))))
`;

function audit(data) {
  const result = spawnSync('python3', ['-c', validatorScript], {
    cwd: new URL('..', import.meta.url),
    input: JSON.stringify(data),
    encoding: 'utf8',
  });
  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout);
}

function scenario(overrides = {}) {
  return {
    scenario_id: 'FAMILY',
    applies_to: 'PARTNER_AND_CHILDREN',
    relationship_types: ['MARRIED'],
    child_age_min: 0,
    child_age_max: 25,
    simultaneous_move: 'YES',
    separate_route_required: false,
    linked_route_id: null,
    join_stage: 'WITH_INITIAL_APPLICATION',
    separation_months_min: null,
    separation_months_max: null,
    member_long_term_path: null,
    condition_ru: 'Подтверждённый семейный путь.',
    source_ids: ['SOURCE'],
    ...overrides,
  };
}

function pkg(familyScenarios, { publishable = false, openItems = [] } = {}) {
  return {
    routes: [{ route_id: 'ROUTE', publishable, family_scenarios: familyScenarios }],
    open_items: openItems,
  };
}

const blockingGap = {
  item_id: 'ROUTE_FAMILY_GAP',
  block: 'FAMILY',
  related_route_id: 'ROUTE',
  blocks_publication: true,
};

test('family coverage audit accepts complete country-specific overlapping scenarios', () => {
  const errors = audit(pkg([
    scenario({ scenario_id: 'CHILD_DEPENDENT', applies_to: 'CHILD', relationship_types: null, child_age_max: 20 }),
    scenario({ scenario_id: 'CHILD_SPECIAL', applies_to: 'CHILD', relationship_types: null, child_age_min: 18 }),
    scenario({ scenario_id: 'PARTNER', applies_to: 'PARTNER', relationship_types: ['MARRIED', 'REGISTERED_PARTNERSHIP', 'UNREGISTERED_PARTNERSHIP'], child_age_min: null, child_age_max: null }),
  ]));
  assert.deepEqual(errors, []);
});

test('family coverage audit reports reversed intervals and every uncovered child age', () => {
  const errors = audit(pkg([
    scenario({ scenario_id: 'CHILD', applies_to: 'CHILD', relationship_types: null, child_age_max: 17 }),
    scenario({ scenario_id: 'REVERSED', applies_to: 'CHILD', relationship_types: null, child_age_min: 22, child_age_max: 18 }),
    scenario({ scenario_id: 'PARTNER', applies_to: 'PARTNER', child_age_min: null, child_age_max: null }),
  ]));
  assert.ok(errors.some((error) => error.includes('child_age_min=22 exceeds child_age_max=18')));
  assert.ok(errors.some((error) => error.includes('18') && error.includes('25') && error.includes('uncovered')));
});

test('family coverage audit reports relationship inputs with no structured outcome', () => {
  const errors = audit(pkg([
    scenario({ scenario_id: 'CHILD', applies_to: 'CHILD', relationship_types: null }),
    scenario({ scenario_id: 'PARTNER', applies_to: 'PARTNER', relationship_types: ['UNREGISTERED_PARTNERSHIP'], child_age_min: null, child_age_max: null }),
  ]));
  assert.ok(errors.some((error) => error.includes('MARRIED') && error.includes('REGISTERED_PARTNERSHIP')));
});

test('MARRIED alone does not cover registered or unregistered questionnaire inputs', () => {
  const errors = audit(pkg([scenario()]));
  const relationshipError = errors.find((error) => error.includes('relationship inputs have no structured outcome'));
  assert.match(relationshipError, /REGISTERED_PARTNERSHIP/);
  assert.match(relationshipError, /UNREGISTERED_PARTNERSHIP/);
});

test('direct union of all three relationship types passes partner coverage', () => {
  assert.deepEqual(audit(pkg([scenario({
    relationship_types: ['MARRIED', 'REGISTERED_PARTNERSHIP', 'UNREGISTERED_PARTNERSHIP'],
  })])), []);
});

test('formalization wording in condition_ru cannot create static relationship coverage', () => {
  const errors = audit(pkg([scenario({
    relationship_types: ['MARRIED'],
    condition_ru: 'Партнёры могут оформить брак или зарегистрированное партнёрство.',
  })]));
  const relationshipError = errors.find((error) => error.includes('relationship inputs have no structured outcome'));
  assert.match(relationshipError, /REGISTERED_PARTNERSHIP/);
  assert.match(relationshipError, /UNREGISTERED_PARTNERSHIP/);
});

test('NOT_RESEARCHED requires the correctly bound blocking FAMILY open item', () => {
  const unresolved = scenario({ relationship_types: ['MARRIED', 'REGISTERED_PARTNERSHIP', 'UNREGISTERED_PARTNERSHIP'], simultaneous_move: 'NOT_RESEARCHED', separate_route_required: null, join_stage: 'NOT_RESEARCHED', source_ids: [] });
  assert.ok(audit(pkg([unresolved])).some((error) => error.includes('route-specific blocking FAMILY open_item')));
  assert.ok(audit(pkg([unresolved], { openItems: [{ ...blockingGap, related_route_id: 'OTHER' }] })).some((error) => error.includes('route-specific blocking FAMILY open_item')));
  assert.ok(audit(pkg([unresolved], { openItems: [{ ...blockingGap, blocks_publication: false }] })).some((error) => error.includes('route-specific blocking FAMILY open_item')));
  assert.deepEqual(audit(pkg([unresolved], { openItems: [blockingGap] })), []);
});

test('relationship-specific NOT_RESEARCHED closes only its own cell as a blocking gap', () => {
  const scenarios = [
    scenario({ scenario_id: 'CHILD', applies_to: 'CHILD', relationship_types: null }),
    scenario({ scenario_id: 'MARRIED', applies_to: 'PARTNER', relationship_types: ['MARRIED'], child_age_min: null, child_age_max: null }),
    scenario({ scenario_id: 'REGISTERED', applies_to: 'PARTNER', relationship_types: ['REGISTERED_PARTNERSHIP'], child_age_min: null, child_age_max: null }),
    scenario({
      scenario_id: 'UNREGISTERED_GAP',
      applies_to: 'PARTNER',
      relationship_types: ['UNREGISTERED_PARTNERSHIP'],
      child_age_min: null,
      child_age_max: null,
      simultaneous_move: 'NOT_RESEARCHED',
      separate_route_required: null,
      join_stage: 'NOT_RESEARCHED',
      source_ids: [],
    }),
  ];
  assert.ok(audit(pkg(scenarios)).some((error) => error.includes('route-specific blocking FAMILY open_item')));
  assert.deepEqual(audit(pkg(scenarios, { openItems: [blockingGap] })), []);
});

test('publishable route cannot retain unresolved family coverage', () => {
  const unresolved = scenario({ simultaneous_move: 'NOT_RESEARCHED', separate_route_required: null, join_stage: 'NOT_RESEARCHED', source_ids: [] });
  const errors = audit(pkg([unresolved], { publishable: true, openItems: [blockingGap] }));
  assert.ok(errors.some((error) => error.includes('publishable route has unresolved family coverage')));
});

test('publishable route cannot retain an absent child interval', () => {
  const errors = audit(pkg([
    scenario({ scenario_id: 'CHILD', applies_to: 'CHILD', relationship_types: null, child_age_max: 17 }),
    scenario({ scenario_id: 'PARTNER', applies_to: 'PARTNER', child_age_min: null, child_age_max: null }),
  ], { publishable: true }));
  assert.ok(errors.some((error) => error.includes('uncovered questionnaire child ages')));
  assert.ok(errors.some((error) => error.includes('publishable route has unresolved family coverage')));
});

test('family audit catches existing structured resolver contract errors', () => {
  const errors = audit(pkg([
    scenario({ scenario_id: 'DUP' }),
    scenario({ scenario_id: 'DUP', applies_to: 'CHILD', relationship_types: null }),
    scenario({
      scenario_id: 'SEPARATE',
      applies_to: 'PARTNER',
      relationship_types: null,
      child_age_min: null,
      child_age_max: null,
      separate_route_required: true,
      join_stage: 'SEPARATE_ROUTE',
      linked_route_id: null,
      member_long_term_path: null,
    }),
  ]));
  assert.ok(errors.some((error) => error.includes('duplicate scenario_id DUP')));
  assert.ok(errors.some((error) => error.includes('requires structured relationship_types')));
  assert.ok(errors.some((error) => error.includes('requires linked_route_id or member_long_term_path')));
});

test('resolved and NOT_AVAILABLE outcomes require structured evidence', () => {
  const resolved = audit(pkg([scenario({ source_ids: [] })]));
  assert.ok(resolved.some((error) => error.includes('requires non-empty source_ids')));
  const unavailable = audit(pkg([scenario({ join_stage: 'NOT_AVAILABLE', source_ids: [] })]));
  assert.ok(unavailable.some((error) => error.includes('researched NOT_AVAILABLE requires non-empty source_ids')));
});
