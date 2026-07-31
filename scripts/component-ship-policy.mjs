#!/usr/bin/env node
/**
 * Shared policy for the hard component ship gate (JOV-4421).
 *
 * Surfaces that require test + story + match coverage when changed.
 * Pure utilities, barrels, and generated code are excluded.
 */

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { basename, dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = resolve(__dirname, '..');

/** Discrete coverage roots (no double-count of nested paths). */
export const COVERAGE_ROOTS = Object.freeze([
  'packages/ui/atoms',
  'packages/ui', // non-atom top-level components only
  'apps/web/components/atoms',
  'apps/web/components/molecules',
  'apps/web/components/organisms',
  'apps/web/components/marketing',
  'apps/web/components/site',
]);

/** Path prefixes that trigger the diff ship gate when a component source changes. */
export const SHIP_SCOPE_PREFIXES = Object.freeze([
  'packages/ui/atoms/',
  'packages/ui/',
  'apps/web/components/atoms/',
  'apps/web/components/molecules/',
  'apps/web/components/organisms/',
  'apps/web/components/marketing/',
  'apps/web/components/site/',
]);

const STORY_RE = /\.stories\.(tsx|ts|jsx|js|mdx)$/i;
const TEST_RE = /\.(test|spec)\.(tsx|ts)$/i;
const SOURCE_TSX_RE = /\.tsx$/i;

/** Basename stems that are never ship surfaces. */
export const EXCLUDE_BASENAMES = new Set([
  'index',
  'common-dropdown-item-renderers',
  'common-dropdown-renderer',
  'common-dropdown-types',
  'common-dropdown-utils',
]);

const EXCLUDE_DIR_NAMES = new Set([
  'node_modules',
  'dist',
  '.next',
  '__tests__',
  'fixtures',
  'generated',
  '.turbo',
]);

const EXCLUDE_BASENAME_SUFFIXES = [
  '.utils',
  '.types',
  '-types',
  '.styles',
  '-styles',
  '.constants',
  '-constants',
  '.config',
  '.server',
  '.client',
];

const EXCLUDE_BASENAME_PATTERNS = [
  /^use[A-Z]/, // hooks colocated as .tsx are rare; still exclude use*
  /Lazy$/,
  /Loader$/,
  /Fallback$/,
];

export function normalizeRepoPath(filePath) {
  return filePath.replaceAll('\\', '/').replace(/^\.\//, '');
}

export function isStoryFile(name) {
  return STORY_RE.test(name);
}

export function isTestFile(name) {
  return TEST_RE.test(name);
}

export function isExcludedBasename(base) {
  const lower = base.toLowerCase();
  if (EXCLUDE_BASENAMES.has(lower)) return true;
  if (EXCLUDE_BASENAME_SUFFIXES.some(s => lower.endsWith(s))) return true;
  if (EXCLUDE_BASENAME_PATTERNS.some(re => re.test(base))) return true;
  return false;
}

/**
 * packages/ui root should only count top-level components (not atoms/, hooks/, …).
 * Nested roots walk recursively under their prefix.
 */
export function shouldWalkRootRecursively(rootRel) {
  return rootRel !== 'packages/ui';
}

export function isUnderShipScope(relPath) {
  const p = normalizeRepoPath(relPath);
  if (!p.endsWith('.tsx')) return false;
  if (isStoryFile(p) || isTestFile(p)) return false;
  // packages/ui non-atom: only top-level .tsx under packages/ui/
  if (p.startsWith('packages/ui/atoms/')) return true;
  if (p.startsWith('packages/ui/')) {
    const rest = p.slice('packages/ui/'.length);
    if (rest.includes('/')) return false; // nested non-atom dirs (hooks, lib, theme)
    return true;
  }
  return SHIP_SCOPE_PREFIXES.some(
    prefix =>
      prefix !== 'packages/ui/' &&
      prefix !== 'packages/ui/atoms/' &&
      p.startsWith(prefix)
  );
}

export function coverageRootForPath(relPath) {
  const p = normalizeRepoPath(relPath);
  if (p.startsWith('packages/ui/atoms/')) return 'packages/ui/atoms';
  if (p.startsWith('packages/ui/') && !p.slice('packages/ui/'.length).includes('/')) {
    return 'packages/ui';
  }
  for (const root of COVERAGE_ROOTS) {
    if (root === 'packages/ui' || root === 'packages/ui/atoms') continue;
    if (p === root || p.startsWith(`${root}/`)) return root;
  }
  return null;
}

function walkFiles(absDir, recursive, out = []) {
  if (!existsSync(absDir)) return out;
  let entries;
  try {
    entries = readdirSync(absDir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    const full = join(absDir, entry.name);
    if (entry.isDirectory()) {
      if (!recursive) continue;
      if (EXCLUDE_DIR_NAMES.has(entry.name)) continue;
      walkFiles(full, true, out);
      continue;
    }
    if (entry.isFile()) out.push(full);
  }
  return out;
}

/**
 * @returns {{ component: string, sourceRel: string, sourceAbs: string, dirRel: string, storyRel: string | null, testRel: string | null, covered: boolean, tested: boolean }[]}
 */
export function listComponentsInRoot(rootRel, repoRoot = REPO_ROOT) {
  const absRoot = join(repoRoot, rootRel);
  if (!existsSync(absRoot)) return [];

  const recursive = shouldWalkRootRecursively(rootRel);
  const files = walkFiles(absRoot, recursive);
  const byDir = new Map(); // dirAbs -> { stories: Map, tests: Map, sources: [] }

  for (const abs of files) {
    const name = basename(abs);
    const dir = dirname(abs);
    if (!byDir.has(dir)) {
      byDir.set(dir, { stories: new Map(), tests: new Map(), sources: [] });
    }
    const bucket = byDir.get(dir);
    const storyMatch = name.match(/^(.+)\.stories\.(tsx|ts|jsx|js|mdx)$/i);
    if (storyMatch) {
      bucket.stories.set(storyMatch[1].toLowerCase(), abs);
      continue;
    }
    const testMatch = name.match(/^(.+)\.(test|spec)\.(tsx|ts)$/i);
    if (testMatch) {
      bucket.tests.set(testMatch[1].toLowerCase(), abs);
      continue;
    }
    if (!SOURCE_TSX_RE.test(name)) continue;
    const base = name.replace(/\.tsx$/i, '');
    if (isExcludedBasename(base)) continue;
    // packages/ui non-recursive root: only direct children already handled
    bucket.sources.push({ base, abs, name });
  }

  const components = [];
  for (const [dirAbs, bucket] of byDir) {
    for (const src of bucket.sources) {
      const storyAbs = bucket.stories.get(src.base.toLowerCase()) ?? null;
      const testAbs = bucket.tests.get(src.base.toLowerCase()) ?? null;
      const sourceRel = normalizeRepoPath(relative(repoRoot, src.abs));
      // For packages/ui root, skip anything that slipped under atoms via misconfig
      if (rootRel === 'packages/ui' && sourceRel.startsWith('packages/ui/atoms/')) {
        continue;
      }
      if (rootRel !== 'packages/ui' && rootRel !== coverageRootForPath(sourceRel)) {
        // When walking organisms/, keep nested paths under that root only
        if (!sourceRel.startsWith(`${rootRel}/`) && sourceRel !== rootRel) {
          continue;
        }
      }
      components.push({
        component: src.base,
        sourceRel,
        sourceAbs: src.abs,
        dirRel: normalizeRepoPath(relative(repoRoot, dirAbs)),
        storyRel: storyAbs
          ? normalizeRepoPath(relative(repoRoot, storyAbs))
          : null,
        testRel: testAbs
          ? normalizeRepoPath(relative(repoRoot, testAbs))
          : null,
        covered: Boolean(storyAbs),
        tested: Boolean(testAbs),
      });
    }
  }

  components.sort((a, b) => a.sourceRel.localeCompare(b.sourceRel));
  return components;
}

export function measureRootCoverage(rootRel, repoRoot = REPO_ROOT) {
  const components = listComponentsInRoot(rootRel, repoRoot);
  const total = components.length;
  const covered = components.filter(c => c.covered).length;
  const tested = components.filter(c => c.tested).length;
  const percent = total === 0 ? 100 : Math.round((covered / total) * 10000) / 100;
  return {
    root: rootRel,
    total,
    covered,
    tested,
    uncovered: total - covered,
    percent,
    uncoveredComponents: components.filter(c => !c.covered).map(c => c.sourceRel),
    untestedComponents: components.filter(c => !c.tested).map(c => c.sourceRel),
    components,
  };
}

export function measureAllRoots(repoRoot = REPO_ROOT) {
  const roots = {};
  for (const root of COVERAGE_ROOTS) {
    roots[root] = measureRootCoverage(root, repoRoot);
  }
  return {
    schemaVersion: 2,
    measuredAt: new Date().toISOString(),
    roots,
  };
}

/**
 * Extract required (non-optional) prop names from a component source.
 * Heuristic static parse — not a full TS checker.
 */
export function extractRequiredPropNames(sourceText) {
  const props = new Set();
  // Match interface/type blocks that look like *Props
  const blockRe =
    /(?:interface|type)\s+\w*Props\w*\s*(?:=\s*)?\{([\s\S]*?)\}/g;
  let block;
  while ((block = blockRe.exec(sourceText)) !== null) {
    const body = block[1];
    for (const line of body.split('\n')) {
      const m = line.match(/^\s*(?:readonly\s+)?([A-Za-z_][\w]*)(\??)\s*:/);
      if (!m) continue;
      const [, name, optional] = m;
      if (optional === '?') continue;
      if (name === 'children' || name === 'className' || name === 'key') continue;
      props.add(name);
    }
  }
  return [...props];
}

/**
 * Extract primary component export name(s) from source.
 */
export function extractExportedComponentNames(sourceText) {
  const names = [];
  const re =
    /export\s+(?:default\s+)?(?:function|const)\s+([A-Z][A-Za-z0-9_]*)/g;
  let m;
  while ((m = re.exec(sourceText)) !== null) {
    names.push(m[1]);
  }
  // export { Foo as Bar }
  const named = sourceText.matchAll(
    /export\s*\{([^}]+)\}/g
  );
  for (const block of named) {
    for (const part of block[1].split(',')) {
      const bit = part.trim();
      if (!bit) continue;
      const asMatch = bit.match(/(\w+)\s+as\s+(\w+)/);
      const name = asMatch ? asMatch[2] : bit.split(/\s+/)[0];
      if (name && /^[A-Z]/.test(name)) names.push(name);
    }
  }
  return [...new Set(names)];
}

/**
 * Parse story allowlist: parameters.jovie.uncoveredProps
 */
export function extractUncoveredPropsAllowlist(storyText) {
  const out = new Set();
  // parameters: { jovie: { uncoveredProps: ['a', "b"] } }
  const re =
    /uncoveredProps\s*:\s*\[([^\]]*)\]/g;
  let m;
  while ((m = re.exec(storyText)) !== null) {
    for (const raw of m[1].split(',')) {
      const cleaned = raw.trim().replace(/^['"]|['"]$/g, '');
      if (cleaned) out.add(cleaned);
    }
  }
  return out;
}

/**
 * Match checks: story imports component, covers required props (minus allowlist).
 * @returns {{ ok: boolean, findings: { rule: string, detail: string }[] }}
 */
export function checkStoryMatchesComponent({
  componentSource,
  storySource,
  componentRel,
  storyRel,
}) {
  const findings = [];
  const componentBase = basename(componentRel).replace(/\.tsx$/i, '');
  const exportNames = extractExportedComponentNames(componentSource);
  const primaryNames =
    exportNames.length > 0
      ? exportNames
      : [componentBase.replace(/(^|-)(\w)/g, (_, _a, c) => c.toUpperCase())];

  // Import must reference the component module (not a hand-rolled fork).
  const importOk =
    new RegExp(
      `from\\s+['"][^'"]*${escapeRegExp(componentBase)}['"]`
    ).test(storySource) ||
    primaryNames.some(name =>
      new RegExp(
        `import\\s*\\{[^}]*\\b${escapeRegExp(name)}\\b[^}]*\\}\\s*from`
      ).test(storySource)
    ) ||
    primaryNames.some(name =>
      new RegExp(
        `import\\s+${escapeRegExp(name)}\\s+from`
      ).test(storySource)
    );

  if (!importOk) {
    findings.push({
      rule: 'story-must-import-component',
      detail: `${storyRel} must import the component module for ${componentRel}`,
    });
  }

  // Story must reference the component (meta.component or JSX).
  const usedInStory = primaryNames.some(
    name =>
      storySource.includes(`component: ${name}`) ||
      storySource.includes(`component:${name}`) ||
      new RegExp(`<${escapeRegExp(name)}[\\s/>]`).test(storySource) ||
      storySource.includes(`typeof ${name}`)
  );
  if (!usedInStory) {
    findings.push({
      rule: 'story-must-render-component',
      detail: `${storyRel} must set meta.component or render <${primaryNames[0] ?? componentBase} />`,
    });
  }

  const requiredProps = extractRequiredPropNames(componentSource);
  const allowlist = extractUncoveredPropsAllowlist(storySource);
  const missingProps = requiredProps.filter(prop => {
    if (allowlist.has(prop)) return false;
    // Prop appears as args key, JSX attr, or string in story source
    return !new RegExp(`\\b${escapeRegExp(prop)}\\b`).test(storySource);
  });
  if (missingProps.length > 0) {
    findings.push({
      rule: 'story-must-cover-required-props',
      detail: `${storyRel} missing required props in stories: ${missingProps.join(', ')}. Add them to args/JSX or list under parameters.jovie.uncoveredProps.`,
    });
  }

  // Lightweight state matrix: if component exposes these props, require a mention.
  const matrixHints = [
    { prop: 'disabled', label: 'disabled' },
    { prop: 'loading', label: 'loading' },
    { prop: 'isLoading', label: 'loading' },
  ];
  for (const hint of matrixHints) {
    const hasProp =
      new RegExp(`\\b${hint.prop}\\??\\s*:`).test(componentSource) ||
      new RegExp(`\\b${hint.prop}\\b`).test(
        componentSource.match(/interface[\s\S]*?Props[\s\S]*?\{[\s\S]*?\}/)?.[0] ??
          ''
      );
    if (!hasProp) continue;
    if (allowlist.has(hint.prop)) continue;
    if (!new RegExp(`\\b${escapeRegExp(hint.prop)}\\b`).test(storySource)) {
      findings.push({
        rule: 'story-state-matrix',
        detail: `${storyRel} should exercise the ${hint.label} state (prop \`${hint.prop}\`) or allowlist it via parameters.jovie.uncoveredProps.`,
      });
    }
  }

  return { ok: findings.length === 0, findings };
}

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Resolve @coverage-via directive from component source.
 * Format: // @coverage-via path/relative/to/repo/or/colocated
 */
export function parseCoverageVia(componentSource) {
  const m = componentSource.match(
    /@coverage-via\s+([^\s*]+)/
  );
  return m ? m[1].trim() : null;
}

export function resolveCoverageViaPath(via, componentRel, repoRoot = REPO_ROOT) {
  if (!via) return null;
  if (via.startsWith('.')) {
    return normalizeRepoPath(join(dirname(componentRel), via));
  }
  return normalizeRepoPath(via);
}

/**
 * Verify a coverage-via target exists and imports the component.
 */
export function verifyCoverageVia({
  viaRel,
  componentRel,
  componentBase,
  repoRoot = REPO_ROOT,
}) {
  const abs = join(repoRoot, viaRel);
  if (!existsSync(abs) || !statSync(abs).isFile()) {
    return {
      ok: false,
      detail: `@coverage-via target missing: ${viaRel}`,
    };
  }
  const text = readFileSync(abs, 'utf8');
  const importsComponent =
    text.includes(componentBase) ||
    text.includes(basename(componentRel).replace(/\.tsx$/i, ''));
  if (!importsComponent) {
    return {
      ok: false,
      detail: `@coverage-via ${viaRel} does not reference ${componentRel}`,
    };
  }
  return { ok: true, detail: null };
}

export function readText(rel, repoRoot = REPO_ROOT) {
  return readFileSync(join(repoRoot, rel), 'utf8');
}
