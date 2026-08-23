import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  activeConsultantsForCountry,
  telegramConsultantUrl,
} from '../matcher/consultants.js';

const expectedMessage = 'Здравствуйте! Я рассматриваю Черногорию для переезда и обращаюсь к вам по рекомендации Country Matcher. Хочу узнать подробнее про варианты легализации.';

test('Montenegro ResidencyNow collaboration is configured exactly as approved', async () => {
  const data = JSON.parse(
    await readFile(new URL('../data/country-consultants-ru.json', import.meta.url), 'utf8'),
  );

  assert.deepEqual(Object.keys(data.countries), ['ME']);

  const consultants = activeConsultantsForCountry(data, 'ME');
  assert.equal(consultants.length, 1);

  const consultant = consultants[0];

  assert.equal(consultant.active, true);
  assert.equal(consultant.name, 'ResidencyNow');
  assert.equal(consultant.telegram_username, 'ResidencyNow');
  assert.equal(consultant.telegram_message_ru, expectedMessage);
  assert.match(consultant.text_ru, /Работают официально, по договору\./);
});

test('Telegram link targets ResidencyNow and pre-fills the approved message', async () => {
  const data = JSON.parse(
    await readFile(new URL('../data/country-consultants-ru.json', import.meta.url), 'utf8'),
  );

  const consultant = activeConsultantsForCountry(data, 'ME')[0];
  const url = new URL(telegramConsultantUrl(consultant));

  assert.equal(url.origin, 'https://t.me');
  assert.equal(url.pathname, '/ResidencyNow');
  assert.equal(url.searchParams.get('text'), expectedMessage);
});

test('countries without a configured collaboration return no consultant data', async () => {
  const data = JSON.parse(
    await readFile(new URL('../data/country-consultants-ru.json', import.meta.url), 'utf8'),
  );

  for (const countryId of ['ES', 'AR', 'UY', 'BR', 'PT', 'MX', 'PY', 'CO']) {
    assert.deepEqual(activeConsultantsForCountry(data, countryId), []);
  }
});

test('consultant block is presentation-only and comes after Quality of Life', async () => {
  const app = await readFile(new URL('../matcher/app.js', import.meta.url), 'utf8');

  assert.match(app, /import \{ activeConsultantsForCountry, telegramConsultantUrl \} from '\.\/consultants\.js';/);
  assert.match(app, /COUNTRY_CONSULTANTS_FILE = 'country-consultants-ru\.json'/);
  assert.match(
    app,
    /\$\{renderQualityOfLife\(calculation\)\}\$\{renderConsultantCollaboration\(calculation\)\}/,
  );
  assert.match(app, /activeConsultantsForCountry\(/);
  assert.match(app, /telegramConsultantUrl\(/);
  assert.match(
    app,
    /withBuildId\(new URL\(COUNTRY_CONSULTANTS_FILE, DATA_BASE\), buildId\)/,
  );
  assert.doesNotMatch(app, /consultants\.js\?v=/);
});

test('invalid Telegram usernames do not produce outbound links', () => {
  assert.equal(
    telegramConsultantUrl({
      telegram_username: 'bad/user',
      telegram_message_ru: 'hello',
    }),
    null,
  );
});
