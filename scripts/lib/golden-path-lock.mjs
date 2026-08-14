#!/usr/bin/env node
/**
 * Fail-closed golden-path lock (JOV-5085): homepage Get started → /start →
 * logged-out first message sends → waitlist write only after verified auth.
 * Missing secrets fail closed. Merge gate never reads E2E_PROD.
 */

export const GOLDEN_PATH_LOCK_SCHEMA = 'jovie-golden-path-lock/v1';
export const GOLDEN_PATH_PROD_ORIGIN = 'https://jov.ie';
export const GOLDEN_PATH_CTA_LABEL = 'Get started';
export const GOLDEN_PATH_START_PATH = '/start';
export const FAKE_RATE_LIMIT_COPY = 'Too many messages';
export const CURSOR_AGENTS_URL = 'https://api.cursor.com/v0/agents';
export const JOVIE_GITHUB_REPO = 'https://github.com/JovieInc/Jovie';
export const GOLDEN_PATH_FINGERPRINT_PREFIX = 'golden-path-lock:prod';

export const MERGE_GATE_TEST_FILES = Object.freeze([
  'apps/web/tests/unit/api/chat/onboarding-handler.test.ts',
  'apps/web/tests/unit/onboarding/onboardingChatHelpers.errors.test.ts',
  'apps/web/tests/unit/app/auth-front-door-contract.test.ts',
  'apps/web/tests/unit/api/waitlist/waitlist.test.ts',
]);

export const GOLDEN_PATH_LOCK_SELF_TEST =
  'lib/__tests__/golden-path-lock.test.mjs';

/** Prefixes/files that document the locked surfaces. Tests always run. */
export const GOLDEN_PATH_PATH_PREFIXES = Object.freeze([
  'apps/web/app/api/chat/',
  'apps/web/app/api/waitlist/',
  'apps/web/app/start/',
  'apps/web/app/(auth)/',
  'apps/web/app/signin/',
  'apps/web/app/signup/',
  'apps/web/app/sign-in/',
  'apps/web/app/sign-up/',
  'apps/web/data/homepageFrontDoorCta.ts',
  'apps/web/data/marketingCtaIntents.ts',
  'apps/web/lib/flags/marketing-static.ts',
  'apps/web/components/features/onboarding/',
  'apps/web/lib/onboarding/',
  'apps/web/lib/chat/',
  'scripts/lib/golden-path-lock.mjs',
  'scripts/golden-path-lock.mjs',
  '.github/workflows/golden-path-prod-autofix.yml',
]);

const FORBIDDEN_SKIP_REASONS = Object.freeze([
  'missing secret',
  'missing secrets',
  'e2e_prod',
  'secrets are missing',
  'stub receipt',
]);

/** @typedef {{ id: string, ok: boolean, reason: string }} GoldenPathCheck */
/** @typedef {{ changed: string[], matched: string[], touchesGoldenPath: boolean }} GoldenPathPathClassification */
/** @typedef {{ schema: string, mode: 'merge-gate'|'prod-probe'|'autofix', ok: boolean, skipped?: boolean, stub?: boolean, alwaysRan?: boolean, origin?: string, fingerprint?: string, testFiles?: string[], classification?: GoldenPathPathClassification, checks?: GoldenPathCheck[] }} GoldenPathReceipt */
/** @typedef {{ schema: string, mode: 'prod-probe', ok: boolean, skipped: boolean, origin: string, fingerprint: string, checks: GoldenPathCheck[] }} GoldenPathProdProbeReceipt */
/** @typedef {{ action: 'fail_closed'|'dedup'|'launch', reason: string, fingerprint?: string, existingAgentIds?: string[], openIssueUrl?: string|null, request?: { prompt: { text: string }, source: { repository: string, ref: string }, target: { autoCreatePr: boolean } } }} GoldenPathAutofixPlan */

