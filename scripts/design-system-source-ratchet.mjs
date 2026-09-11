#!/usr/bin/env node
/**
 * Cheap source-PR identity gate for design-system debt (JOV-5301).
 * Filesystem scan only — no Vitest, no e2e.
 *
 * Identities are `file + rule + value`. Existing identities are grandfathered
 * in the committed baseline. The lane fails only on NEW identities (or
 * documented allowlist misses). Unbaselined shrink is authorship debt for the
 * unit-test count floors (JOV-5300); this lane does not fail it.
 *
 * Count helpers and their scan roots stay locked to:
 *   apps/web/tests/unit/design-system/arbitrary-values-ratchet.test.ts
 *   apps/web/tests/unit/design-system/linear-namespace-ratchet.test.ts
 *
 * Identity scan is a deliberate superset so count-only escapes
 * (`[width:327px]`, styles/lib outside app/components, packages/ui) fail.
 */
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const THIS_DIR = dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = join(THIS_DIR, '..');
export const CHECK_COMMAND = 'pnpm design:source-count-ratchet';
export const IDENTITY_SCHEMA = 'jovie.design-system-source-identity/v1';
export const ARBITRARY_BASELINE_RELATIVE =
  'apps/web/tests/unit/design-system/arbitrary-values.baseline.json';
export const LINEAR_BASELINE_RELATIVE =
  'apps/web/tests/unit/design-system/linear-namespace.baseline.json';
export const IDENTITY_BASELINE_RELATIVE =
  'apps/web/tests/unit/design-system/source-identity.baseline.json';
export const IDENTITY_ALLOWLIST_RELATIVE =
  'apps/web/tests/unit/design-system/source-identity.allowlist.json';

// Locked to arbitrary-values-ratchet.test.ts
export const ARBITRARY_VALUE_PATTERN =
  /\b[a-z][a-z0-9]*(?:-[a-z0-9]+)*-\[[^\]]+\]/gi;
export const ARBITRARY_SCAN_DIRS = Object.freeze(['components', 'app']);
const ARBITRARY_SOURCE_EXT = /\.(tsx|ts)$/;

// Tailwind arbitrary properties the class-prefix scan misses: [width:327px]
export const ARBITRARY_PROPERTY_PATTERN = /\[[a-z][a-z0-9-]*:[^\]]+\]/gi;

// Locked to linear-namespace-ratchet.test.ts
export const LINEAR_NAMESPACE_PATTERN = /--linear-[a-z0-9-]+/g;
export const LINEAR_SCAN_DIRS = Object.freeze(['app', 'components', 'styles']);
const LINEAR_SOURCE_EXT = /\.(tsx|ts|css)$/;
const LINEAR_SKIP_DIRS = new Set([
  'node_modules',
  '.next',
  '.turbo',
  'generated',
  'dist',
]);
const LINEAR_TEST_FILE = /\.(?:test|spec)\.[tj]sx?$/;

export const IDENTITY_RULES = Object.freeze({
  arbitraryValue: 'arbitrary-value',
  arbitraryProperty: 'arbitrary-property',
  linearNamespace: 'linear-namespace',
});

/** Widened identity roots. Count helpers above stay narrower on purpose. */
export const IDENTITY_SCAN_ROOTS = Object.freeze([
  Object.freeze({
    repoRelative: 'apps/web/app',
    extensions: /\.(tsx|ts|css)$/,
  }),
  Object.freeze({
    repoRelative: 'apps/web/components',
    extensions: /\.(tsx|ts|css)$/,
  }),
  Object.freeze({
    repoRelative: 'apps/web/styles',
    extensions: /\.(tsx|ts|css)$/,
  }),
  Object.freeze({
    repoRelative: 'apps/web/lib',
    extensions: /\.(tsx|ts|css)$/,
  }),
  Object.freeze({
    repoRelative: 'packages/ui',
    extensions: /\.(tsx|ts|css)$/,
  }),
]);

const IDENTITY_SKIP_DIRS = new Set([
  'node_modules',
  '.next',
  '.turbo',
  'generated',
  'dist',
  'coverage',
  '.context',
]);

function walkArbitraryFiles(dir, out) {
  if (!existsSync(dir)) return;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === '.next') continue;
      walkArbitraryFiles(full, out);
    } else if (ARBITRARY_SOURCE_EXT.test(entry.name)) {
      out.push(full);
    }
  }
}

function walkLinearFiles(dir, out) {
  if (!existsSync(dir)) return;
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const stats = statSync(full);
    if (stats.isDirectory()) {
      if (LINEAR_SKIP_DIRS.has(entry)) continue;
      walkLinearFiles(full, out);
    } else if (LINEAR_SOURCE_EXT.test(entry) && !LINEAR_TEST_FILE.test(entry)) {
      out.push(full);
    }
  }
}

