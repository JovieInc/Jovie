import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isCommentLine } from './lib/design-rules/forced-caps.mjs';

// Token definitions in styles/packages/ui retain their existing contracts.
// White/black remain owned by ESLint.
export const RAW_HEX_PATTERN = /#[0-9a-fA-F]{6}(?:[0-9a-fA-F]{2})?\b/g;
export const RAW_PALETTE_PATTERN =
  /\b(?:bg|text|border|ring|fill|stroke|from|to|via|outline|divide|decoration|shadow|accent|caret)-(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-\d{2,3}\b/g;
// Tailwind v4 accepts any number as a step (h-7.25 = 29px, min-h-55 = 220px),
// so an arbitrary px value no longer needs "-[". On scale, from repo canon:
// - CANONICAL_SPACING_STEPS in apps/web/scripts/optical-grid-scanners.ts (the
//   reviewed 4px optical grid; arbitrary-values-ratchet.test.ts keeps this a
//   superset of it),
// - 7 9 11 14 28: sizes docs/design-system/DETAILS.md names (28px rows and
//   CTA pill, 36px icon control, 44px hit target/header, 56px and 112px
//   section spacing),
// - 0.5 1.5 2.5 3.5: the half steps spacing-scale.baseline.json already
//   tracks (2.5/3.5 blocking, 0.5/1.5 pending the founder's strict-tier call).
export const ON_SCALE_STEPS = new Set(
  '0 0.5 1 1.5 2 2.5 3 3.5 4 5 6 7 8 9 10 11 12 14 16 20 24 28 32 40 48 56 64 72 80 96'.split(
    ' '
  )
);
export const NUMERIC_STEP_PATTERN =
  /(?<![\w-])-?(?:p[xytrblse]?|m[xytrblse]?|gap(?:-[xy])?|space-[xy]|h|w|size|min-[hw]|max-[hw]|basis|top|right|bottom|left|inset(?:-[xy])?|start|end|translate-[xy]|leading)-(\d+(?:\.\d+)?)(?![\w./%])/g;
export const OFF_SCALE_RULE = 'off-scale-step';
export const OFF_SCALE_HINT =
  'off-scale-step: use an on-scale step (ON_SCALE_STEPS in scripts/design-system-base-ratchet.mjs) or a named token (h-(--…) defined in design-system.css).';
const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const identityKey = (file, rule, value) => `${file}\t${rule}\t${value}`;

// New rule classes compare identities to trusted base source, rather than
// growing a shrink-only allowance file. Existing rule classes retain their
// committed baseline. Once a removal lands, reintroducing it fails too.
const COLOR_ROOTS = ['apps/web/app', 'apps/web/components', 'apps/web/lib'];
const COMPONENT_ROOTS = ['apps/web/components', 'packages/ui'];
const SKIP = new Set(['node_modules', '.next', 'dist', 'coverage']);
const STEP_ROOTS = [...COLOR_ROOTS, 'packages/ui'];
const COLOR_FILE = /(?<!\.(?:test|spec|stories))\.tsx?$/;
const inRoots = (roots, file) =>
  roots.some(root => file.startsWith(`${root}/`));

function git(repoRoot, args, allowNoMatches = false) {
  const result = spawnSync('git', args, {
    cwd: repoRoot,
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
  });
  if (
    result.error ||
    (result.status !== 0 && !(allowNoMatches && result.status === 1))
  ) {
    throw new Error(
      `Cannot read trusted design base: ${result.error?.message || result.stderr}`
    );
  }
  return result.stdout;
}

/** Off-scale numeric steps on one source line; comment lines are prose. */
export function offScaleSteps(line) {
  if (isCommentLine(line)) return [];
  return [...line.matchAll(NUMERIC_STEP_PATTERN)]
    .filter(match => !ON_SCALE_STEPS.has(match[1]))
    .map(match => match[0].replace(/^-/, ''));
}

function rawIdentities(file, source) {
  if (!COLOR_FILE.test(file) || file.endsWith('.d.ts')) return [];
  const colors = inRoots(COLOR_ROOTS, file)
    ? [
        { rule: 'raw-hex-color', pattern: RAW_HEX_PATTERN },
        { rule: 'raw-palette-class', pattern: RAW_PALETTE_PATTERN },
      ].flatMap(({ rule, pattern }) =>
        [...source.matchAll(new RegExp(pattern.source, pattern.flags))].map(
          match => identityKey(file, rule, match[0])
        )
      )
    : [];
  const steps = inRoots(STEP_ROOTS, file)
    ? source
        .split('\n')
        .flatMap(offScaleSteps)
        .map(value => identityKey(file, OFF_SCALE_RULE, value))
    : [];
  return [...colors, ...steps];
}

export function duplicateComponentIdentities(files) {
  const byName = new Map();
  for (const file of files) {
    const name = file.split('/').at(-1);
    if (!/^[A-Z][A-Za-z0-9]*\.tsx$/.test(name)) continue;
    const paths = byName.get(name) ?? [];
    paths.push(file);
    byName.set(name, paths);
  }
  return [...byName].flatMap(([name, paths]) =>
    paths.length > 1
      ? paths.map(path =>
          identityKey(path, 'duplicate-component', name.slice(0, -4))
        )
      : []
  );
}

function currentIdentities(repoRoot) {
  const files = [];
  const walk = dir => {
    if (!existsSync(join(repoRoot, dir))) return;
    for (const entry of readdirSync(join(repoRoot, dir), {
      withFileTypes: true,
    })) {
      const path = `${dir}/${entry.name}`;
      if (entry.isDirectory()) {
        if (!SKIP.has(entry.name)) walk(path);
      } else files.push(path);
    }
  };
  for (const root of STEP_ROOTS) walk(root);
  return [
    ...files
      .filter(file => COLOR_FILE.test(file))
      .flatMap(file =>
        rawIdentities(file, readFileSync(join(repoRoot, file), 'utf8'))
      ),
    ...duplicateComponentIdentities(
      files.filter(file => inRoots(COMPONENT_ROOTS, file))
    ),
  ];
}

// Native grep supplies matching source lines with a NUL after the filename.
// Every source rule is line-local; no checkout or per-file process needed.
function sourceIdentitiesAt(repoRoot, commit) {
  const matches = git(
    repoRoot,
    [
      'grep',
      '-I',
      '-z',
      '-E',
      '-e',
      '#[0-9a-fA-F]{6}|-[0-9]',
      commit,
      '--',
      ...STEP_ROOTS,
    ],
    true
  );
  const identities = [];
  for (const line of matches.split('\n')) {
    const separator = line.indexOf('\0');
    if (separator < 0) continue;
    const file = line.slice(commit.length + 1, separator);
    identities.push(...rawIdentities(file, line.slice(separator + 1)));
  }
  return identities;
}

export function evaluateBaseDesignRatchet(options = {}) {
  const repoRoot = options.repoRoot ?? REPO_ROOT;
  const baseRef =
    options.baseRef ?? `origin/${process.env.GITHUB_BASE_REF || 'main'}`;
  const base = git(repoRoot, [
    'rev-parse',
    '--verify',
    `${baseRef}^{commit}`,
  ]).trim();
  const baseIdentities = sourceIdentitiesAt(repoRoot, base);
  const baseFiles = git(repoRoot, [
    'ls-tree',
    '-r',
    '-z',
    '--name-only',
    base,
    '--',
    ...COMPONENT_ROOTS,
  ]);
  baseIdentities.push(
    ...duplicateComponentIdentities(baseFiles.split('\0').filter(Boolean))
  );
  const identities = [...new Set(currentIdentities(repoRoot))].sort();
  const permitted = new Set(baseIdentities);
  // A step the branch inherited from its fork point is not added by its diff:
  // while main removes steps, a stale branch must not fail for lines it never
  // touched. In the merge queue the fork point is the target tip, so a landed
  // removal still cannot regrow. Colour rules keep the stricter tip-only rule.
  const fork = spawnSync('git', ['merge-base', base, 'HEAD'], {
    cwd: repoRoot,
    encoding: 'utf8',
  }).stdout?.trim();
  if (fork && fork !== base)
    for (const key of sourceIdentitiesAt(repoRoot, fork))
      if (key.includes(`\t${OFF_SCALE_RULE}\t`)) permitted.add(key);
  const newIdentities = identities.filter(key => !permitted.has(key));
  return { ok: newIdentities.length === 0, base, identities, newIdentities };
}
