import { cp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { extname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const appRoot = resolve(fileURLToPath(new URL('..', import.meta.url)));
const outputRoot = resolve(process.argv[2] || resolve(appRoot, '.pages-artifact'));
const files = [
  '.nojekyll', 'index.html', 'payment-config.js', 'cookie-consent.css', 'cookie-consent.js', 'clarity-loader.js',
  'assets', 'landing', 'matcher', 'pilot', 'js',
  'data/ES-research-v4.0.json', 'data/AR-research-v4.0.json', 'data/UY-research-v4.0.json', 'data/BR-research-v4.0.json', 'data/PT-research-v4.0.json', 'data/MX-research-v4.0.json', 'data/PY-research-v4.0.json', 'data/CO-research-v4.0.json', 'data/ME-research-v4.0.json', 'data/CL-research-v4.0.json', 'data/GR-research-v4.0.json', 'data/CR-research-v4.0.json', 'data/EC-research-v4.0.json',
  'data/active-countries.json',
  'data/quality-of-life-ru.json', 'data/country-consultants-ru.json', 'data/fx-fallback.json', 'data/indexed-unit-rates.json', 'data/schemas/user-profile-v1.schema.json',
];

const APP_VERSION_PATTERN = /^\d+\.\d+\.\d+$/;
const BUILD_ID_PATTERN = /^[A-Za-z0-9._-]+$/;

function requireBuildId(value, source) {
  const normalized = value?.trim();
  if (!normalized || !BUILD_ID_PATTERN.test(normalized)) {
    throw new Error(`${source} must contain only letters, numbers, dot, underscore or hyphen`);
  }
  return normalized;
}

async function resolveAppVersion() {
  const value = process.env.APP_VERSION?.trim() || (await readFile(resolve(appRoot, 'VERSION'), 'utf8')).trim();
  if (!APP_VERSION_PATTERN.test(value)) throw new Error(`Invalid app version: ${value}`);
  return value;
}

function resolveBuildId() {
  if (process.env.BUILD_ID?.trim()) return requireBuildId(process.env.BUILD_ID, 'BUILD_ID');

  if (process.env.GITHUB_RUN_ID?.trim()) {
    const sha = (process.env.GITHUB_SHA || 'no-sha').trim().slice(0, 12) || 'no-sha';
    const attempt = (process.env.GITHUB_RUN_ATTEMPT || '1').trim();
    return requireBuildId(`${sha}-${process.env.GITHUB_RUN_ID.trim()}-${attempt}`, 'GitHub build id');
  }

  let sha = 'no-git';
  try {
    sha = execFileSync('git', ['rev-parse', '--short=12', 'HEAD'], {
      cwd: resolve(appRoot, '..'),
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim() || sha;
  } catch {
    // A source archive may not include .git. Local builds still get a unique id.
  }
  return requireBuildId(`${sha}-local-${Date.now().toString(36)}`, 'local build id');
}

function withBuildId(specifier, buildId) {
  if (!/^\.\.?\//.test(specifier)) return specifier;

  const hashIndex = specifier.indexOf('#');
  const hash = hashIndex >= 0 ? specifier.slice(hashIndex) : '';
  const withoutHash = hashIndex >= 0 ? specifier.slice(0, hashIndex) : specifier;
  const queryIndex = withoutHash.indexOf('?');
  const pathname = queryIndex >= 0 ? withoutHash.slice(0, queryIndex) : withoutHash;
  const query = queryIndex >= 0 ? withoutHash.slice(queryIndex + 1) : '';
  if (!/\.(?:js|css)$/i.test(pathname)) return specifier;

  const params = new URLSearchParams(query);
  params.set('v', buildId);
  return `${pathname}?${params.toString()}${hash}`;
}

function rewriteJavaScript(source, buildId) {
  let rewritten = source.replace(
    /(\b(?:from|import)\s*)(["'])(\.\.?\/[^"']+\.js(?:\?[^"']*)?(?:#[^"']*)?)\2/g,
    (match, prefix, quote, specifier) => `${prefix}${quote}${withBuildId(specifier, buildId)}${quote}`,
  );
  rewritten = rewritten.replace(
    /(\bimport\s*\(\s*)(["'])(\.\.?\/[^"']+\.js(?:\?[^"']*)?(?:#[^"']*)?)\2(\s*\))/g,
    (match, prefix, quote, specifier, suffix) => `${prefix}${quote}${withBuildId(specifier, buildId)}${quote}${suffix}`,
  );
  return rewritten;
}

function rewriteHtml(source, buildId) {
  let rewritten = source.replace(/<script\b[^>]*>/gi, (tag) => tag.replace(
    /\bsrc=(["'])(\.\.?\/[^"']+\.js(?:\?[^"']*)?(?:#[^"']*)?)\1/i,
    (match, quote, specifier) => `src=${quote}${withBuildId(specifier, buildId)}${quote}`,
  ));

  rewritten = rewritten.replace(/<link\b[^>]*>/gi, (tag) => {
    if (!/\brel=(["'])stylesheet\1/i.test(tag)) return tag;
    return tag.replace(
      /\bhref=(["'])(\.\.?\/[^"']+\.css(?:\?[^"']*)?(?:#[^"']*)?)\1/i,
      (match, quote, specifier) => `href=${quote}${withBuildId(specifier, buildId)}${quote}`,
    );
  });
  return rewritten;
}

async function runtimeTextFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const paths = [];
  for (const entry of entries) {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) paths.push(...await runtimeTextFiles(path));
    else if (['.js', '.html'].includes(extname(entry.name))) paths.push(path);
  }
  return paths;
}

async function rewriteRuntimeReferences(buildId) {
  for (const path of await runtimeTextFiles(outputRoot)) {
    const source = await readFile(path, 'utf8');
    const rewritten = path.endsWith('.js')
      ? rewriteJavaScript(source, buildId)
      : rewriteHtml(source, buildId);
    if (rewritten !== source) await writeFile(path, rewritten);
  }
}

async function injectRootMetadata(appVersion, buildId) {
  const indexPath = resolve(outputRoot, 'index.html');
  let html = await readFile(indexPath, 'utf8');
  if (!/<span\s+data-app-version>[^<]*<\/span>/i.test(html)) {
    throw new Error('index.html must contain a data-app-version span');
  }
  html = html.replace(/(<span\s+data-app-version>)[^<]*(<\/span>)/i, `$1${appVersion}$2`);

  const buildMeta = `  <meta name="countrymatcher-build-id" content="${buildId}">`;
  if (/<meta\s+name=["']countrymatcher-build-id["']/i.test(html)) {
    html = html.replace(/<meta\s+name=["']countrymatcher-build-id["'][^>]*>/i, buildMeta.trim());
  } else {
    html = html.replace(/<head>/i, `<head>\n${buildMeta}`);
  }
  await writeFile(indexPath, html);
}

async function injectLandingVersion(appVersion) {
  const landingPath = resolve(outputRoot, 'landing/index.html');
  let html = await readFile(landingPath, 'utf8');
  if (!/<span\s+data-app-version>[^<]*<\/span>/i.test(html)) {
    throw new Error('landing/index.html must contain a data-app-version span');
  }
  html = html.replace(/(<span\s+data-app-version>)[^<]*(<\/span>)/i, `$1${appVersion}$2`);
  await writeFile(landingPath, html);
}

const appVersion = await resolveAppVersion();
const buildId = resolveBuildId();

await rm(outputRoot, { recursive: true, force: true });
await mkdir(outputRoot, { recursive: true });
for (const relative of files) {
  const destination = resolve(outputRoot, relative);
  await mkdir(resolve(destination, '..'), { recursive: true });
  await cp(resolve(appRoot, relative), destination, { recursive: true });
}
await injectRootMetadata(appVersion, buildId);
await injectLandingVersion(appVersion);
await rewriteRuntimeReferences(buildId);

console.log(`Pages artifact built at ${outputRoot}`);
console.log(`App version: ${appVersion}`);
console.log(`Build id: ${buildId}`);
