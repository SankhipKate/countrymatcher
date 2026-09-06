import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { rp4FilenameForCode } from '../js/active-country-manifest.js';

const appRoot = resolve(fileURLToPath(new URL('..', import.meta.url)));
const repoRoot = resolve(appRoot, '..');
const sourceDocumentsRoot = resolve(repoRoot, 'source-documents');
const manifestPath = resolve(appRoot, 'data/active-countries.json');
const researchOrderPath = resolve(sourceDocumentsRoot, 'COUNTRY_RESEARCH_ORDER_v4.0.json');
const checkOnly = process.argv.includes('--check');

const generatedSections = [
  {
    path: resolve(appRoot, 'README.md'),
    marker: 'ACTIVE_COUNTRIES_INLINE',
    render: (manifest) => `- активные страны: ${joinRussian(manifest.map(({ name }) => name))};`,
  },
  {
    path: resolve(appRoot, 'README.md'),
    marker: 'ACTIVE_RP4_PATHS',
    render: (manifest) => `- \`data/{${manifest.map(({ code }) => code).join(',')}}-research-v4.0.json\` — активные Research Package;`,
  },
  {
    path: resolve(appRoot, 'docs/research/README.md'),
    marker: 'ACTIVE_RESEARCH_PACKAGES',
    render: (manifest) => [
      `В активный matcher подключены ${manifest.length} Research Package 4.0:`,
      '',
      ...manifest.map(({ code, name }, index) => `- ${name} — \`../../data/${rp4FilenameForCode(code)}\`${index === manifest.length - 1 ? '.' : ';'}`),
    ].join('\n'),
  },
  {
    path: resolve(sourceDocumentsRoot, 'PROJECT_OVERVIEW_v4.0.md'),
    marker: 'ACTIVE_COUNTRIES_LIST',
    render: (manifest) => manifest.map(({ name }, index) => `- ${name}${index === manifest.length - 1 ? '.' : ';'}`).join('\n'),
  },
  {
    path: resolve(sourceDocumentsRoot, 'PROJECT_OVERVIEW_v4.0.md'),
    marker: 'ACTIVE_RP4_PATHS',
    render: (manifest) => `- \`countrymatcher/data/{${manifest.map(({ code }) => code).join(',')}}-research-v4.0.json\`.`,
  },
];

function joinRussian(values) {
  if (values.length <= 1) return values[0] || '';
  return `${values.slice(0, -1).join(', ')} и ${values.at(-1)}`;
}

function generatedMarkers(marker) {
  return [
    `<!-- BEGIN GENERATED ${marker} -->`,
    `<!-- END GENERATED ${marker} -->`,
  ];
}

function replaceGeneratedSection(text, marker, content, path) {
  const [start, end] = generatedMarkers(marker);
  const startIndex = text.indexOf(start);
  const endIndex = text.indexOf(end);
  if (startIndex === -1 || endIndex === -1 || endIndex < startIndex) {
    throw new Error(`${path}: generated section ${marker} markers are missing or malformed`);
  }
  const afterEnd = endIndex + end.length;
  return `${text.slice(0, startIndex)}${start}\n${content.trimEnd()}\n${end}${text.slice(afterEnd)}`;
}

function synchronizedResearchOrder(researchOrder, manifest) {
  const activeNames = new Set(manifest.map(({ name }) => name));
  const rowsByName = new Map(researchOrder.countries.map((row) => [row.country, row]));
  const missing = [...activeNames].filter((name) => !rowsByName.has(name));
  if (missing.length) throw new Error(`active countries missing from research order: ${missing.join(', ')}`);

  const unexpectedConnected = researchOrder.countries
    .filter(({ research_status, country }) => research_status === 'Подключена' && !activeNames.has(country))
    .map(({ country }) => country);
  if (unexpectedConnected.length) {
    throw new Error(`research order has connected countries absent from manifest; deactivation requires an explicit decision: ${unexpectedConnected.join(', ')}`);
  }

  let changed = false;
  const countries = researchOrder.countries.map((row) => {
    if (activeNames.has(row.country) && row.research_status !== 'Подключена') {
      changed = true;
      return { ...row, research_status: 'Подключена' };
    }
    return row;
  });
  return {
    ...researchOrder,
    ...(changed ? { updated_at: new Date().toISOString().slice(0, 10) } : {}),
    countries,
  };
}

async function expectedOutputs() {
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  const researchOrder = JSON.parse(await readFile(researchOrderPath, 'utf8'));
  const synchronizedOrder = synchronizedResearchOrder(researchOrder, manifest);
  const outputs = [];

  const sectionsByPath = new Map();
  for (const section of generatedSections) {
    const sections = sectionsByPath.get(section.path) || [];
    sections.push(section);
    sectionsByPath.set(section.path, sections);
  }
  for (const [path, sections] of sectionsByPath) {
    let expected = await readFile(path, 'utf8');
    for (const section of sections) {
      expected = replaceGeneratedSection(expected, section.marker, section.render(manifest), path);
    }
    outputs.push({ path, expected: Buffer.from(expected) });
  }

  const expectedResearchOrder = `${JSON.stringify(synchronizedOrder, null, 2)}\n`;
  outputs.push({ path: researchOrderPath, expected: Buffer.from(expectedResearchOrder) });

  return outputs;
}

async function main() {
  const outputs = await expectedOutputs();
  const drift = [];
  for (const output of outputs) {
    const current = await readFile(output.path);
    if (!current.equals(output.expected)) drift.push(output);
  }

  if (checkOnly) {
    if (drift.length) {
      for (const { path } of drift) console.error(`DRIFT: ${path.slice(repoRoot.length + 1)}`);
      console.error('Run: npm run release:sync');
      process.exitCode = 1;
      return;
    }
    console.log('PASS: generated release assets are synchronized');
    return;
  }

  for (const { path, expected } of drift) await writeFile(path, expected);
  console.log(drift.length ? `Updated ${drift.length} generated release asset(s).` : 'Generated release assets are already synchronized.');
}

await main();
