const { execFileSync } = require('node:child_process');
const { existsSync, readFileSync } = require('node:fs');
const { dirname, join } = require('node:path');

/**
 * WCAG 2.2 Level AA axe options.
 *
 * axe-core 4.14 ships `target-size` (WCAG 2.5.8, 24 CSS px, tag `wcag22aa`)
 * with `enabled: false`. `runOnly` tags do not turn it on. `AxeBuilder.options`
 * replaces the whole options object, and `disableRules` replaces `rules`, so
 * the enable and any allowlisted disable have to be one object.
 * axe-core 4.14 has no separate level-A tag for 2.2.
 *
 * CommonJS so Playwright's spec transform can load it. Path lookup walks from
 * this file and from cwd so a bundled spec still finds the allowlist.
 */
const TARGET_SIZE_RULE = 'target-size';
const MIN_TARGET_PX = 24;
const TAG_SOURCE = 'apps/web/lib/a11y-gates/wcag-22-aa.ts';

function findRepoRoot(start) {
  let dir = start;
  for (let i = 0; i < 10; i += 1) {
    if (
      existsSync(join(dir, 'docs/ACCESSIBILITY.md')) &&
      existsSync(join(dir, 'apps/web'))
    ) {
      return dir;
    }
    const parent = dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
  return null;
}

const repoRoot = findRepoRoot(__dirname) || findRepoRoot(process.cwd());
if (!repoRoot) {
  throw new Error('a11y gate could not find the Jovie repo root');
}

const besideAllowlist = join(__dirname, 'a11y-allowlist.json');
const allowlistPath = existsSync(besideAllowlist)
  ? besideAllowlist
  : join(repoRoot, 'apps/web/lib/a11y-gates/a11y-allowlist.json');

function loadWcag22AaTags() {
  const source = readFileSync(join(repoRoot, TAG_SOURCE), 'utf8');
  const block = source.match(
    /export const WCAG_22_AA_TAGS = \[([\s\S]*?)\] as const;/
  );
  if (!block) {
    throw new Error(`${TAG_SOURCE} is missing WCAG_22_AA_TAGS`);
  }
  const tags = [...block[1].matchAll(/'([^']+)'/g)].map(match => match[1]);
  const levelATag = 'wcag22' + 'a';
  if (
    tags.length !== 5 ||
    !tags.includes('wcag22aa') ||
    tags.includes(levelATag)
  ) {
    throw new Error(`${TAG_SOURCE} tag list is not WCAG 2.2 AA`);
  }
  return tags;
}

function assertStorybookParameters() {
  const source = readFileSync(join(repoRoot, TAG_SOURCE), 'utf8');
  if (!source.includes("test: 'error'")) {
    throw new Error('Storybook a11y test mode must be error');
  }
  if (
    !source.includes("id: 'color-contrast'") ||
    !source.includes("id: 'target-size'")
  ) {
    throw new Error(
      'Storybook a11y parameters must enable contrast and target-size'
    );
  }
  const preview = readFileSync(
    join(repoRoot, 'apps/web/.storybook/preview.tsx'),
    'utf8'
  );
  if (
    !preview.includes("from '../lib/a11y-gates/wcag-22-aa.ts'") ||
    !preview.includes('a11y: STORYBOOK_A11Y_PARAMETERS')
  ) {
    throw new Error('Storybook preview must use the shared a11y parameters');
  }
}

function loadAllowlist() {
  return JSON.parse(readFileSync(allowlistPath, 'utf8'));
}

function isExpired(expires, now) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(expires)) {
    throw new Error(`invalid allowlist expiry: ${expires}`);
  }
  const end = Date.parse(`${expires}T23:59:59.999Z`);
  if (Number.isNaN(end)) {
    throw new Error(`invalid allowlist expiry: ${expires}`);
  }
  return now.getTime() > end;
}

function assertAllowlist(allowlist, now) {
  if (allowlist?.schema !== 'jovie.a11y-allowlist/v1') {
    throw new Error('a11y allowlist schema mismatch');
  }
  if (!Array.isArray(allowlist.entries)) {
    throw new Error('a11y allowlist entries must be an array');
  }
  if (allowlist.maxEntries !== allowlist.entries.length) {
    throw new Error(
      `a11y allowlist maxEntries (${allowlist.maxEntries}) must equal entries (${allowlist.entries.length})`
    );
  }
  const ids = new Set();
  const surfaces = new Set();
  for (const entry of allowlist.entries) {
    if (!entry || typeof entry.id !== 'string' || entry.id.length === 0) {
      throw new Error('a11y allowlist entry missing id');
    }
    if (ids.has(entry.id)) {
      throw new Error(`duplicate allowlist id ${entry.id}`);
    }
    ids.add(entry.id);
    if (typeof entry.surface !== 'string' || entry.surface.length === 0) {
      throw new Error(`allowlist ${entry.id} missing surface`);
    }
    if (typeof entry.ruleId !== 'string' || entry.ruleId.length === 0) {
      throw new Error(`allowlist ${entry.id} missing ruleId`);
    }
    if (entry.ruleId === TARGET_SIZE_RULE) {
      throw new Error('target-size cannot be allowlisted');
    }
    const pair = `${entry.surface}:${entry.ruleId}`;
    if (surfaces.has(pair)) throw new Error(`duplicate allowlist rule ${pair}`);
    surfaces.add(pair);
    if (!/^JOV-\d+$/.test(entry.issue)) {
      throw new Error(`allowlist ${entry.id} needs a JOV issue id`);
    }
    if (typeof entry.reason !== 'string' || entry.reason.trim().length === 0) {
      throw new Error(`allowlist ${entry.id} missing reason`);
    }
    if (isExpired(entry.expires, now)) {
      throw new Error(
        `allowlist ${entry.id} (${entry.issue}) expired on ${entry.expires}`
      );
    }
  }
}

