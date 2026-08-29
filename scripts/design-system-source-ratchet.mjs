#!/usr/bin/env node
/**
 * Cheap source-PR growth gate for apps/web design-system count ratchets
 * (JOV-5301) plus trusted-base design-debt registries (JOV-5447). Filesystem
 * and local Git object reads only — no Vitest, no e2e, no network.
 *
 * Growth of arbitrary Tailwind values, `--linear-*` usage, or an inventoried
 * debt ceiling is always a regression and must fail source `PR Ready` so the
 * PR cannot enroll and UNMERGEABLE an ALLGREEN group. Registry ceilings are
 * compared to the exact CI base, so editing the candidate baseline cannot
 * bless growth. Unbaselined live-source shrink remains authorship debt for the
 * unit tests (JOV-5300); this lane does not fail it.
 *
 * Counters and scan roots must stay locked to:
 *   apps/web/tests/unit/design-system/arbitrary-values-ratchet.test.ts
 *   apps/web/tests/unit/design-system/linear-namespace-ratchet.test.ts
 */
import { spawnSync } from 'node:child_process';
import {
  existsSync,
  readdirSync,
  readFileSync,
  realpathSync,
  statSync,
} from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateSerifException } from './design-authority-guard.mjs';
import {
  findingIndex,
  validateVisualArbitraryBaseline,
} from './shared-ui-visual-arbitrary-audit.mjs';
import { validateBaseline as validateStoryCoverageBaseline } from './story-coverage-ratchet.mjs';

const THIS_DIR = dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = join(THIS_DIR, '..');
export const CHECK_COMMAND = 'pnpm design:source-count-ratchet';
export const ARBITRARY_BASELINE_RELATIVE =
  'apps/web/tests/unit/design-system/arbitrary-values.baseline.json';
export const LINEAR_BASELINE_RELATIVE =
  'apps/web/tests/unit/design-system/linear-namespace.baseline.json';
export const DESIGN_DEBT_REGISTRY_SCHEMA =
  'jovie.design-debt-registry-inventory/v1';
export const DESIGN_DEBT_INVENTORY_RELATIVE =
  'scripts/design-debt-registry-inventory.json';

// Locked to arbitrary-values-ratchet.test.ts
export const ARBITRARY_VALUE_PATTERN =
  /\b[a-z][a-z0-9]*(?:-[a-z0-9]+)*-\[[^\]]+\]/gi;
export const ARBITRARY_SCAN_DIRS = Object.freeze(['components', 'app']);
const ARBITRARY_SOURCE_EXT = /\.(tsx|ts)$/;

// Locked to linear-namespace-ratchet.test.ts
export const LINEAR_NAMESPACE_PATTERN = /--linear-[a-z0-9-]+/g;
export const LINEAR_SCAN_DIRS = Object.freeze(['app', 'components', 'styles']);
const LINEAR_SOURCE_EXT = /\.(tsx|ts|css)$/;
const LINEAR_SKIP_DIRS = new Set([
  'node_modules',
  '.next',
  '.turbo',
  'generated',
]);
const LINEAR_TEST_FILE = /\.test\.[tj]sx?$/;

/**
 * Candidate metadata comes from the machine-readable manifest. Its immutable
 * identity is checked against the trusted-base copy before evaluation.
 */
export const DESIGN_DEBT_REGISTRIES = Object.freeze(
  parseRegistryJson(
    readFileSync(join(REPO_ROOT, DESIGN_DEBT_INVENTORY_RELATIVE), 'utf8'),
    DESIGN_DEBT_INVENTORY_RELATIVE
  ).registries
);

