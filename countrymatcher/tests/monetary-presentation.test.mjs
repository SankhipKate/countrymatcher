import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';

import { calculateActiveCountry } from '../js/engine/rp4-engine.js';
import { formatMonetaryAmount } from '../js/presentation/money.js';

const za = JSON.parse(await readFile(new URL('../data/ZA-research-v4.0.json', import.meta.url), 'utf8'));
const schema = JSON.parse(await readFile(new URL('../data/research-package-v4.0.schema.json', import.meta.url), 'utf8'));
const appSource = await readFile(new URL('../matcher/app.js', import.meta.url), 'utf8');
const context = { fx: { base_currency: 'USD', rates: { USD: 1, ZAR: 18 }, source: 'test', as_of: '2026-09-03' } };
const profile = ({ income = 48000, savings = 0, capital = null } = {}) => ({
  citizenships: ['RU'], residence: { current_country: 'RU', current_status: 'CITIZEN' },
  application_preferences: { methods: ['FROM_ABROAD'] },
  family: { adults_count: 1, adult_ages: [35], partner_included: false, relationship_type: null, children: [], school_needed: false },
  lgbt: { enabled: false, consent_for_personalization: false, family_recognition_relevant: null, safety_relevant: null },
  income: { primary: { owner: 'APPLICANT', type: 'REMOTE_EMPLOYMENT', source_geography: 'SINGLE_COUNTRY', country_id: 'US', monthly_total: { amount: income, currency: 'ZAR' }, monthly_provable: { amount: income, currency: 'ZAR' } }, additional_sources: [], partner: { has_income: false, sources: [] }, savings: { amount: savings, currency: 'ZAR' } },
  investment_capital: capital == null ? null : { amount: capital, currency: 'ZAR' },
  goal: { long_term: 'PR_REQUIRED', keep_russian_citizenship: 'NOT_REQUIRED' },
  pets: { types: ['NONE'], dogs: [], other_pet_notes: null }, special_circumstances: ['NONE'], route_specific_answers: {},
});
const calculated = (options = {}, fx = context) => calculateActiveCountry(profile(options), za, fx);
const route = (result, id) => result.routes.find(({ routeId }) => routeId === id);

test('ZA Remote Work blocker uses structured threshold and runtime USD equivalent', () => {
  const remote = route(calculated(), 'ZA_REMOTE_WORK');
  assert.equal(remote.routeStatus, 'UNSUITABLE');
  assert.match(remote.blockers[0], /650[^\d]*976[^\d]*ZAR\/год/u);
  assert.match(remote.blockers[0], /36[^\d]*170[^\d]*\$\/год/u);
  assert.doesNotMatch(remote.blockers[0], /≈/u);
});

test('monetary formatter gracefully omits USD when FX is unavailable', () => {
  const text = formatMonetaryAmount({ amount: 650976, currency: 'ZAR', period: 'ANNUAL' }, { fx: { base_currency: 'USD', rates: { USD: 1 } } });
  assert.match(text, /650[^\d]*976[^\d]*ZAR\/год/u);
  assert.doesNotMatch(text, /\$/u);
  assert.doesNotMatch(text, /≈/u);
});

test('ZA non-financial net worth and payment receive presentation-only runtime equivalents', () => {
  const fi = route(calculated(), 'ZA_FINANCIALLY_INDEPENDENT_PR');
  const wealth = fi.conditionActions.find(({ requirementId }) => requirementId === 'ZA_FI_NET_WORTH');
  const payment = fi.displayOnlyRequirements.find(({ requirement_id }) => requirement_id === 'ZA_FI_PAYMENT');
  assert.match(wealth.text, /12[^\d]*000[^\d]*000[^\d]*ZAR \(666[^\d]*700[^\d]*\$\)/u);
  assert.match(payment.condition_ru, /120[^\d]*000[^\d]*ZAR \(6[^\d]*670[^\d]*\$\)/u);
  assert.doesNotMatch(`${wealth.text}${payment.condition_ru}`, /≈|\{display_amount\}/u);
});

test('net worth and payment never affect matching for savings or capital changes', () => {
  for (const savings of [0, 12000000, 99999999]) for (const capital of [null, 12000000, 99999999]) {
    const fi = route(calculated({ savings, capital }), 'ZA_FINANCIALLY_INDEPENDENT_PR');
    assert.equal(fi.routeStatus, 'SUITABLE_WITH_CONDITIONS');
    assert.equal(fi.financialSummary, null);
    assert.equal(fi.requirementResults.find(({ requirement }) => requirement.requirement_id === 'ZA_FI_NET_WORTH').state, 'UNKNOWN');
    assert.equal(fi.requirementResults.find(({ requirement }) => requirement.requirement_id === 'ZA_FI_PAYMENT').state, 'DISPLAY_ONLY');
  }
});

test('schema rejects financial on non-FINANCIAL and separates display_amount from evaluation', () => {
  const ajv = new Ajv2020({ allErrors: true, strict: false }); addFormats(ajv); ajv.addSchema(schema);
  const validate = ajv.getSchema(`${schema.$id}#/$defs/routeRequirement`);
  const wealth = structuredClone(za.routes.find(({ route_id }) => route_id === 'ZA_FINANCIALLY_INDEPENDENT_PR').requirements[0]);
  assert.equal(validate(wealth), true, JSON.stringify(validate.errors));
  wealth.financial = { model: 'SAVINGS_ONLY', alternatives: [] };
  assert.equal(validate(wealth), false);
  delete wealth.financial; wealth.type = 'FINANCIAL';
  assert.equal(validate(wealth), false);
});

test('monthly/yearly representations group only inside one requirement and never use approximation mark', () => {
  assert.match(appSource, /Math\.abs\(Number\(annual\.threshold\) - Number\(monthly\.threshold\) \* 12\)/u);
  assert.match(appSource, /groups\.map\(\(group\)/u);
  assert.match(appSource, /financialRequirements[^]*flatMap/u);
  assert.doesNotMatch(formatMonetaryAmount({ amount: 12000000, currency: 'ZAR' }, context), /≈/u);
});