function assertAllowlistFresh(now = new Date()) {
  assertAllowlist(loadAllowlist(), now);
}

function disabledRuleIds(surface, now = new Date()) {
  const allowlist = loadAllowlist();
  assertAllowlist(allowlist, now);
  return allowlist.entries
    .filter(entry => entry.surface === surface)
    .map(entry => entry.ruleId);
}

function wcag22AaAxeOptions(disabled = [], now = new Date()) {
  const allowlist = loadAllowlist();
  assertAllowlist(allowlist, now);
  const allowed = new Set(allowlist.entries.map(entry => entry.ruleId));
  for (const ruleId of disabled) {
    if (ruleId === TARGET_SIZE_RULE) {
      throw new Error('target-size cannot be disabled');
    }
    if (!allowed.has(ruleId)) {
      throw new Error(`refusing to disable axe rule ${ruleId}`);
    }
  }
  const rules = {
    [TARGET_SIZE_RULE]: { enabled: true },
    'color-contrast': {
      enabled: !disabled.includes('color-contrast'),
    },
  };
  for (const ruleId of disabled) {
    if (ruleId === 'color-contrast') continue;
    rules[ruleId] = { enabled: false };
  }
  return {
    runOnly: { type: 'tag', values: [...loadWcag22AaTags()] },
    rules,
  };
}

function classifyRenderedTarget(box) {
  const width = box?.width ?? 0;
  const height = box?.height ?? 0;
  if (width <= 0 || height <= 0) return 'hidden';
  if (width < MIN_TARGET_PX || height < MIN_TARGET_PX) return 'undersized';
  return 'ok';
}

function legacyWcagTagCalls(source) {
  const pattern = new RegExp(
    '\\.' + 'with' + 'Tags' + '\\(\\s*\\[([\\s\\S]*?)\\]\\s*\\)',
    'g'
  );
  const hits = [];
  for (const match of source.matchAll(pattern)) {
    if (/\bwcag2/.test(match[1])) hits.push(match[0]);
  }
  return hits;
}

function gitGrep(needle) {
  return execFileSync(
    'git',
    ['grep', '-n', '-I', '-e', needle, '--', 'apps/web', 'scripts'],
    { cwd: repoRoot, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 }
  );
}

function assertNoLegacyWcagTags() {
  let listed = '';
  try {
    listed = gitGrep('with' + 'Tags');
  } catch (error) {
    const status =
      typeof error === 'object' && error && 'status' in error
        ? error.status
        : undefined;
    if (status === 1) listed = '';
    else throw error;
  }
  const files = new Set();
  for (const line of listed.split('\n')) {
    if (!line) continue;
    files.add(line.slice(0, line.indexOf(':')));
  }
  const violations = [];
  for (const file of files) {
    const source = readFileSync(join(repoRoot, file), 'utf8');
    for (const call of legacyWcagTagCalls(source)) {
      violations.push(`${file}: ${call.replace(/\s+/g, ' ')}`);
    }
  }
  if (violations.length > 0) {
    throw new Error(
      `WCAG axe scans must call wcag22AaAxeOptions():\n${violations.join('\n')}`
    );
  }
  const levelATag = 'wcag22' + 'a';
  let bogus = '';
  try {
    bogus = gitGrep('wcag22');
  } catch (error) {
    const status =
      typeof error === 'object' && error && 'status' in error
        ? error.status
        : undefined;
    if (status === 1) bogus = '';
    else throw error;
  }
  const bogusHits = bogus
    .split('\n')
    .filter(line => new RegExp(`${levelATag}(?!a)`).test(line));
  if (bogusHits.length > 0) {
    throw new Error(
      `axe-core has no ${levelATag} tag:\n${bogusHits.join('\n')}`
    );
  }
}

const DOC_REQUIRED = [
  'WCAG 2.2 Level AA',
  'A11y (UI paths)',
  'target-size',
  'workflow_dispatch',
  'lint:touch-target',
  'not part of PR Ready',
  'not a required pull request check',
];

const DOC_FORBIDDEN = [
  'WCAG 2.1 Level AA',
  'No CI failures',
  'Runs in CI on every PR',
  'Phase 1: Baseline',
];

function assertAccessibilityDocs() {
  const doc = readFileSync(
    join(repoRoot, 'docs/ACCESSIBILITY.md'),
    'utf8'
  ).replace(/\s+/g, ' ');
  const missing = DOC_REQUIRED.filter(phrase => !doc.includes(phrase));
  const present = DOC_FORBIDDEN.filter(phrase => doc.includes(phrase));
  if (missing.length > 0 || present.length > 0) {
    throw new Error(
      `docs/ACCESSIBILITY.md drifted (missing: ${missing.join(', ') || 'none'}; forbidden: ${present.join(', ') || 'none'})`
    );
  }
}

function assertRepositoryWcagStandard() {
  assertAllowlistFresh();
  assertNoLegacyWcagTags();
  assertAccessibilityDocs();
  assertStorybookParameters();
  loadWcag22AaTags();
}

if (require.main === module) {
  assertRepositoryWcagStandard();
  console.log('a11y wcag standard check passed');
}

module.exports = {
  loadWcag22AaTags,
  loadAllowlist,
  isExpired,
  assertAllowlist,
  assertAllowlistFresh,
  disabledRuleIds,
  wcag22AaAxeOptions,
  classifyRenderedTarget,
  legacyWcagTagCalls,
  assertNoLegacyWcagTags,
  assertAccessibilityDocs,
  assertRepositoryWcagStandard,
};