function isFiniteCount(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

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

/** Preserve the two locked source contracts through their owning counters. */
export function countDesignSystemSourceMetrics(webRoot) {
  return {
    arbitraryCount: countArbitraryValues(webRoot),
    linearNamespace: countLinearNamespaceUsage(webRoot),
  };
}

function readBaselineCount(baselinePath) {
  if (!existsSync(baselinePath)) {
    throw new Error(`missing baseline ${baselinePath}`);
  }
  const baseline = JSON.parse(readFileSync(baselinePath, 'utf8'));
  if (!isFiniteCount(baseline?.count)) {
    throw new Error(
      `baseline ${baselinePath} must declare a finite numeric "count"`
    );
  }
  return baseline.count;
}

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isCount(value) {
  return Number.isInteger(value) && value >= 0;
}

function atPointer(value, pointer) {
  let current = value;
  for (const segment of pointer) {
    if (!isObject(current) && !Array.isArray(current)) return undefined;
    current = current[segment];
  }
  return current;
}

function pointerLabel(pointer) {
  return pointer.length === 0 ? '<root>' : pointer.join('.');
}

function parseRegistryJson(text, label) {
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new Error(
      `${label} is not valid JSON: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

function parseTypescriptStringSet(text, binding, label) {
  if (typeof text !== 'string') {
    throw new Error(`${label} is missing source text`);
  }
  const escapedBinding = binding.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const declaration = new RegExp(
    `const\\s+${escapedBinding}\\s*=\\s*new\\s+Set\\s*\\(\\s*\\[([\\s\\S]*?)\\]\\s*\\)`,
    'g'
  );
  const matches = [...text.matchAll(declaration)];
  if (matches.length !== 1) {
    throw new Error(
      `${label} must contain exactly one ${binding} new Set([...]) declaration`
    );
  }
  const body = matches[0][1];
  const values = [];
  const literal = /(['"])([^'"\\]*(?:\\.[^'"\\]*)*)\1\s*,?/g;
  let consumed = '';
  for (const match of body.matchAll(literal)) {
    values.push(JSON.parse(`"${match[2].replace(/"/g, '\\"')}"`));
    consumed += match[0];
  }
  const normalizedBody = body.replace(literal, '').replace(/\s|,/g, '');
  if (
    normalizedBody.length > 0 ||
    (values.length > 0 && consumed.length === 0)
  ) {
    throw new Error(
      `${label} ${binding} must contain only quoted string literals`
    );
  }
  return { values: values.sort() };
}

function parseRegistryContent(entry, text, label) {
  if (entry.format?.kind === 'typescript-string-set') {
    return parseTypescriptStringSet(text, entry.format.binding, label);
  }
  return parseRegistryJson(text, label);
}

function inventoryIdentity(entry) {
  return JSON.stringify({
    id: entry.id,
    path: entry.path,
    format: entry.format ?? null,
    projection: entry.projection,
  });
}

function compareInventoryToTrustedBase(baseEntries, candidateEntries) {
  const issues = [];
  const baseById = new Map(baseEntries.map(entry => [entry.id, entry]));
  const candidateById = new Map(
    candidateEntries.map(entry => [entry.id, entry])
  );
  for (const [id, baseEntry] of baseById) {
    const candidateEntry = candidateById.get(id);
    if (!candidateEntry) {
      issues.push(
        `registry inventory removed ${id}; denominator shrink is forbidden`
      );
      continue;
    }
    if (inventoryIdentity(candidateEntry) !== inventoryIdentity(baseEntry)) {
      issues.push(
        `registry inventory retargeted ${id}; path, format, and projection identity are immutable in the enforcing PR`
      );
    }
  }
  for (const id of candidateById.keys()) {
    if (!baseById.has(id)) {
      issues.push(
        `registry inventory added ${id}; enroll it in a separate bootstrap PR before enforcement`
      );
    }
  }
  return issues;
}

function parseInventoryManifest(text, label) {
  const manifest = parseRegistryJson(text, label);
  if (!isObject(manifest) || manifest.schema !== DESIGN_DEBT_REGISTRY_SCHEMA) {
    throw new Error(
      `${label} must declare schema ${DESIGN_DEBT_REGISTRY_SCHEMA}`
    );
  }
  if (!Array.isArray(manifest.registries) || manifest.registries.length === 0) {
    throw new Error(`${label} must declare a non-empty registries array`);
  }
  return manifest.registries;
}

function isRepoRelativePath(value) {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    !value.startsWith('/') &&
    !value.split('/').includes('..')
  );
}

