#!/usr/bin/env node
/**
 * Design-noise guard (founder bans, 2026-10-28): static, ratcheted.
 *
 * Rules (each counted per file against design-noise.baseline.json, shrink-only):
 *   icon-tile        an icon/emoji that is the sole child of an element with a
 *                    border, ring or background fill. Bare icons only.
 *   icon-tile-comp   use of IconBadge / IconTile / IconGlyphFrame components.
 *   step-label       visible "Step N" text. Use <ol> and `sr-only`.
 *   email-capture    an ad-hoc email field. Use DS InlineSubscribe.
 *   disabled-submit  a submit Button disabled by field validity (renders grey).
 *                    Validate on submit instead.
 *   filler-bio       a placeholder bio ("Public creator profile on Jovie.").
 *   copy-redundancy  a string that restates a button/CTA label as helper text
 *                    ("Subscribe to ..." under a Subscribe button).
 *
 * Rendered counterparts (text-layer budget, icon tiles, step labels) live in
 * tests/e2e/marketing-noise-budget.spec.ts.
 *
 *   node scripts/lint-design-noise.mjs [--list] [--update]
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, '..', '..', '..');
export const BASELINE_PATH = join(here, '..', 'design-noise.baseline.json');

const ICON_TILE =
  /<(div|span)\b[^>]*className=(?:'([^']*)'|"([^"]*)"|\{`([^`]*)`\})[^>]*>\s*(?:<[A-Za-z.]*(?:Icon|Svg)\w*\b[^>]*\/>|<(?:step|feature|benefit|item)\.icon\b[^>]*\/>|<[A-Z]\w*\b[^>]*aria-hidden[^>]*\/>|\p{Extended_Pictographic}+|\{[a-z.]*[iI]con\})\s*<\/\1>/gu;
const FILLER_BIO =
  /['"`>](?:Public (?:creator|artist) profile on Jovie\.?|No bio (?:yet|available)\.?|This (?:creator|artist) has not added a bio\.?)['"`<]/g;
const TILE_COMPONENT = /<(?:IconBadge|IconTile|IconGlyphFrame)\b/g;
const STEP_LABEL = /(?:>|\s)Step\s*(?:\{[^}]+\}|\d+)\s*(?:<|$)/g;
const DISABLED_SUBMIT =
  /<Button\b(?=[^>]*type=['"]submit['"])[^>]*disabled=\{[^}]*(?:![a-zA-Z]|\.trim\(\)|\.length|=== ?''|isValid|isEmpty)/g;
const EMAIL_FIELD = /<(?:input|Input)\b[^>]*type=['"]email['"]/g;
const LABEL_KEYS =
  /(?:buttonLabel|submitLabel|ctaLabel|actionLabel)\s*[:=]\s*\{?['"]([A-Z][\w']+)(?:\s[^'"]*)?['"]/g;

function lineOf(source, index) {
  return source.slice(0, index).split('\n').length;
}

/** @returns {{ rule: string, line: number }[]} */
export function findNoise(source, file = '') {
  const found = [];
  const isDsEmailOwner = /packages\/ui\/atoms\/inline-subscribe\.tsx$/.test(
    file
  );

  const iconNames = new Set(['Icon']);
  for (const imp of source.matchAll(
    /import\s*\{([^}]*)\}\s*from\s*['"](?:lucide-react|@heroicons[^'"]*|react-icons[^'"]*|@phosphor-icons[^'"]*)['"]/g
  )) {
    for (const part of imp[1].split(',')) {
      const name = part
        .trim()
        .split(/\s+as\s+/)
        .pop();
      if (name) iconNames.add(name);
    }
  }
  const namedIcon = new RegExp(
    `<(div|span)\\b[^>]*className=(?:'([^']*)'|"([^"]*)"|\\{\`([^\`]*)\`\\})[^>]*>\\s*<(?:${[...iconNames].join('|')})\\b[^>]*\\/>\\s*<\\/\\1>`,
    'g'
  );
  const seenTiles = new Set();
  for (const m of [
    ...source.matchAll(ICON_TILE),
    ...source.matchAll(namedIcon),
  ]) {
    if (seenTiles.has(m.index)) continue;
    seenTiles.add(m.index);
    const cls = m[2] ?? m[3] ?? m[4] ?? '';
    if (
      /\b(border|ring-|bg-)/.test(cls) &&
      /(rounded|size-|h-\d+ w-\d+|h-\d+)/.test(cls) &&
      !/bg-(transparent|none)\b/.test(cls)
    ) {
      found.push({ rule: 'icon-tile', line: lineOf(source, m.index) });
    }
  }
  for (const m of source.matchAll(FILLER_BIO)) {
    found.push({ rule: 'filler-bio', line: lineOf(source, m.index) });
  }
  for (const m of source.matchAll(TILE_COMPONENT)) {
    found.push({ rule: 'icon-tile-comp', line: lineOf(source, m.index) });
  }
  for (const m of source.matchAll(STEP_LABEL)) {
    const before = source.slice(Math.max(0, m.index - 140), m.index);
    if (/sr-only[^<]*>?$/.test(before) || /sr-only/.test(before.slice(-80))) {
      continue;
    }
    found.push({ rule: 'step-label', line: lineOf(source, m.index) });
  }
  if (!isDsEmailOwner && !/\bInlineSubscribe\b/.test(source)) {
    for (const m of source.matchAll(EMAIL_FIELD)) {
      found.push({ rule: 'email-capture', line: lineOf(source, m.index) });
    }
  }
  for (const m of source.matchAll(DISABLED_SUBMIT)) {
    found.push({ rule: 'disabled-submit', line: lineOf(source, m.index) });
  }
  for (const m of source.matchAll(LABEL_KEYS)) {
    const verb = m[1];
    const restate = new RegExp(
      `['"\`]${verb}\\s+(?:to\\s+)?\\w+\\s+\\w+[^'"\`]*['"\`]`,
      'g'
    );
    for (const r of source.matchAll(restate)) {
      if (r.index === m.index) continue;
      if (/Label\s*[:=]/.test(source.slice(Math.max(0, r.index - 20), r.index)))
        continue;
      found.push({ rule: 'copy-redundancy', line: lineOf(source, r.index) });
    }
  }
  return found;
}

