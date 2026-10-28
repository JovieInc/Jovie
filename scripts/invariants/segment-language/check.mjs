/** node scripts/invariants/segment-language/check.mjs [--write-baseline] */
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ancestorJson, evaluateRatchet } from '../icp-language/ratchet.mjs';

export const REPO_ROOT = fileURLToPath(new URL('../../../', import.meta.url));
export const BASELINE_RELATIVE =
  'scripts/invariants/segment-language/baseline.json';
const EXT = /\.(?:ts|tsx)$/u;
const SKIP =
  /\.(?:test|spec|stories)\.[cm]?[jt]sx?$|\/__tests__\/|\/__mocks__\//u;
const SKIP_DIRS = new Set(['node_modules', '.next', 'dist', 'coverage']);
const LITERAL = /(['"`])((?:\\.|(?!\1)[^\\\n])*)\1/gu;
// A literal is user- or agent-facing prose when it holds a space and a letter.
const PROSE = /[A-Za-z]+\s+[A-Za-z]+/u;

export function loadConfig() {
  return JSON.parse(
    readFileSync(
      join(REPO_ROOT, 'scripts/invariants/segment-language/config.json'),
      'utf8'
    )
  );
}

export function termRegex(terms) {
  const body = terms
    .map(t => t.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&').replace(/ /gu, '\\s+'))
    .join('|');
  return new RegExp(`\\b(?:${body})(?:s|es)?\\b`, 'iu');
}

const sha = text => createHash('sha1').update(text).digest('hex').slice(0, 10);

/** Violation ids for one source file: `term:path:hash(literal)`. */
export function violationsInSource(source, path, config) {
  const re = termRegex(config.terms);
  const ids = new Map();
  for (const line of source.split('\n')) {
    const trimmed = line.trim();
    if (/^(?:\/\/|\*|\/\*|import\s)/u.test(trimmed)) continue;
    for (const match of line.matchAll(LITERAL)) {
      const text = match[2];
      if (!PROSE.test(text)) continue;
      const hit = re.exec(text);
      if (!hit) continue;
      const term = hit[0].toLowerCase().replace(/\s+/gu, ' ');
      ids.set(`${term}:${path}:${sha(text)}`, text.slice(0, 80));
    }
  }
  return ids;
}

function walk(dir, out) {
  let names;
  try {
    names = readdirSync(dir);
  } catch {
    return;
  }
  for (const name of names) {
    if (SKIP_DIRS.has(name)) continue;
    const abs = join(dir, name);
    const stat = statSync(abs);
    if (stat.isDirectory()) walk(abs, out);
    else if (EXT.test(name) && !SKIP.test(abs)) out.push(abs);
  }
}

export function scanSegmentLanguage(
  repoRoot = REPO_ROOT,
  config = loadConfig()
) {
  const files = [];
  for (const root of config.roots) walk(join(repoRoot, root), files);
  const samples = new Map();
  for (const abs of files) {
    const rel = relative(repoRoot, abs).split('\\').join('/');
    if (config.exemptPrefixes.some(p => rel.startsWith(p))) continue;
    const found = violationsInSource(readFileSync(abs, 'utf8'), rel, config);
    for (const [id, sample] of found) samples.set(id, sample);
  }
  return { ids: [...samples.keys()].sort(), samples, files: files.length };
}

export function readBaseline(repoRoot = REPO_ROOT) {
  const parsed = JSON.parse(
    readFileSync(join(repoRoot, BASELINE_RELATIVE), 'utf8')
  );
  if (!Array.isArray(parsed.ids) || typeof parsed.count !== 'number') {
    throw new Error(`${BASELINE_RELATIVE} must have count and ids`);
  }
  return parsed;
}

export function checkSegmentLanguage(repoRoot = REPO_ROOT, options = {}) {
  const scanned =
    options.scanned ?? scanSegmentLanguage(repoRoot, options.config);
  const failures = [];
  const recorded = options.recorded ?? readBaseline(repoRoot);
  if (recorded.count !== recorded.ids.length) {
    failures.push(
      `baseline count ${recorded.count} does not match ${recorded.ids.length} ids`
    );
  }
  const ancestor =
    options.ancestor ?? ancestorJson(repoRoot, BASELINE_RELATIVE);
  if (!ancestor.ok) failures.push(ancestor.error);
  else {
    failures.push(
      ...evaluateRatchet({
        current: scanned.ids,
        recorded: recorded.ids,
        ancestor: ancestor.ancestor?.ids ?? null,
      })
    );
  }
  return { failures, count: scanned.ids.length, samples: scanned.samples };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  if (process.argv.includes('--write-baseline')) {
    const { ids } = scanSegmentLanguage();
    writeFileSync(
      join(REPO_ROOT, BASELINE_RELATIVE),
      `${JSON.stringify({ schema: 'jovie.segment-language-baseline/v1', count: ids.length, ids })}\n`
    );
    process.stdout.write(
      `segment-language: wrote baseline count ${ids.length}\n`
    );
  }
  const result = checkSegmentLanguage();
  if (result.failures.length > 0) {
    process.stderr.write(
      `Segment words in in-app copy must come from the tagged registry (apps/web/lib/creator/segment-registry.ts).\n${result.failures.join('\n\n')}\n`
    );
    process.exitCode = 1;
  } else {
    process.stdout.write(
      `segment-language: ok (${result.count} baselined, shrink-only)\n`
    );
  }
}