function validateProjection(projection, label) {
  const issues = [];
  if (!isObject(projection)) return [`${label}: projection must be an object`];
  if (!Array.isArray(projection.pointer)) {
    issues.push(`${label}: projection.pointer must be an array`);
  } else if (
    projection.pointer.some(
      segment => typeof segment !== 'string' || segment.length === 0
    )
  ) {
    issues.push(
      `${label}: projection.pointer segments must be non-empty strings`
    );
  }
  const kinds = new Set([
    'count',
    'number-map',
    'string-set',
    'object-set',
    'finding-count-set',
    'coverage-floor-map',
  ]);
  if (!kinds.has(projection.kind)) {
    issues.push(`${label}: unknown projection kind ${projection.kind}`);
  }
  if (projection.kind === 'number-map') {
    if (
      !Array.isArray(projection.keys) ||
      projection.keys.length === 0 ||
      projection.keys.some(
        key => typeof key !== 'string' || key.length === 0
      ) ||
      new Set(projection.keys).size !== projection.keys.length
    ) {
      issues.push(
        `${label}: number-map projection.keys must be unique non-empty strings`
      );
    }
    if (
      projection.ignoredKeys !== undefined &&
      (!Array.isArray(projection.ignoredKeys) ||
        projection.ignoredKeys.some(
          key => typeof key !== 'string' || key.length === 0
        ))
    ) {
      issues.push(
        `${label}: number-map projection.ignoredKeys must be strings when present`
      );
    }
  }
  if (
    projection.kind === 'finding-count-set' &&
    (!Array.isArray(projection.totalPointer) ||
      projection.totalPointer.some(
        segment => typeof segment !== 'string' || segment.length === 0
      ))
  ) {
    issues.push(
      `${label}: finding-count-set projection.totalPointer must be an array of strings`
    );
  }
  if (projection.kind === 'object-set') {
    if (
      !Array.isArray(projection.keyFields) ||
      projection.keyFields.length === 0 ||
      projection.keyFields.some(
        key => typeof key !== 'string' || key.length === 0
      ) ||
      new Set(projection.keyFields).size !== projection.keyFields.length
    ) {
      issues.push(
        `${label}: object-set projection.keyFields must be unique non-empty strings`
      );
    }
    if (projection.validator !== 'serif-exception') {
      issues.push(`${label}: object-set projection.validator is unsupported`);
    }
  }
  if (projection.kind === 'coverage-floor-map') {
    if (
      !Array.isArray(projection.keys) ||
      projection.keys.length === 0 ||
      projection.keys.some(
        key => typeof key !== 'string' || key.length === 0
      ) ||
      new Set(projection.keys).size !== projection.keys.length
    ) {
      issues.push(
        `${label}: coverage-floor-map projection.keys must be unique non-empty strings`
      );
    }
  }
  return issues;
}

/**
 * @param {readonly any[]} [entries]
 * @param {{ repoRoot?: string, now?: Date }} [options]
 */
export function validateDesignDebtRegistryInventory(
  entries = DESIGN_DEBT_REGISTRIES,
  options = {}
) {
  const repoRoot = options.repoRoot ?? REPO_ROOT;
  const now = options.now ?? new Date();
  const issues = [];
  if (!Array.isArray(entries) || entries.length === 0) {
    return ['design debt registry inventory is missing; fail closed'];
  }
  const ids = new Set();
  for (const entry of entries) {
    const label = `registry ${entry?.id ?? '<missing>'}`;
    if (!isObject(entry)) {
      issues.push(`${label}: entry must be an object`);
      continue;
    }
    if (typeof entry.id !== 'string' || entry.id.length === 0) {
      issues.push(`${label}: id must be a non-empty string`);
    } else if (ids.has(entry.id)) {
      issues.push(`${label}: id must be unique`);
    } else {
      ids.add(entry.id);
    }
    if (!isRepoRelativePath(entry.path)) {
      issues.push(`${label}: path must be repository-relative`);
    }
    if (
      entry.format !== undefined &&
      (!isObject(entry.format) ||
        entry.format.kind !== 'typescript-string-set' ||
        typeof entry.format.binding !== 'string' ||
        !/^[A-Z][A-Z0-9_]*$/.test(entry.format.binding))
    ) {
      issues.push(
        `${label}: format must be a supported TypeScript string-set binding`
      );
    }
    issues.push(...validateProjection(entry.projection, label));
    if (typeof entry.owner !== 'string' || entry.owner.length === 0) {
      issues.push(`${label}: owner is required`);
    }
    if (typeof entry.reason !== 'string' || entry.reason.length < 12) {
      issues.push(`${label}: reason is required`);
    }
    if (!/^JOV-\d+$/.test(entry.linearIssue ?? '')) {
      issues.push(`${label}: linearIssue must be a JOV issue identifier`);
    }
    const hasRemovalCondition =
      typeof entry.removalCondition === 'string' &&
      entry.removalCondition.length >= 12;
    const hasExpiry = typeof entry.expiresAt === 'string';
    if (!hasRemovalCondition && !hasExpiry) {
      issues.push(`${label}: removalCondition or expiresAt is required`);
    }
    if (hasExpiry) {
      const expiresAt = new Date(entry.expiresAt).getTime();
      if (!Number.isFinite(expiresAt)) {
        issues.push(`${label}: expiresAt must be a valid timestamp`);
      } else if (expiresAt <= now.getTime()) {
        issues.push(`${label}: exception expired at ${entry.expiresAt}`);
      }
    }
    if (
      !Array.isArray(entry.evidence) ||
      entry.evidence.length === 0 ||
      entry.evidence.some(path => !isRepoRelativePath(path))
    ) {
      issues.push(`${label}: evidence must contain repository-relative paths`);
    } else {
      for (const evidencePath of entry.evidence) {
        if (!existsSync(join(repoRoot, evidencePath))) {
          issues.push(`${label}: evidence is missing: ${evidencePath}`);
        }
      }
    }
  }
  return issues;
}

