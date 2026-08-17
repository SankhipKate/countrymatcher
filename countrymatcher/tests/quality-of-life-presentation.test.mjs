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
});

test('Pages artifact includes quality-of-life editorial data', async () => {
  const build = await text('scripts/build-pages-artifact.mjs');
  assert.match(build, /data\/quality-of-life-ru\.json/);
});