function walkIdentityFiles(dir, extensions, out) {
  if (!existsSync(dir)) return;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (IDENTITY_SKIP_DIRS.has(entry.name)) continue;
      walkIdentityFiles(full, extensions, out);
      continue;
    }
    if (LINEAR_TEST_FILE.test(entry.name)) continue;
    if (entry.name.endsWith('.d.ts')) continue;
    if (extensions.test(entry.name)) out.push(full);
  }
}

export function countArbitraryValues(webRoot) {
  const files = [];
  for (const dir of ARBITRARY_SCAN_DIRS) {
    walkArbitraryFiles(join(webRoot, dir), files);
  }
  files.sort((left, right) => left.localeCompare(right));
  let total = 0;
  for (const file of files) {
    const matches = readFileSync(file, 'utf8').match(ARBITRARY_VALUE_PATTERN);
    if (matches) total += matches.length;
  }
  return total;
}

export function countLinearNamespaceUsage(webRoot) {
  const files = [];
  for (const dir of LINEAR_SCAN_DIRS) {
    walkLinearFiles(join(webRoot, dir), files);
  }
  const tailwindConfig = join(webRoot, 'tailwind.config.js');
  if (existsSync(tailwindConfig)) files.push(tailwindConfig);

  let count = 0;
  const perFile = new Map();
  for (const file of files) {
    const matches = readFileSync(file, 'utf8').match(LINEAR_NAMESPACE_PATTERN);
    if (matches && matches.length > 0) {
      count += matches.length;
      perFile.set(relative(webRoot, file), matches.length);
    }
  }
  return { count, perFile };
}

export function identityKey(file, rule, value) {
  return `${file}\t${rule}\t${value}`;
}

function parseIdentityKey(key) {
  const [file, rule, value] = String(key).split('\t');
  return { file, rule, value };
}

function collectMatches(source, pattern) {
  const values = [];
  const matcher = new RegExp(pattern.source, pattern.flags);
  let match = matcher.exec(source);
  while (match) {
    values.push(match[0]);
    match = matcher.exec(source);
  }
  return values;
}

function listIdentitySourceFiles(repoRoot) {
  const files = [];
  for (const root of IDENTITY_SCAN_ROOTS) {
    walkIdentityFiles(
      join(repoRoot, root.repoRelative),
      root.extensions,
      files
    );
  }
  const tailwindConfig = join(repoRoot, 'apps/web/tailwind.config.js');
  if (existsSync(tailwindConfig)) files.push(tailwindConfig);
  files.sort((left, right) => left.localeCompare(right));
  return files;
}

export function collectDesignSystemIdentities(options = {}) {
  const repoRoot = options.repoRoot ?? REPO_ROOT;
  const identities = [];
  for (const file of listIdentitySourceFiles(repoRoot)) {
    const rel = relative(repoRoot, file).replace(/\\/g, '/');
    const source = readFileSync(file, 'utf8');
    for (const value of collectMatches(source, ARBITRARY_VALUE_PATTERN)) {
      identities.push(identityKey(rel, IDENTITY_RULES.arbitraryValue, value));
    }
    for (const value of collectMatches(source, ARBITRARY_PROPERTY_PATTERN)) {
      identities.push(
        identityKey(rel, IDENTITY_RULES.arbitraryProperty, value)
      );
    }
    for (const value of collectMatches(source, LINEAR_NAMESPACE_PATTERN)) {
      identities.push(identityKey(rel, IDENTITY_RULES.linearNamespace, value));
    }
  }
  return uniqueSorted(identities);
}

function uniqueSorted(values) {
  return [...new Set(values)].toSorted((left, right) =>
    left.localeCompare(right)
  );
}

function readIdentityList(filePath, label) {
  if (!existsSync(filePath)) {
    throw new Error(`missing ${label} ${filePath}`);
  }
  const parsed = JSON.parse(readFileSync(filePath, 'utf8'));
  const list = Array.isArray(parsed?.identities) ? parsed.identities : null;
  if (!list) {
    throw new Error(`${label} ${filePath} must declare an identities array`);
  }
  return uniqueSorted(list.map(item => String(item)));
}

function readAllowlist(filePath) {
  if (!existsSync(filePath)) return [];
  const parsed = JSON.parse(readFileSync(filePath, 'utf8'));
  const raw = Array.isArray(parsed?.identities)
    ? parsed.identities
    : Array.isArray(parsed?.allowlist)
      ? parsed.allowlist
      : [];
  return uniqueSorted(
    raw.map(item => {
      if (typeof item === 'string') return item;
      return identityKey(item.file, item.rule, item.value);
    })
  );
}