export function resolveTrustedBaseRef(env = process.env) {
  if (typeof env.TURBO_SCM_BASE === 'string' && env.TURBO_SCM_BASE.trim()) {
    return env.TURBO_SCM_BASE.trim();
  }
  if (typeof env.GITHUB_BASE_REF === 'string' && env.GITHUB_BASE_REF.trim()) {
    return `origin/${env.GITHUB_BASE_REF.trim()}`;
  }
  return 'origin/main';
}

function verifyTrustedBase(repoRoot, trustedBaseRef) {
  const result = spawnSync(
    'git',
    ['cat-file', '-e', `${trustedBaseRef}^{commit}`],
    { cwd: repoRoot, encoding: 'utf8' }
  );
  if (result.status !== 0) {
    throw new Error(
      `trusted base ${trustedBaseRef} is unavailable; fetch the exact base before running ${CHECK_COMMAND}`
    );
  }
}

export function resolveTrustedBaseCommit(
  repoRoot,
  requestedBaseRef,
  allowLocalMergeBase
) {
  verifyTrustedBase(repoRoot, requestedBaseRef);
  const ancestor = spawnSync(
    'git',
    ['merge-base', '--is-ancestor', requestedBaseRef, 'HEAD'],
    { cwd: repoRoot, encoding: 'utf8' }
  );
  if (ancestor.status === 0) return requestedBaseRef;
  if (!allowLocalMergeBase) {
    throw new Error(
      `trusted base ${requestedBaseRef} is not an ancestor of HEAD; refusing to widen the comparison range`
    );
  }
  const mergeBase = spawnSync('git', ['merge-base', 'HEAD', requestedBaseRef], {
    cwd: repoRoot,
    encoding: 'utf8',
  });
  const resolved = mergeBase.stdout?.trim();
  if (mergeBase.status !== 0 || !/^[0-9a-f]{40}$/.test(resolved ?? '')) {
    throw new Error(
      `trusted base ${requestedBaseRef} has no verifiable merge base with HEAD`
    );
  }
  return resolved;
}

function readTrustedBaseFiles(repoRoot, trustedBaseRef, registryPaths) {
  const uniquePaths = [...new Set(registryPaths)];
  const specs = uniquePaths.map(path => `${trustedBaseRef}:${path}`);
  const result = spawnSync('git', ['cat-file', '--batch'], {
    cwd: repoRoot,
    input: `${specs.join('\n')}\n`,
    maxBuffer: 20 * 1024 * 1024,
  });
  if (result.status !== 0) {
    throw new Error(
      `unable to read design debt registries from trusted base ${trustedBaseRef}`
    );
  }
  const output = result.stdout;
  const files = new Map();
  let offset = 0;
  for (let index = 0; index < uniquePaths.length; index += 1) {
    const lineEnd = output.indexOf(10, offset);
    if (lineEnd < 0) {
      throw new Error(
        `truncated git batch response for ${uniquePaths[index]} at ${trustedBaseRef}`
      );
    }
    const header = output.subarray(offset, lineEnd).toString('utf8');
    offset = lineEnd + 1;
    if (header.endsWith(' missing')) {
      throw new Error(
        `required registry ${uniquePaths[index]} is missing from trusted base ${trustedBaseRef}`
      );
    }
    const match = header.match(/^[0-9a-f]{40} blob (\d+)$/);
    if (!match) {
      throw new Error(
        `invalid git batch response for ${uniquePaths[index]} at ${trustedBaseRef}: ${header}`
      );
    }
    const size = Number(match[1]);
    const contentEnd = offset + size;
    if (contentEnd >= output.length || output[contentEnd] !== 10) {
      throw new Error(
        `truncated registry blob for ${uniquePaths[index]} at ${trustedBaseRef}`
      );
    }
    files.set(
      uniquePaths[index],
      output.subarray(offset, contentEnd).toString('utf8')
    );
    offset = contentEnd + 1;
  }
  return files;
}

