import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const costaRica = JSON.parse(
  await readFile(new URL('../data/CR-research-v4.0.json', import.meta.url), 'utf8'),
);

const route = (id) => costaRica.routes.find(({ route_id }) => route_id === id);

test('Costa Rica package covers all 13 Canon route categories', () => {
  assert.equal(costaRica.country_id, 'CR');
  assert.equal(costaRica.route_coverage.length, 13);
  assert.equal(new Set(costaRica.route_coverage.map(({ category }) => category)).size, 13);
});

test('Costa Rica Digital Nomad uses only applicant and partner income in the current questionnaire contract', () => {
  const dn = route('CR_DIGITAL_NOMAD');
  const fin = dn.requirements.find(({ requirement_id }) => requirement_id === 'CR_DN_FIN');
  assert.deepEqual(fin.financial.alternatives[0].income_owners, ['APPLICANT', 'PARTNER']);
  assert.deepEqual(fin.financial.alternatives[0].family_formula_ordered, {
    base_applicant_amount: 3000,
    first_additional_member_amount: 1000,
    each_further_member_amount: 0,
  });
  assert.equal(JSON.stringify(costaRica).includes('OTHER_FAMILY_MEMBER'), false);
});

test('Costa Rica keeps the requested original Digital Nomad family relationship mapping', () => {
  const partner = route('CR_DIGITAL_NOMAD').family_scenarios.find(({ scenario_id }) => scenario_id === 'CR_DN_PARTNER');
  assert.deepEqual(partner.relationship_types, ['MARRIED', 'UNREGISTERED_PARTNERSHIP']);
});

test('Costa Rica Investor remains unpublished with the route-specific blocking open item', () => {
  assert.equal(route('CR_INVESTOR').publishable, false);
  const item = costaRica.open_items.find(({ item_id }) => item_id === 'CR_INVESTOR_POST_9996_THRESHOLD');
  assert.equal(item.blocks_publication, true);
  assert.equal(item.related_route_id, 'CR_INVESTOR');
});

test('Costa Rica school presentation uses Russian city names and researched compulsory ages', () => {
  const names = costaRica.schools.international_school_cities.map(({ city_name_ru }) => city_name_ru);
  assert.equal(names.length, 6);
  for (const name of names) {
    assert.match(name, /[А-Яа-яЁё]/u);
    assert.doesNotMatch(name, /[A-Za-z]/u);
  }
  const publicRule = costaRica.schools.public_school_rules[0];
  assert.equal(publicRule.compulsory_age_min, 4);
  assert.equal(publicRule.compulsory_age_max, 17);
  assert.ok(publicRule.source_ids.includes('CR_S115'));
  assert.ok(publicRule.source_ids.includes('CR_S116'));
});

test('Costa Rica long-term Russian copy uses a residence period rather than a naturalization group', () => {
  for (const r of costaRica.routes) {
    const text = r.long_term_path?.citizenship_path_ru || '';
    assert.doesNotMatch(text, /группа натурализации/u, r.route_id);
  }
  const relative = route('CR_FIRST_DEGREE_CITIZEN_RELATIVE');
  assert.match(relative.long_term_path.pr_path_ru, /непосредственно к постоянной резиденции/u);
});
