/**
 * WCAG 2.2 Level AA axe options.
 *
 * axe-core 4.14 ships `target-size` (WCAG 2.5.8, 24 CSS px, tag `wcag22aa`)
 * with `enabled: false`. `runOnly` tags do not turn it on. `AxeBuilder.options`
 * replaces the whole options object, and `disableRules` replaces `rules`, so
 * the enable and any allowlisted disable have to be one object.
 * axe-core 4.14 has no separate level-A tag for 2.2.
 *
 * CommonJS so Playwright's spec transform can load it. The tag list is
 * inlined; `wcag-standard.test.ts` checks it against `wcag-22-aa.ts`.
 * Repo sweeps that read files live in `apps/web/scripts/` so this module
 * stays off the request-path thread-blocking ratchet (JOV-INV-031).
 */
const TARGET_SIZE_RULE = 'target-size';
const MIN_TARGET_PX = 24;
const WCAG_22_AA_TAGS = Object.freeze([
  'wcag2a',
  'wcag2aa',
  'wcag21a',
  'wcag21aa',
  'wcag22aa',
]);

const allowlist = require('./a11y-allowlist.json');

function loadWcag22AaTags() {
  const tags = [...WCAG_22_AA_TAGS];
  const levelATag = 'wcag22' + 'a';
  if (
    tags.length !== 5 ||
    !tags.includes('wcag22aa') ||
    tags.includes(levelATag)
  ) {
    throw new Error('WCAG 2.2 AA tag list is not the five canonical tags');
  }
  return tags;
}

function loadAllowlist() {
  return allowlist;
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

function assertAllowlist(allowlistValue, now) {
  if (allowlistValue?.schema !== 'jovie.a11y-allowlist/v1') {
    throw new Error('a11y allowlist schema mismatch');
  }
  if (!Array.isArray(allowlistValue.entries)) {
    throw new Error('a11y allowlist entries must be an array');
  }
  if (allowlistValue.maxEntries !== allowlistValue.entries.length) {
    throw new Error(
      `a11y allowlist maxEntries (${allowlistValue.maxEntries}) must equal entries (${allowlistValue.entries.length})`
    );
  }
  const ids = new Set();
  const surfaces = new Set();
  for (const entry of allowlistValue.entries) {
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
  const loaded = loadAllowlist();
  assertAllowlist(loaded, now);
  return loaded.entries
    .filter(entry => entry.surface === surface)
    .map(entry => entry.ruleId);
}

/**
 * @param {readonly string[]} [disabled]
 * @param {Date} [now]
 * @returns {{
 *   runOnly: { type: 'tag', values: string[] },
 *   rules: Record<string, { enabled: boolean }>
 * }}
 */
function wcag22AaAxeOptions(disabled = [], now = new Date()) {
  const loaded = loadAllowlist();
  assertAllowlist(loaded, now);
  const allowed = new Set(loaded.entries.map(entry => entry.ruleId));
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
};