function readCandidateRegistry(repoRoot, registryPath) {
  const candidatePath = join(repoRoot, registryPath);
  if (!existsSync(candidatePath)) {
    throw new Error(`required candidate registry is missing: ${registryPath}`);
  }
  return readFileSync(candidatePath, 'utf8');
}

function exactObjectKeys(value, projection, label) {
  if (!isObject(value)) {
    return { issues: [`${label} must be an object`], values: new Map() };
  }
  const expected = new Set(projection.keys);
  const ignored = new Set(projection.ignoredKeys ?? []);
  const issues = [];
  for (const key of Object.keys(value)) {
    if (!expected.has(key) && !ignored.has(key)) {
      issues.push(`${label} has unexpected numeric ceiling key ${key}`);
    }
  }
  const values = new Map();
  for (const key of projection.keys) {
    if (!isCount(value[key])) {
      issues.push(`${label}.${key} must be a non-negative integer`);
    } else {
      values.set(key, value[key]);
    }
  }
  return { issues, values };
}

function stringSet(value, label) {
  if (
    !Array.isArray(value) ||
    value.some(item => typeof item !== 'string' || item.length === 0)
  ) {
    return {
      issues: [`${label} must be an array of non-empty strings`],
      values: new Set(),
    };
  }
  const values = new Set(value);
  const issues = [];
  if (values.size !== value.length) issues.push(`${label} must be unique`);
  if (JSON.stringify(value) !== JSON.stringify([...value].sort())) {
    issues.push(`${label} must be sorted`);
  }
  return { issues, values };
}