/** @param {string[]} [files] @returns {GoldenPathPathClassification} */
export function classifyChangedPaths(files = []) {
  const changed = (Array.isArray(files) ? files : [])
    .filter(file => typeof file === 'string' && file.length > 0)
    .map(file => file.replaceAll('\\', '/'));
  const matched = changed.filter(file =>
    GOLDEN_PATH_PATH_PREFIXES.some(
      prefix => file === prefix || file.startsWith(prefix)
    )
  );
  return {
    changed,
    matched,
    touchesGoldenPath: matched.length > 0,
  };
}

/** @param {string} [html] @returns {GoldenPathCheck} */
export function evaluateHomepageHtml(html) {
  if (typeof html !== 'string' || html.trim().length === 0) {
    return {
      id: 'homepage-cta',
      ok: false,
      reason: 'homepage HTML was empty',
    };
  }
  const hasLabel = html.includes(GOLDEN_PATH_CTA_LABEL);
  const hasStartHref = /href\s*=\s*["'][^"']*\/start(?:[?"']|\/)/i.test(html);
  if (!hasLabel || !hasStartHref) {
    return {
      id: 'homepage-cta',
      ok: false,
      reason: `homepage CTA must be "${GOLDEN_PATH_CTA_LABEL}" → ${GOLDEN_PATH_START_PATH}`,
    };
  }
  return {
    id: 'homepage-cta',
    ok: true,
    reason: `found ${GOLDEN_PATH_CTA_LABEL} → ${GOLDEN_PATH_START_PATH}`,
  };
}

function bodyTextOf(body) {
  if (typeof body === 'string') return body;
  if (body == null) return '';
  try {
    return JSON.stringify(body);
  } catch {
    return String(body);
  }
}

/** @param {{ status?: number, body?: unknown }} [input] @returns {GoldenPathCheck} */
export function evaluateChatFirstMessage({ status, body } = {}) {
  const text = bodyTextOf(body);
  if (status === 401) {
    return {
      id: 'logged-out-first-message',
      ok: false,
      reason: 'logged-out /start first message returned 401',
    };
  }
  if (text.includes(FAKE_RATE_LIMIT_COPY)) {
    return {
      id: 'logged-out-first-message',
      ok: false,
      reason: '401-class lie: response mapped to fake rate-limit copy',
    };
  }
  if (status === 200) {
    return {
      id: 'logged-out-first-message',
      ok: true,
      reason: 'logged-out first message accepted (200)',
    };
  }
  if (status === 403 && text.includes('TURNSTILE_REQUIRED')) {
    return {
      id: 'logged-out-first-message',
      ok: true,
      reason:
        'logged-out first message reached Turnstile (403 TURNSTILE_REQUIRED)',
    };
  }
  return {
    id: 'logged-out-first-message',
    ok: false,
    reason: `logged-out first message failed (status ${status ?? 'missing'})`,
  };
}

/** @param {{ status?: number }} [input] @returns {GoldenPathCheck} */
export function evaluateWaitlistUnauth({ status } = {}) {
  if (status === 401) {
    return {
      id: 'waitlist-after-auth',
      ok: true,
      reason: 'unauthenticated waitlist write rejected with 401',
    };
  }
  return {
    id: 'waitlist-after-auth',
    ok: false,
    reason: `unauthenticated waitlist write must 401 (got ${status ?? 'missing'})`,
  };
}

/** @param {{ homepageHtml?: string, chatStatus?: number, chatBody?: unknown, waitlistStatus?: number }} [input] @returns {{ ok: boolean, checks: GoldenPathCheck[] }} */
export function evaluateProdProbe({
  homepageHtml,
  chatStatus,
  chatBody,
  waitlistStatus,
} = {}) {
  const checks = [
    evaluateHomepageHtml(homepageHtml),
    evaluateChatFirstMessage({ status: chatStatus, body: chatBody }),
    evaluateWaitlistUnauth({ status: waitlistStatus }),
  ];
  return {
    ok: checks.every(check => check.ok),
    checks,
  };
}

/** @param {GoldenPathCheck[]} [checks] @returns {string[]} */
export function failedCheckIds(checks = []) {
  return checks.filter(check => !check.ok).map(check => check.id);
}

