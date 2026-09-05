import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readActiveRp4Packages } from './helpers/active-country-manifest.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(here, '..');
const repoRoot = path.resolve(appRoot, '..');
const packages = await readActiveRp4Packages();
const explicitlyHidden = new Set([
  'AR_SPECIALIST_TRANSFER',
  'BR_CORPORATE_EXECUTIVE_RN11','BR_FAMILY_REUNIFICATION',
  'CL_FAMILY_REUNIFICATION','CL_INVESTOR_PERSONNEL',
  'CO_M_PARENT_ADOPTION_COLOMBIAN','CO_M_PARENT_BIRTH_COLOMBIAN','CO_M_PERMANENT_PARTNER_COLOMBIAN','CO_M_SPOUSE_COLOMBIAN',
  'CR_CORPORATE_STAFF','CR_FIRST_DEGREE_CITIZEN_RELATIVE','CR_SPOUSE_OF_CITIZEN',
  'EC_FAMILY_PR_DIRECT','EC_FAMILY_TEMP_AMPARO','EC_ICT','EC_OTHER_MARITIME',
  'GR_E2_ICT','GR_EU_CITIZEN_FAMILY','GR_O1_FAMILY','GR_O3_GREEK_FAMILY',
  'ME_FAMILY','ME_ICT',
  'PY_FAMILY_PARAGUAYAN','PY_FAMILY_REPATRIATED',
  'MT_ICT','MT_MALTESE_PARTNER',
]);

function countries() {
  return packages;
}

test('approved narrow-route publication exclusions remain nonpublishable', () => {
  const routes = new Map(countries().flatMap((country) => country.routes.map((route) => [route.route_id, route])));
  for (const routeId of explicitlyHidden) {
    assert.ok(routes.has(routeId), `missing route ${routeId}`);
    assert.equal(routes.get(routeId).publishable, false, routeId);
  }
});

test('approved broad routes remain publishable', () => {
  const routes = new Map(countries().flatMap((country) => country.routes.map((route) => [route.route_id, route])));
  for (const routeId of ['UY_TEMP_SPECIALIST','MX_TEMP_WORK','EC_AUTONOMO_PRO_SERVICES','MT_SELF_EMPLOYED','MT_RESEARCHER']) {
    assert.equal(routes.get(routeId)?.publishable, true, routeId);
  }
});

test('public price and questionnaire heading match 13.2.3 product decision', () => {
  const mainHtml = fs.readFileSync(path.join(appRoot, 'index.html'), 'utf8');
  const landingHtml = fs.readFileSync(path.join(appRoot, 'landing', 'index.html'), 'utf8');
  const config = fs.readFileSync(path.join(appRoot, 'payment-config.js'), 'utf8');
  const appSource = fs.readFileSync(path.join(appRoot, 'matcher', 'app.js'), 'utf8');
  assert.match(mainHtml, /Подберите подходящую страну/);
  assert.doesNotMatch(mainHtml, /Подберём вариант иммиграции/);
  assert.match(mainHtml, /\$29/);
  assert.match(mainHtml, /2500 ₽/);
  assert.match(mainHtml, /₱1900/);
  assert.doesNotMatch(mainHtml, /цена только до 1 сентября/);
  assert.match(landingHtml, /\$29|29\$/);
  assert.match(landingHtml, /2500 ₽/);
  assert.match(landingHtml, /₱1900/);
  assert.match(config, /EXPECTED_PRICE = "29\.00"/);
  assert.doesNotMatch(appSource, /≈/);
  assert.doesNotMatch(appSource, /всего за \$29/);
  assert.match(appSource, /EXPECTED_PRICE/);
  assert.match(appSource, /countryCount\(lockedCountries\.length\)/);
  assert.match(appSource, /countryCount\(count\)/);
  assert.doesNotMatch(mainHtml, /Откройте ещё 12 стран/);
  assert.doesNotMatch(landingHtml, /в\u00a0elegram/);
});

test('payment success state is immediately prominent and explains automatic access', () => {
  const source = fs.readFileSync(path.join(appRoot, 'landing', 'paypal-checkout.js'), 'utf8');
  const landingCss = fs.readFileSync(path.join(appRoot, 'landing', 'landing-v57.css'), 'utf8');
  const resultCss = fs.readFileSync(path.join(appRoot, 'matcher', 'access-gate.css'), 'utf8');
  assert.equal(source.includes('\"Оплата подтверждена.\\nПолный доступ откроется автоматически\\nЗаймёт несколько секунд\"'), true);
  assert.equal(source.includes('\"Оплата прошла успешно.\\nПолный доступ откроется автоматически\\nЗаймёт несколько секунд\"'), true);
  assert.match(landingCss, /paypal-checkout-status\[data-tone="success"\]/);
  assert.match(resultCss, /paypal-checkout-status\[data-tone="success"\]/);
});

test('operational prompt records architecture decision gate and narrow-route publication boundary', () => {
  const prompt = fs.readFileSync(path.join(repoRoot, 'source-documents', 'canon-v4.0', 'NEW_COUNTRY_RESEARCH_PROMPT.md'), 'utf8');
  assert.match(prompt, /ПРОДУКТОВЫЙ GATE ПЕРЕД ЛЮБЫМ ИЗМЕНЕНИЕМ АРХИТЕКТУРЫ/);
  assert.match(prompt, /отдельное явное продуктовое решение пользователя/);
  assert.match(prompt, /ПРОДУКТОВОЕ ПРАВИЛО ПУБЛИКАЦИИ УЗКОСПЕЦИАЛЬНЫХ МАРШРУТОВ/);
  assert.match(prompt, /внутрикорпоративный перевод \/ ICT/);
  assert.match(prompt, /Family scenarios внутри обычного основного маршрута заявителя сохраняются/);
  assert.match(prompt, /Каждый такой mixed route выносится на отдельное продуктовое решение пользователя/);
  assert.doesNotMatch(prompt, /mixed route должен оставаться непубликуемым/);
});
