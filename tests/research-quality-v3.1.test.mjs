import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const load = async (relative) => JSON.parse(await readFile(new URL(relative, import.meta.url), 'utf8'));

test('Mexico exposes legal entry for Russian citizens and all three city sizes', async () => {
  const data = await load('../data/mexico-research-v3.0.json');
  assert.equal(data.entry_for_russian_citizen.primary_method, 'SAE_AIR_ONLY');
  assert.equal(data.entry_for_russian_citizen.fee_usd, 0);
  assert.equal(data.entry_for_russian_citizen.authorization_validity_days, 30);
  assert.deepEqual(new Set(data.cities.map(({ size }) => size)), new Set(['крупный', 'средний', 'небольшой']));
});

test('Mexico user text translates legal terms and explains safety percentages', async () => {
  const data = await load('../data/mexico-research-v3.0.json');
  const text = JSON.stringify(data);
  assert.match(text, /cónyuge \(супруг или супруга\)/i);
  assert.match(text, /concubina\/concubinario \(партнёр/i);
  assert.match(data.lgbt.safety_explanation_ru, /субъективное восприятие/i);
  assert.match(data.lgbt.safety_explanation_ru, /не доля жертв/i);
});

test('Brazil digital nomad does not satisfy mandatory citizenship without a confirmed chain', async () => {
  const data = await load('../data/brazil-research-v3.0.json');
  const route = data.routes.find(({ route_id }) => route_id === 'BR_DIGITAL_NOMAD');
  assert.equal(route.long_term_path.chain_confirmed_for_required_citizenship, false);
  assert.match(route.pr_path_ru, /не устанавливает автоматический переход/i);
  assert.match(route.citizenship_path_ru, /обязательным гражданством.*неподходящим/i);
});

test('Brazil family budgets below 5000 USD mathematically fit', async () => {
  const data = await load('../data/brazil-research-v3.0.json');
  for (const city of data.cities) {
    assert.ok(Number(city.budget_family_1_child_usd) < 5000, city.name_ru);
    assert.equal(5000 - Number(city.budget_family_1_child_usd) >= 0, true, city.name_ru);
  }
});

test('generic future verification is absent from Brazil conditions', async () => {
  const adapter = await readFile(new URL('../js/countries/brazil-adapter.js', import.meta.url), 'utf8');
  assert.equal(adapter.includes('Перед переездом проверить последовательность продления или смены основания'), false);
  assert.match(adapter, /required_long_term_chain_not_confirmed/);
});

test('city budget code ignores nonnumeric school descriptions', async () => {
  const app = await readFile(new URL('../matcher/app.js', import.meta.url), 'utf8');
  assert.match(app, /Number\.isFinite\(numericSchoolCost\)/);
  assert.match(app, /budgetUsd == null \|\| !Number\.isFinite\(total\)/);
});