/** @param {GoldenPathCheck[]} [checks] @returns {string} */
export function buildFingerprint(checks = []) {
  const failed = failedCheckIds(checks);
  const suffix = failed.length > 0 ? failed.join(',') : 'ok';
  return `${GOLDEN_PATH_FINGERPRINT_PREFIX}:${suffix}`;
}

/** @param {unknown} candidate @returns {{ ok: boolean, errors: string[] }} */
export function validateReceipt(candidate) {
  const errors = [];
  if (
    candidate === null ||
    typeof candidate !== 'object' ||
    Array.isArray(candidate)
  ) {
    return { ok: false, errors: ['receipt must be a JSON object'] };
  }
  const receipt = /** @type {Record<string, unknown>} */ (candidate);
  if (receipt.schema !== GOLDEN_PATH_LOCK_SCHEMA) {
    errors.push(`schema must be ${GOLDEN_PATH_LOCK_SCHEMA}`);
  }
  if (
    receipt.mode !== 'merge-gate' &&
    receipt.mode !== 'prod-probe' &&
    receipt.mode !== 'autofix'
  ) {
    errors.push('mode must be merge-gate, prod-probe, or autofix');
  }
  if (typeof receipt.ok !== 'boolean') {
    errors.push('ok must be a boolean');
  }
  if (!Array.isArray(receipt.checks)) {
    errors.push('checks must be an array');
  } else {
    for (const [index, check] of receipt.checks.entries()) {
      if (!check || typeof check !== 'object' || Array.isArray(check)) {
        errors.push(`checks[${index}] must be an object`);
        continue;
      }
      const item = /** @type {Record<string, unknown>} */ (check);
      if (typeof item.id !== 'string' || item.id.length === 0) {
        errors.push(`checks[${index}].id must be a non-empty string`);
      }
      if (typeof item.ok !== 'boolean') {
        errors.push(`checks[${index}].ok must be a boolean`);
      }
      if (typeof item.reason !== 'string' || item.reason.length === 0) {
        errors.push(`checks[${index}].reason must be a non-empty string`);
      }
    }
  }
  if (receipt.skipped === true) {
    errors.push('receipt must not skip; missing secrets fail closed');
  }
  if (receipt.stub === true) {
    errors.push('stub receipts are forbidden');
  }
  const haystack = JSON.stringify(receipt).toLowerCase();
  for (const phrase of FORBIDDEN_SKIP_REASONS) {
    if (
      haystack.includes(phrase) &&
      (receipt.skipped === true || receipt.ok === true)
    ) {
      errors.push(`receipt must not skip because ${phrase}`);
    }
  }
  return { ok: errors.length === 0, errors };
}

/** @param {{ ok?: boolean, checks?: GoldenPathCheck[], classification?: GoldenPathPathClassification, testFiles?: readonly string[] }} [input] @returns {GoldenPathReceipt} */
export function buildMergeGateReceipt({
  ok,
  checks,
  classification,
  testFiles = MERGE_GATE_TEST_FILES,
} = {}) {
  return {
    schema: GOLDEN_PATH_LOCK_SCHEMA,
    mode: 'merge-gate',
    ok: Boolean(ok),
    skipped: false,
    alwaysRan: true,
    testFiles: [...testFiles],
    classification: classification ?? classifyChangedPaths([]),
    checks: Array.isArray(checks) ? checks : [],
  };
}

/** @param {{ ok?: boolean, checks?: GoldenPathCheck[], origin?: string }} [input] @returns {GoldenPathProdProbeReceipt} */
export function buildProdProbeReceipt({
  ok,
  checks,
  origin = GOLDEN_PATH_PROD_ORIGIN,
} = {}) {
  const list = Array.isArray(checks) ? checks : [];
  return {
    schema: GOLDEN_PATH_LOCK_SCHEMA,
    mode: 'prod-probe',
    ok: Boolean(ok),
    skipped: false,
    origin,
    fingerprint: buildFingerprint(list),
    checks: list,
  };
}

