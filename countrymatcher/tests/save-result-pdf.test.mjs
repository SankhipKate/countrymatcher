import test from 'node:test';
import assert from 'node:assert/strict';
import {
  readFile,
} from 'node:fs/promises';

const [
  html,
  app,
  css,
] = await Promise.all([
  readFile(
    new URL('../index.html', import.meta.url),
    'utf8',
  ),
  readFile(
    new URL('../matcher/app.js', import.meta.url),
    'utf8',
  ),
  readFile(
    new URL('../matcher/styles.css', import.meta.url),
    'utf8',
  ),
]);

test(
  'save result is available only for verified full access',
  () => {
    assert.match(
      html,
      /id="saveResult"[^>]*hidden[^>]*>Сохранить результат<\/button>/,
    );

    assert.match(
      app,
      /function switchToResult[\s\S]*?\$\('#saveResult'\)\.hidden = false;/,
    );

    assert.match(
      app,
      /function showUnpaidResult[\s\S]*?\$\('#saveResult'\)\.hidden = true;/,
    );
  },
);

test(
  'dialog contains every route presentation group',
  () => {
    for (const group of [
      'SUITABLE',
      'SUITABLE_WITH_CONDITIONS',
      'REQUIRES_SEPARATE_BASIS',
      'INTERNATIONAL_PROTECTION',
      'UNSUITABLE',
    ]) {
      assert.match(
        html,
        new RegExp(
          `name="saveRouteGroup"[\\s\\S]*?value="${group}"`,
        ),
      );
    }
  },
);

test(
  'dialog contains the final additional-section set in order',
  () => {
    const expected = [
      'value="cities"',
      'value="schools"',
      'value="pets"',
      'value="taxes"',
      'value="lgbt"',
      'value="sources"',
      'value="quality"',
    ];

    let cursor = -1;

    for (const token of expected) {
      const next = html.indexOf(token);

      assert.ok(
        next > cursor,
        `${token} must follow the previous section`,
      );

      cursor = next;
    }

    assert.doesNotMatch(
      html,
      /Текст о жизни/,
    );

    assert.doesNotMatch(
      html,
      /страниц/,
    );
  },
);

test(
  'schools, pets and LGBT selectors are conditional',
  () => {
    assert.match(
      app,
      /saveSectionSchoolsRow'\)\.hidden =\s*!\(currentProfile\?\.family\?\.children\?\.length > 0\)/,
    );

    assert.match(
      app,
      /const hasPets =[\s\S]*?petTypes\?\.some/,
    );

    assert.match(
      app,
      /saveSectionPetsRow'\)\.hidden = !hasPets/,
    );

    assert.match(
      app,
      /saveSectionLgbtRow'\)\.hidden =[\s\S]*?currentAnswers\?\.lgbtEnabled/,
    );
  },
);

test(
  'export order keeps quality of life last',
  () => {
    assert.match(
      app,
      /for \(const node of \[[\s\S]*?cities,[\s\S]*?schools,[\s\S]*?pets,[\s\S]*?taxes,[\s\S]*?lgbt,[\s\S]*?sources,[\s\S]*?quality,[\s\S]*?\]\)/,
    );
  },
);

test(
  'routes are filtered by presentation group',
  () => {
    assert.match(
      app,
      /data-route-group="\$\{html\(presentationGroup\)\}"/,
    );

    assert.match(
      app,
      /options\.routeGroups\.has\([\s\S]*?route\.dataset\.routeGroup/,
    );
  },
);

test(
  'native print export replaces bitmap PDF rendering',
  () => {
    assert.match(
      app,
      /function buildPrintExportStage\(options\)/,
    );

    assert.match(
      app,
      /function printSelectedResult\(\)/,
    );

    assert.match(
      app,
      /window\.print\(\)/,
    );

    assert.doesNotMatch(
      app,
      /html2canvas|jsPDF|jspdf|pdf\.addPage|pdf\.save/,
    );

    assert.match(
      css,
      /@page\{[\s\S]*?size:A4 portrait;[\s\S]*?margin:11mm/,
    );
  },
);

test(
  'print export contains only the clean selected-country stage',
  () => {
    assert.match(
      app,
      /stage\.className =\s*'result-print-stage'/,
    );

    assert.match(
      app,
      /wrapper\.className =\s*'result-print-country'/,
    );

    assert.match(
      css,
      /body\.result-printing>[\s\S]*?:not\(\.result-print-stage\)[\s\S]*?display:none!important/,
    );
  },
);

test(
  'Safari print keeps country page breaks with internal content freely fragmentable',
  () => {
    assert.doesNotMatch(
      app,
      /alignPrintCountriesToPageGrid|result-print-page-fill|result-print-page-probe/,
    );

    assert.match(
      css,
      /\.result-print-country\+[\s\S]*?\.result-print-country\{[\s\S]*?break-before:page;[\s\S]*?page-break-before:always/,
    );

    assert.match(
      css,
      /\.result-print-stage \*\{[\s\S]*?break-inside:auto!important;[\s\S]*?page-break-inside:auto!important/,
    );

    assert.doesNotMatch(
      css,
      /result-print-stage-measuring|result-print-page-fill|result-print-page-probe/,
    );

    assert.doesNotMatch(
      css,
      /break-inside:avoid|page-break-inside:avoid|TEMP SAFARI BISECT/,
    );
  },
);

test(
  'selected sources stay native document links',
  () => {
    assert.match(
      app,
      /country-info-export-sources/,
    );

    assert.match(
      app,
      /link\.href = source\.href/,
    );

    assert.match(
      css,
      /\.result-export-country-page a\{[\s\S]*?text-decoration:underline/,
    );
  },
);

test(
  'route filter asks whether countries without selected route categories should remain',
  () => {
    assert.match(
      html,
      /id="saveNoMatchingRoutes"[\s\S]*?hidden/,
    );

    assert.match(
      html,
      /id="saveCountriesWithoutSelectedRoutes"[\s\S]*?checked/,
    );

    assert.match(
      html,
      /Всё равно включить эти страны в PDF/,
    );

    assert.match(
      app,
      /function countriesWithoutSelectedRoutes\(/,
    );

    assert.match(
      app,
      /function syncCountriesWithoutSelectedRoutesOption\(/,
    );

    assert.match(
      app,
      /routeGroups\.size > 0[\s\S]*?withoutRoutes\.length > 0/,
    );
  },
);

test(
  'countries without selected route categories are excluded only by explicit user choice',
  () => {
    assert.match(
      app,
      /includeCountriesWithoutRoutes\s*=\s*\$\('#saveCountriesWithoutSelectedRoutes'\)\.checked/,
    );

    assert.match(
      app,
      /includeCountriesWithoutRoutes[\s\S]*?\?\s*\[\][\s\S]*?:\s*countriesWithoutSelectedRoutes/,
    );

    assert.match(
      app,
      /selectedCountryIds\.filter\(/,
    );
  },
);

test(
  'route-country warning reacts to country and route selection changes',
  () => {
    assert.match(
      app,
      /saveResultCountries'\)\.addEventListener\([\s\S]*?syncCountriesWithoutSelectedRoutesOption/,
    );

    assert.match(
      app,
      /input\[name="saveRouteGroup"\][\s\S]*?addEventListener\([\s\S]*?syncCountriesWithoutSelectedRoutesOption/,
    );
  },
);
