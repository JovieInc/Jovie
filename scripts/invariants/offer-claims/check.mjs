#!/usr/bin/env node
// Offer-claims guard (offer-truth design, fleet/offer-truth.md).
//
// Every user-visible sentence about price, trial, billing, renewal,
// cancellation, refunds or guarantees must be a registered claim rendered from
// the canonical offer (apps/web/lib/billing/offer). This guard finds such
// prose written by hand anywhere else and ratchets: a file may never gain
// hits, and baseline entries that no longer hit must be removed. The baseline
// is the migration backlog; `baseline.json` changes need code-owner review.
//
// Deterministic: no network, no model, no feature flag. Whole-tree scan.
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { extname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = fileURLToPath(new URL('.', import.meta.url));
export const config = JSON.parse(
  readFileSync(join(here, 'config.json'), 'utf8')
);
export const BASELINE_PATH = join(here, 'baseline.json');

for (const e of [...config.exclude, ...config.skipLiterals]) {
  if (!e.reason?.trim())
    throw new Error('Every offer-claims exception needs a reason');
}

export const PATTERNS = config.patterns.map(p => ({
  id: p.id,
  regex: new RegExp(p.source, 'iu'),
}));
const EXCLUDES = config.exclude.map(e => new RegExp(e.path, 'u'));
const IDENT_LIKE = /^[\w.:/@#$-]+$/u;
const CADENCE_ONLY = /^\/\s?(?:mo|month|yr|year)$/iu;
const TS_EXT = new Set([
  '.ts',
  '.tsx',
  '.js',
  '.jsx',
  '.mjs',
  '.cjs',
  '.mts',
  '.cts',
]);
const TEXT_EXT = new Set(config.textExtensions);

export function isExcluded(path) {
  return EXCLUDES.some(r => r.test(path));
}

/** Pattern ids that a piece of text hits. */
export function hits(text) {
  return PATTERNS.filter(p => p.regex.test(text)).map(p => p.id);
}

function addHits(counts, text) {
  for (const id of hits(text)) counts[id] = (counts[id] ?? 0) + 1;
}

function stripLineComments(text) {
  return text
    .replace(/\/\*[^]*?\*\//gu, ' ')
    .split('\n')
    .map(l => l.replace(/(^|\s)\/\/.*$/u, '$1'))
    .join('\n');
}

let tsApi;
function typescript(cwd) {
  tsApi ??= createRequire(join(cwd, 'package.json'))('typescript');
  return tsApi;
}

/** String-literal and JSX text contents of a TS/JS source. Identifiers and comments are ignored. */
export function literals(source, fileName, cwd = process.cwd()) {
  const ts = typescript(cwd);
  const kind =
    extname(fileName) === '.tsx' || extname(fileName) === '.jsx'
      ? ts.ScriptKind.TSX
      : ts.ScriptKind.TS;
  const sf = ts.createSourceFile(
    fileName,
    source,
    ts.ScriptTarget.Latest,
    true,
    kind
  );
  const out = [];
  const visit = node => {
    const k = node.kind;
    if (
      (k === ts.SyntaxKind.StringLiteral ||
        k === ts.SyntaxKind.NoSubstitutionTemplateLiteral ||
        k === ts.SyntaxKind.TemplateHead ||
        k === ts.SyntaxKind.TemplateMiddle ||
        k === ts.SyntaxKind.TemplateTail ||
        k === ts.SyntaxKind.JsxText) &&
      !ts.isImportDeclaration(node.parent) &&
      !ts.isExportDeclaration(node.parent) &&
      !(
        ts.isLiteralTypeNode(node.parent) &&
        node.parent.parent &&
        ts.isTypeAliasDeclaration(node.parent.parent)
      )
    ) {
      const text = (node.text ?? '').trim();
      const plain = IDENT_LIKE.test(text) && !/\$\d|-day/u.test(text);
      if (text && (!plain || CADENCE_ONLY.test(text))) out.push(text);
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return out;
}

const OFFER_PROPS = new Set([
  'price',
  'lowPrice',
  'highPrice',
  'priceCurrency',
  'billingIncrement',
  'priceValidUntil',
]);

/**
 * schema.org Offer fields written as literals (price, currency, billing
 * increment). They must come from the offer module like any other claim:
 * Google shows them as rich results. Only files that build an `Offer` count.
 */
export function structuredOfferLiterals(source, fileName, cwd = process.cwd()) {
  if (!/['"]Offer['"]/u.test(source)) return 0;
  const ts = typescript(cwd);
  const kind =
    extname(fileName) === '.tsx' ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  const sf = ts.createSourceFile(
    fileName,
    source,
    ts.ScriptTarget.Latest,
    true,
    kind
  );
  let n = 0;
  const visit = node => {
    if (
      ts.isPropertyAssignment(node) &&
      OFFER_PROPS.has(node.name.getText(sf).replace(/['"]/gu, '')) &&
      (ts.isStringLiteral(node.initializer) ||
        ts.isNumericLiteral(node.initializer) ||
        ts.isNoSubstitutionTemplateLiteral(node.initializer))
    ) {
      n += 1;
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return n;
}

/** Hit counts per pattern id for one file's content. */
export function countFile(path, content, cwd = process.cwd()) {
  const counts = {};
  const ext = extname(path);
  if (TS_EXT.has(ext)) {
    for (const lit of literals(content, path, cwd)) addHits(counts, lit);
    const structured = structuredOfferLiterals(content, path, cwd);
    if (structured) counts.structured_offer_literal = structured;
  } else if (TEXT_EXT.has(ext)) {
    const body =
      ext === '.swift' || ext === '.kt' ? stripLineComments(content) : content;
    for (const line of body.split('\n')) addHits(counts, line);
  }
  return counts;
}

export function listFiles(cwd) {
  const out = execFileSync('git', ['ls-files', '-z', ...config.roots], {
    cwd,
    maxBuffer: 1 << 28,
  });
  return out.toString('utf8').split('\0').filter(Boolean);
}

export function scan(cwd = process.cwd(), files = listFiles(cwd)) {
  const result = {};
  for (const f of files) {
    if (isExcluded(f)) continue;
    const ext = extname(f);
    if (!TS_EXT.has(ext) && !TEXT_EXT.has(ext)) continue;
    let content;
    try {
      content = readFileSync(join(cwd, f), 'utf8');
    } catch {
      continue;
    }
    const counts = countFile(f, content, cwd);
    if (Object.keys(counts).length) result[f] = counts;
  }
  return result;
}

/** Ratchet: no new files, no increases, no stale baseline entries. */
export function evaluate(current, baseline) {
  const errors = [];
  for (const [file, counts] of Object.entries(current)) {
    for (const [id, n] of Object.entries(counts)) {
      const allowed = baseline[file]?.[id] ?? 0;
      if (n > allowed) {
        errors.push(
          `${file}: ${n} hand-written ${id} claim(s), baseline ${allowed}. Render it from apps/web/lib/billing/offer (registered claim id) instead.`
        );
      }
    }
  }
  for (const [file, counts] of Object.entries(baseline)) {
    for (const [id, n] of Object.entries(counts)) {
      const now = current[file]?.[id] ?? 0;
      if (now < n) {
        errors.push(
          `${file}: baseline ${id}=${n} but only ${now} now. Lower baseline.json (it only shrinks).`
        );
      }
    }
  }
  return errors;
}

export function main(argv = process.argv.slice(2), cwd = process.cwd()) {
  const current = scan(cwd);
  if (argv.includes('--write-baseline')) {
    const sorted = Object.fromEntries(
      Object.entries(current).sort(([a], [b]) => (a < b ? -1 : 1))
    );
    writeFileSync(BASELINE_PATH, `${JSON.stringify(sorted, null, 2)}\n`);
    const total = Object.values(sorted).reduce(
      (s, c) => s + Object.values(c).reduce((a, b) => a + b, 0),
      0
    );
    console.log(
      `offer-claims: wrote baseline, ${Object.keys(sorted).length} files, ${total} hits`
    );
    return 0;
  }
  const baseline = JSON.parse(readFileSync(BASELINE_PATH, 'utf8'));
  const errors = evaluate(current, baseline);
  if (errors.length) {
    console.error(
      `offer-claims: ${errors.length} violation(s)\n${errors.map(e => `  - ${e}`).join('\n')}`
    );
    return 1;
  }
  const total = Object.values(baseline).reduce(
    (s, c) => s + Object.values(c).reduce((a, b) => a + b, 0),
    0
  );
  console.log(
    `offer-claims: ok (${total} baselined hand-written claims in ${Object.keys(baseline).length} files)`
  );
  return 0;
}

if (resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url)) {
  process.exit(main());
}
void relative;
