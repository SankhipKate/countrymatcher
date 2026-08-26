import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const appRoot = new URL('../', import.meta.url);

async function text(path) {
  return readFile(new URL(path, appRoot), 'utf8');
}

test('quality-of-life editorial content is presentation-only and independent from RP4', async () => {
  const [matcher, engine, schemaText, editorialText] = await Promise.all([
    text('matcher/app.js'),
    text('js/engine/rp4-engine.js'),
    text('data/research-package-v4.0.schema.json'),
    text('data/quality-of-life-ru.json'),
  ]);
  const schema = JSON.parse(schemaText);
  const editorial = JSON.parse(editorialText);

  assert.equal(schema.additionalProperties, false);
  assert.equal(Object.hasOwn(schema.properties, 'quality_of_life'), false);
  assert.doesNotMatch(engine, /qualityOfLife|quality_of_life|quality-of-life/u);
  assert.match(matcher, /QUALITY_OF_LIFE_EDITORIAL_FILE = 'quality-of-life-ru\.json'/);
  assert.match(matcher, /function renderQualityOfLife\(calculation\)/);
  assert.match(matcher, /Субъективная редакционная оценка качества жизни/);
  assert.match(matcher, /Она не показывает, насколько эта страна подходит именно вам/);
  assert.match(matcher, /renderTaxPresentation\(calculation\)\}\$\{renderQualityOfLife\(calculation\)/);
  assert.match(matcher, /\.catch\(\(\) => \(\{ countries: \{\} \}\)\)/);

  assert.equal(editorial.version, '1.0');
  assert.equal(editorial.countries.UY.score, 7.7);
  assert.ok(editorial.countries.UY.narrative_ru.length >= 6);
  assert.match(editorial.countries.UY.formula_ru, /Сильные институты/);
  assert.equal(editorial.countries.ES.score, 8.4);
  assert.ok(editorial.countries.ES.narrative_ru.length >= 6);
  assert.match(editorial.countries.ES.formula_ru, /Развитая инфраструктура/);
  assert.equal(editorial.countries.AR.score, 7.5);
  assert.ok(editorial.countries.AR.narrative_ru.length >= 6);
  assert.match(editorial.countries.AR.formula_ru, /Разнообразие городов/);
  assert.equal(editorial.countries.BR.score, 6.6);
  assert.ok(editorial.countries.BR.narrative_ru.length >= 6);
  assert.match(editorial.countries.BR.formula_ru, /Огромный выбор городов/);
  assert.equal(editorial.countries.PT.score, 8.0);
  assert.ok(editorial.countries.PT.narrative_ru.length >= 6);
  assert.match(editorial.countries.PT.formula_ru, /Безопасность/);
  assert.equal(editorial.countries.MX.score, 6.4);
  assert.ok(editorial.countries.MX.narrative_ru.length >= 6);
  assert.match(editorial.countries.MX.formula_ru, /Огромный выбор городов/);
  assert.equal(editorial.countries.PY.score, 5.9);
  assert.ok(editorial.countries.PY.narrative_ru.length >= 6);
  assert.match(editorial.countries.PY.formula_ru, /Низкая стоимость жизни/);
  assert.equal(editorial.countries.CO.score, 6.3);
  assert.ok(editorial.countries.CO.narrative_ru.length >= 6);
  assert.match(editorial.countries.CO.formula_ru, /Разнообразие городов/);
  assert.equal(editorial.countries.ME.score, 7.4);
  assert.ok(editorial.countries.ME.narrative_ru.length >= 6);
  assert.match(editorial.countries.ME.formula_ru, /Море/);
  assert.equal(editorial.countries.CL.score, 7.8);
  assert.ok(editorial.countries.CL.narrative_ru.length >= 6);
  assert.match(editorial.countries.CL.formula_ru, /Очень высокое человеческое развитие/);
  assert.equal(editorial.countries.GR.score, 7.6);
  assert.ok(editorial.countries.GR.narrative_ru.length >= 6);
  assert.match(editorial.countries.GR.formula_ru, /Средиземноморский климат/);
});


test('every active RP4 country has a complete quality-of-life editorial entry', async () => {
  const [matcher, editorialText] = await Promise.all([
    text('matcher/app.js'),
    text('data/quality-of-life-ru.json'),
  ]);

  const declaration = matcher.match(/const ACTIVE_RP4_PACKAGES = \[([\s\S]*?)\];/);
  assert.ok(declaration, 'ACTIVE_RP4_PACKAGES declaration');

  const filenames = [...declaration[1].matchAll(/'([^']+-research-v4\.0\.json)'/g)]
    .map((match) => match[1]);

  assert.ok(filenames.length > 0, 'active RP4 package list must not be empty');

  const packages = await Promise.all(
    filenames.map(async (filename) =>
      JSON.parse(await text(`data/${filename}`))),
  );

  const activeCountryIds = packages.map((pkg) => pkg.country_id);
  const editorial = JSON.parse(editorialText);
  const editorialCountries = editorial.countries || {};

  const missing = activeCountryIds.filter(
    (countryId) => !Object.hasOwn(editorialCountries, countryId),
  );

  assert.deepEqual(
    missing,
    [],
    `active RP4 countries missing quality-of-life editorial: ${missing.join(', ')}`,
  );

  for (const countryId of activeCountryIds) {
    const entry = editorialCountries[countryId];

    assert.ok(
      Number.isFinite(entry.score) && entry.score >= 0 && entry.score <= 10,
      `${countryId}: QoL score must be a number from 0 to 10`,
    );

    assert.ok(
      Array.isArray(entry.narrative_ru) &&
        entry.narrative_ru.length >= 6 &&
        entry.narrative_ru.every(
          (paragraph) => typeof paragraph === 'string' && paragraph.trim().length > 0,
        ),
      `${countryId}: QoL narrative must contain at least 6 non-empty paragraphs`,
    );

    assert.ok(
      typeof entry.formula_ru === 'string' && entry.formula_ru.trim().length > 0,
      `${countryId}: QoL formula is required`,
    );

    assert.match(
      String(entry.updated_at || ''),
      /^\d{4}-\d{2}-\d{2}$/,
      `${countryId}: QoL updated_at must be YYYY-MM-DD`,
    );
  }
});

test('Pages artifact includes quality-of-life editorial data', async () => {
  const build = await text('scripts/build-pages-artifact.mjs');
  assert.match(build, /data\/quality-of-life-ru\.json/);
});