function listFiles() {
  return execFileSync('git', ['ls-files', 'apps/web', 'packages/ui'], {
    cwd: repoRoot,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  })
    .split('\n')
    .filter(f => f.endsWith('.tsx'))
    .filter(
      f =>
        !/\.(test|stories|spec)\.tsx$/.test(f) &&
        !/\/(exp|fixtures|__tests__|node_modules)\//.test(f)
    );
}

/** @returns {Record<string, Record<string, number>>} file -> rule -> count */
export function collect() {
  const result = {};
  for (const file of listFiles()) {
    let source;
    try {
      source = readFileSync(join(repoRoot, file), 'utf8');
    } catch {
      continue;
    }
    for (const { rule } of findNoise(source, file)) {
      result[file] ??= {};
      result[file][rule] = (result[file][rule] ?? 0) + 1;
    }
  }
  return result;
}

export function compareToBaseline(current, baseline) {
  const problems = [];
  const keys = new Set([...Object.keys(current), ...Object.keys(baseline)]);
  for (const file of keys) {
    const rules = new Set([
      ...Object.keys(current[file] ?? {}),
      ...Object.keys(baseline[file] ?? {}),
    ]);
    for (const rule of rules) {
      const now = current[file]?.[rule] ?? 0;
      const was = baseline[file]?.[rule] ?? 0;
      if (now > was) {
        problems.push(
          `${file}: ${rule} x${now} (baseline ${was}). ${HINTS[rule]}`
        );
      } else if (now < was) {
        problems.push(
          `${file}: ${rule} debt shrank (${now} < ${was}); run node scripts/lint-design-noise.mjs --update.`
        );
      }
    }
  }
  return problems;
}

const HINTS = {
  'icon-tile': 'Remove the bordered/filled container; render the bare icon.',
  'icon-tile-comp':
    'IconBadge/IconTile/IconGlyphFrame are retired; use a bare icon.',
  'step-label': 'Use <ol> and an sr-only step count, never visible "Step N".',
  'email-capture': 'Use InlineSubscribe from @jovie/ui/atoms/inline-subscribe.',
  'disabled-submit': 'Never a grey disabled submit; validate on submit.',
  'copy-redundancy': 'Helper text restates the button label; delete it.',
  'filler-bio': 'Show the real bio or nothing; never a filler line.',
};

function main() {
  const args = new Set(process.argv.slice(2));
  const current = collect();
  if (args.has('--list')) console.log(JSON.stringify(current, null, 2));
  if (args.has('--update')) {
    writeFileSync(
      BASELINE_PATH,
      `${JSON.stringify({ files: current }, null, 2)}\n`
    );
    console.log(
      `design-noise baseline updated (${Object.keys(current).length} files)`
    );
    return;
  }
  const baseline = JSON.parse(readFileSync(BASELINE_PATH, 'utf8')).files;
  const problems = compareToBaseline(current, baseline);
  if (problems.length) {
    console.error(problems.join('\n'));
    process.exit(1);
  }
  console.log(
    `design-noise guard ok (${Object.keys(baseline).length} baselined files)`
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