export function writeIdentityBaseline(options = {}) {
  const repoRoot = options.repoRoot ?? REPO_ROOT;
  const identities = uniqueSorted(
    options.identities ?? collectDesignSystemIdentities({ repoRoot })
  );
  const outPath = join(
    repoRoot,
    options.relativePath ?? IDENTITY_BASELINE_RELATIVE
  );
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(
    outPath,
    `${JSON.stringify(
      {
        schema: IDENTITY_SCHEMA,
        generatedBy:
          'scripts/design-system-source-ratchet.mjs --write-baseline',
        count: identities.length,
        identities,
      },
      null,
      2
    )}\n`
  );
  return { path: outPath, count: identities.length };
}

/**
 * Identity-growth verdict. New file+rule+value triples fail unless they are
 * already in the baseline or the documented allowlist.
 *
 * @param {{ repoRoot?: string, identities?: string[] }} [options]
 */
export function evaluateDesignSystemSourceRatchet(options = {}) {
  const repoRoot = options.repoRoot ?? REPO_ROOT;
  const identities = uniqueSorted(
    options.identities ?? collectDesignSystemIdentities({ repoRoot })
  );
  const baseline = readIdentityList(
    join(repoRoot, IDENTITY_BASELINE_RELATIVE),
    'identity baseline'
  );
  const allowlist = readAllowlist(join(repoRoot, IDENTITY_ALLOWLIST_RELATIVE));
  const permitted = new Set([...baseline, ...allowlist]);
  const newIdentities = identities.filter(key => !permitted.has(key));

  const issues = newIdentities.map(key => {
    const { file, rule, value } = parseIdentityKey(key);
    return (
      `new ${rule} identity in ${file}: ${value}. ` +
      'Use the canonical token, or document a justified allowlist escape.'
    );
  });

  const countByRule = new Map();
  for (const key of identities) {
    const { rule } = parseIdentityKey(key);
    countByRule.set(rule, (countByRule.get(rule) ?? 0) + 1);
  }

  return {
    ok: issues.length === 0,
    identities,
    newIdentities,
    issues,
    metrics: [
      {
        id: 'source-identities',
        metric: 'design-system source identities',
        count: identities.length,
        baseline: baseline.length,
        newCount: newIdentities.length,
      },
      {
        id: IDENTITY_RULES.arbitraryValue,
        metric: IDENTITY_RULES.arbitraryValue,
        count: countByRule.get(IDENTITY_RULES.arbitraryValue) ?? 0,
        baseline: baseline.filter(key =>
          key.includes(`\t${IDENTITY_RULES.arbitraryValue}\t`)
        ).length,
        newCount: newIdentities.filter(key =>
          key.includes(`\t${IDENTITY_RULES.arbitraryValue}\t`)
        ).length,
      },
      {
        id: IDENTITY_RULES.arbitraryProperty,
        metric: IDENTITY_RULES.arbitraryProperty,
        count: countByRule.get(IDENTITY_RULES.arbitraryProperty) ?? 0,
        baseline: baseline.filter(key =>
          key.includes(`\t${IDENTITY_RULES.arbitraryProperty}\t`)
        ).length,
        newCount: newIdentities.filter(key =>
          key.includes(`\t${IDENTITY_RULES.arbitraryProperty}\t`)
        ).length,
      },
      {
        id: IDENTITY_RULES.linearNamespace,
        metric: IDENTITY_RULES.linearNamespace,
        count: countByRule.get(IDENTITY_RULES.linearNamespace) ?? 0,
        baseline: baseline.filter(key =>
          key.includes(`\t${IDENTITY_RULES.linearNamespace}\t`)
        ).length,
        newCount: newIdentities.filter(key =>
          key.includes(`\t${IDENTITY_RULES.linearNamespace}\t`)
        ).length,
      },
    ],
  };
}

function main() {
  const writeBaseline = process.argv.includes('--write-baseline');
  if (writeBaseline) {
    const written = writeIdentityBaseline();
    console.log(
      `[design-system-source-ratchet] wrote ${written.count} identities to ${written.path}`
    );
    return;
  }

  const result = evaluateDesignSystemSourceRatchet();
  const summary = `${result.metrics[0].count} identities (${result.metrics[0].newCount} new / baseline ${result.metrics[0].baseline})`;
  if (!result.ok) {
    console.error(`[design-system-source-ratchet] FAIL — ${summary}`);
    for (const issue of result.issues) console.error(issue);
    process.exitCode = 1;
    return;
  }
  console.log(`[design-system-source-ratchet] PASS — ${summary}`);
}

if (
  process.argv[1] &&
  fileURLToPath(import.meta.url) === resolve(process.argv[1])
) {
  main();
}