/** @param {{ fingerprint?: string, checks?: GoldenPathCheck[], origin?: string, receipt?: GoldenPathReceipt | null }} input @returns {string} */
export function buildAutofixPrompt({ fingerprint, checks, origin, receipt }) {
  const failed = (checks ?? []).filter(check => !check.ok);
  const lines = failed.map(check => `- ${check.id}: ${check.reason}`);
  return [
    'P0: the locked golden path is broken in production. Autofix and open a PR.',
    '',
    'Locked path (do not invent a new product flow):',
    '1. https://jov.ie homepage',
    '2. Get started → /start',
    '3. Logged-out first message actually sends (not 401, not a fake rate-limit)',
    '4. Waitlist write only after verified auth',
    '',
    `Fingerprint: ${fingerprint}`,
    `Origin: ${origin ?? GOLDEN_PATH_PROD_ORIGIN}`,
    `Linear: JOV-5085 (lock) / JOV-5084 (prior 401-as-rate-limit class)`,
    '',
    'Failed checks:',
    ...(lines.length > 0
      ? lines
      : ['- (receipt reported failure without check ids)']),
    '',
    'Reproduce without signup secrets:',
    `- GET ${origin ?? GOLDEN_PATH_PROD_ORIGIN} and require Get started → /start`,
    `- POST ${origin ?? GOLDEN_PATH_PROD_ORIGIN}/api/chat with {"messages":[{"role":"user","content":"hi"}]} — must not 401 and must not say "Too many messages"`,
    `- POST ${origin ?? GOLDEN_PATH_PROD_ORIGIN}/api/waitlist unauthenticated — must 401`,
    '',
    'Fix the product regression. Add or update a regression test. Do not skip because secrets are missing.',
    'Do not merge. Do not deploy. Tell Gem she missed this after the lock was on.',
    receipt ? `Receipt: ${JSON.stringify(receipt)}` : '',
  ]
    .filter(line => line !== '')
    .join('\n');
}

/** @param {{ cursorApiKey?: string | null, existingAgentIds?: string[], openIssueUrl?: string, fingerprint?: string, checks?: GoldenPathCheck[], origin?: string, receipt?: GoldenPathReceipt | null }} [input] @returns {GoldenPathAutofixPlan} */
export function planAutofix({
  cursorApiKey,
  existingAgentIds = [],
  openIssueUrl = '',
  fingerprint,
  checks,
  origin,
  receipt,
} = {}) {
  if (typeof cursorApiKey !== 'string' || cursorApiKey.trim().length === 0) {
    return {
      action: 'fail_closed',
      reason: 'missing_cursor_api_key',
      fingerprint,
    };
  }
  const owned = (
    Array.isArray(existingAgentIds) ? existingAgentIds : []
  ).filter(id => typeof id === 'string' && id.length > 0);
  if (owned.length > 0) {
    return {
      action: 'dedup',
      reason: 'agent_already_owns_fingerprint',
      fingerprint,
      existingAgentIds: owned,
      openIssueUrl: openIssueUrl || null,
    };
  }
  return {
    action: 'launch',
    reason: 'prod_golden_path_failed',
    fingerprint,
    openIssueUrl: openIssueUrl || null,
    request: {
      prompt: {
        text: buildAutofixPrompt({ fingerprint, checks, origin, receipt }),
      },
      source: {
        repository: JOVIE_GITHUB_REPO,
        ref: 'main',
      },
      target: {
        autoCreatePr: true,
      },
    },
  };
}

/** @param {string} apiKey @returns {string} */
export function cursorAuthHeader(apiKey) {
  const token = Buffer.from(`${apiKey}:`, 'utf8').toString('base64');
  return `Basic ${token}`;
}

/** @param {unknown} agents @param {string} [fingerprint] @returns {string[]} */
export function findOwnedAgents(agents, fingerprint) {
  const list = Array.isArray(agents) ? agents : [];
  const needle = String(fingerprint ?? '');
  if (!needle) return [];
  return list
    .filter(agent => {
      const haystack = JSON.stringify(agent ?? {}).toLowerCase();
      return haystack.includes(needle.toLowerCase());
    })
    .map(agent => {
      const record = /** @type {Record<string, unknown>} */ (agent ?? {});
      return record.id;
    })
    .filter(
      /** @returns {id is string} */
      id => typeof id === 'string' && id.length > 0
    );
}