function objectSet(value, projection, label) {
  if (!Array.isArray(value)) {
    return { issues: [`${label} must be an array`], values: new Set() };
  }
  const issues = [];
  const identities = [];
  for (const item of value) {
    try {
      if (projection.validator === 'serif-exception') {
        validateSerifException(item);
      }
      identities.push(
        projection.keyFields.map(field => item[field]).join('\u0000')
      );
    } catch (error) {
      issues.push(
        `${label}: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }
  const values = new Set(identities);
  if (values.size !== identities.length) {
    issues.push(`${label} must contain unique exception identities`);
  }
  if (JSON.stringify(identities) !== JSON.stringify([...identities].sort())) {
    issues.push(`${label} must be sorted by stable exception identity`);
  }
  return { issues, values };
}

function coverageFloorMap(registry, projection, label) {
  const validation = validateStoryCoverageBaseline(registry);
  const issues = validation.errors.map(issue => `${label}: ${issue}`);
  const roots = validation.baseline?.roots;
  if (!isObject(roots)) {
    return { issues, values: new Map() };
  }
  const expected = new Set(projection.keys);
  for (const key of Object.keys(roots)) {
    if (!expected.has(key)) {
      issues.push(`${label}: unexpected story coverage root ${key}`);
    }
  }
  const values = new Map();
  for (const key of projection.keys) {
    const root = roots[key];
    if (
      !isObject(root) ||
      typeof root.percent !== 'number' ||
      !isCount(root.uncovered)
    ) {
      issues.push(`${label}: missing or invalid story coverage root ${key}`);
      continue;
    }
    values.set(key, {
      percent: root.percent,
      uncovered: root.uncovered,
    });
  }
  return { issues, values };
}

function findingCountSet(registry, value, total, label) {
  if (!Array.isArray(value)) {
    return {
      issues: [`${label} must be an array`],
      values: new Map(),
      total: 0,
    };
  }
  const issues = validateVisualArbitraryBaseline(registry).map(
    issue => `${label}: ${issue}`
  );
  const values = findingIndex(value);
  const measuredTotal = [...values.values()].reduce(
    (sum, count) => sum + count,
    0
  );
  if (!isCount(total) || total !== measuredTotal) {
    issues.push(`${label}: totalFindings must equal ${measuredTotal}`);
  }
  return { issues, values, total: measuredTotal };
}

function compareRegistryProjection(entry, baseRegistry, candidateRegistry) {
  const projection = entry.projection;
  const baseValue = atPointer(baseRegistry, projection.pointer);
  const candidateValue = atPointer(candidateRegistry, projection.pointer);
  const label = `${entry.id} (${entry.path}#${pointerLabel(projection.pointer)})`;
  const issues = [];
  let baseTotal = 0;
  let candidateTotal = 0;
  let reductions = 0;

  if (projection.kind === 'count') {
    if (!isCount(baseValue))
      issues.push(`${label}: trusted-base count is invalid`);
    if (!isCount(candidateValue))
      issues.push(`${label}: candidate count is invalid`);
    if (issues.length === 0) {
      baseTotal = baseValue;
      candidateTotal = candidateValue;
      if (candidateValue > baseValue) {
        issues.push(
          `${label}: candidate ceiling grew ${baseValue} -> ${candidateValue}; same-PR raises are forbidden`
        );
      } else {
        reductions = baseValue - candidateValue;
      }
    }
  } else if (projection.kind === 'number-map') {
    const base = exactObjectKeys(
      baseValue,
      projection,
      `${label} trusted base`
    );
    const candidate = exactObjectKeys(
      candidateValue,
      projection,
      `${label} candidate`
    );
    issues.push(...base.issues, ...candidate.issues);
    for (const key of projection.keys) {
      const before = base.values.get(key);
      const after = candidate.values.get(key);
      if (before === undefined || after === undefined) continue;
      baseTotal += before;
      candidateTotal += after;
      if (after > before) {
        issues.push(
          `${label}.${key}: candidate ceiling grew ${before} -> ${after}; same-PR raises are forbidden`
        );
      } else {
        reductions += before - after;
      }
    }
  } else if (projection.kind === 'string-set') {
    const base = stringSet(baseValue, `${label} trusted base`);
    const candidate = stringSet(candidateValue, `${label} candidate`);
    issues.push(...base.issues, ...candidate.issues);
    baseTotal = base.values.size;
    candidateTotal = candidate.values.size;
    for (const value of candidate.values) {
      if (!base.values.has(value)) {
        issues.push(
          `${label}: candidate added exception ${JSON.stringify(value)}; same-PR path/value growth is forbidden`
        );
      }
    }
    reductions = [...base.values].filter(
      value => !candidate.values.has(value)
    ).length;
  } else if (projection.kind === 'object-set') {
    const base = objectSet(baseValue, projection, `${label} trusted base`);
    const candidate = objectSet(
      candidateValue,
      projection,
      `${label} candidate`
    );
    issues.push(...base.issues, ...candidate.issues);
    baseTotal = base.values.size;
    candidateTotal = candidate.values.size;
    for (const value of candidate.values) {
      if (!base.values.has(value)) {
        issues.push(
          `${label}: candidate added object exception ${JSON.stringify(value)}; same-PR path/value growth is forbidden`
        );
      }
    }
    reductions = [...base.values].filter(
      value => !candidate.values.has(value)
    ).length;
  } else if (projection.kind === 'finding-count-set') {
    const base = findingCountSet(
      baseRegistry,
      baseValue,
      atPointer(baseRegistry, projection.totalPointer),
      `${label} trusted base`
    );
    const candidate = findingCountSet(
      candidateRegistry,
      candidateValue,
      atPointer(candidateRegistry, projection.totalPointer),
      `${label} candidate`
    );
    issues.push(...base.issues, ...candidate.issues);
    baseTotal = base.total;
    candidateTotal = candidate.total;
    for (const [key, after] of candidate.values) {
      const before = base.values.get(key) ?? 0;
      if (after > before) {
        const [file, value] = key.split('\u0000');
        issues.push(
          `${label}: candidate finding grew ${file} ${value} ${before} -> ${after}; same-PR path/value growth is forbidden`
        );
      }
    }
    reductions = Math.max(0, baseTotal - candidateTotal);
  } else if (projection.kind === 'coverage-floor-map') {
    const base = coverageFloorMap(
      baseRegistry,
      projection,
      `${label} trusted base`
    );
    const candidate = coverageFloorMap(
      candidateRegistry,
      projection,
      `${label} candidate`
    );
    issues.push(...base.issues, ...candidate.issues);
    for (const key of projection.keys) {
      const before = base.values.get(key);
      const after = candidate.values.get(key);
      if (!before || !after) continue;
      baseTotal += before.uncovered;
      candidateTotal += after.uncovered;
      if (after.percent < before.percent) {
        issues.push(
          `${label}.${key}: candidate coverage floor fell ${before.percent} -> ${after.percent}; same-PR relaxation is forbidden`
        );
      }
      if (after.uncovered > before.uncovered) {
        issues.push(
          `${label}.${key}: candidate uncovered ceiling grew ${before.uncovered} -> ${after.uncovered}; same-PR raises are forbidden`
        );
      }
      reductions += Math.max(0, before.uncovered - after.uncovered);
    }
  }

  return {
    id: entry.id,
    path: entry.path,
    kind: projection.kind,
    status:
      issues.length > 0
        ? 'regression'
        : reductions > 0
          ? 'ceiling-lowered'
          : 'unchanged',
    baseTotal,
    candidateTotal,
    reductions,
    issues,
  };
}

export function evaluateDesignDebtRegistries(options = {}) {
  const repoRoot = options.repoRoot ?? REPO_ROOT;
  const env = options.env ?? process.env;
  const requestedBaseRef = options.trustedBaseRef ?? resolveTrustedBaseRef(env);
  const hasCiBase = Boolean(
    options.trustedBaseRef ||
      (typeof env.TURBO_SCM_BASE === 'string' && env.TURBO_SCM_BASE.trim()) ||
      (typeof env.GITHUB_BASE_REF === 'string' && env.GITHUB_BASE_REF.trim())
  );
  let trustedBaseRef = requestedBaseRef;
  const entries = options.entries ?? DESIGN_DEBT_REGISTRIES;
  const issues = validateDesignDebtRegistryInventory(entries, {
    repoRoot,
    now: options.now,
  });
  const registries = [];
  let baseEntries = [];

  try {
    const candidateManifestEntries = parseInventoryManifest(
      readCandidateRegistry(repoRoot, DESIGN_DEBT_INVENTORY_RELATIVE),
      `${DESIGN_DEBT_INVENTORY_RELATIVE} in candidate tree`
    );
    issues.push(
      ...compareInventoryToTrustedBase(candidateManifestEntries, entries).map(
        issue => `candidate inventory/code mismatch: ${issue}`
      )
    );
  } catch (error) {
    issues.push(error instanceof Error ? error.message : String(error));
  }

  let readBaseFile = options.readBaseFile;
  try {
    if (!options.readBaseFile) {
      trustedBaseRef = resolveTrustedBaseCommit(
        repoRoot,
        requestedBaseRef,
        !hasCiBase
      );
      const trustedManifestFile = readTrustedBaseFiles(
        repoRoot,
        trustedBaseRef,
        [DESIGN_DEBT_INVENTORY_RELATIVE]
      );
      baseEntries = parseInventoryManifest(
        trustedManifestFile.get(DESIGN_DEBT_INVENTORY_RELATIVE),
        `${DESIGN_DEBT_INVENTORY_RELATIVE} at ${trustedBaseRef}`
      );
      const trustedBaseFiles = readTrustedBaseFiles(
        repoRoot,
        trustedBaseRef,
        [...baseEntries, ...entries].map(entry => entry.path)
      );
      readBaseFile = registryPath => {
        if (registryPath === DESIGN_DEBT_INVENTORY_RELATIVE) {
          return trustedManifestFile.get(registryPath);
        }
        return trustedBaseFiles.get(registryPath);
      };
    } else {
      baseEntries = parseInventoryManifest(
        readBaseFile(DESIGN_DEBT_INVENTORY_RELATIVE),
        `${DESIGN_DEBT_INVENTORY_RELATIVE} at ${trustedBaseRef}`
      );
    }
    issues.push(...compareInventoryToTrustedBase(baseEntries, entries));
  } catch (error) {
    issues.push(error instanceof Error ? error.message : String(error));
  }

  if (issues.length === 0) {
    for (const entry of entries) {
      try {
        const baseRegistry = parseRegistryContent(
          entry,
          readBaseFile?.(entry.path),
          `${entry.path} at ${trustedBaseRef}`
        );
        const candidateRegistry = parseRegistryContent(
          entry,
          readCandidateRegistry(repoRoot, entry.path),
          `${entry.path} in candidate tree`
        );
        const result = compareRegistryProjection(
          entry,
          baseRegistry,
          candidateRegistry
        );
        registries.push(result);
        issues.push(...result.issues);
      } catch (error) {
        issues.push(
          `${entry.id}: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }
  }

  return {
    ok: issues.length === 0,
    schema: DESIGN_DEBT_REGISTRY_SCHEMA,
    requestedBaseRef,
    trustedBaseRef,
    inventoryCount: entries.length,
    registries,
    issues,
  };
}

/**
 * Growth-only verdict. Unbaselined shrink is not a source-enrollment failure.
 *
 * @param {{ repoRoot?: string, webRoot?: string, compareRegistries?: boolean, trustedBaseRef?: string, env?: NodeJS.ProcessEnv, entries?: readonly unknown[], readBaseFile?: (path: string) => string, now?: Date }} [options]
 */
export function evaluateDesignSystemSourceRatchet(options = {}) {
  const repoRoot = options.repoRoot ?? REPO_ROOT;
  const webRoot = options.webRoot ?? join(repoRoot, 'apps/web');
  const sourceMetrics = countDesignSystemSourceMetrics(webRoot);
  const metrics = [
    {
      id: 'arbitrary-values',
      metric: 'arbitrary Tailwind values',
      baselinePath: ARBITRARY_BASELINE_RELATIVE,
      count: sourceMetrics.arbitraryCount,
      baseline: readBaselineCount(join(repoRoot, ARBITRARY_BASELINE_RELATIVE)),
    },
    {
      id: 'linear-namespace',
      metric: '--linear-* usage',
      baselinePath: LINEAR_BASELINE_RELATIVE,
      count: sourceMetrics.linearNamespace.count,
      baseline: readBaselineCount(join(repoRoot, LINEAR_BASELINE_RELATIVE)),
    },
  ];

  const issues = [];
  for (const metric of metrics) {
    if (metric.count > metric.baseline) {
      issues.push(
        `${metric.metric} grew: ${metric.count} > baseline ${metric.baseline} (${metric.baselinePath}). ` +
          'Use the canonical tokens instead of adding new debt, or justify a floor raise in review.'
      );
    }
  }

  const registryReceipt =
    options.compareRegistries === false
      ? null
      : evaluateDesignDebtRegistries(options);
  if (registryReceipt) issues.push(...registryReceipt.issues);

  return {
    ok: issues.length === 0,
    metrics,
    registryReceipt,
    issues,
  };
}

function main() {
  const result = evaluateDesignSystemSourceRatchet();
  if (process.argv.includes('--json')) {
    console.log(
      JSON.stringify(
        {
          ok: result.ok,
          metrics: result.metrics,
          registryReceipt: result.registryReceipt,
          issues: result.issues,
        },
        null,
        2
      )
    );
    if (!result.ok) process.exitCode = 1;
    return;
  }
  const summary = result.metrics
    .map(metric => `${metric.metric} ${metric.count}/${metric.baseline}`)
    .join(', ');
  const registrySummary = result.registryReceipt
    ? `, registries ${result.registryReceipt.registries.length}/${result.registryReceipt.inventoryCount} vs ${result.registryReceipt.trustedBaseRef}`
    : '';
  if (!result.ok) {
    console.error(
      `[design-system-source-ratchet] FAIL — ${summary}${registrySummary}`
    );
    for (const issue of result.issues) console.error(issue);
    process.exitCode = 1;
    return;
  }
  console.log(
    `[design-system-source-ratchet] PASS — ${summary}${registrySummary}`
  );
}

if (
  process.argv[1] &&
  realpathSync(fileURLToPath(import.meta.url)) ===
    realpathSync(resolve(process.argv[1]))
) {
  main();
}
