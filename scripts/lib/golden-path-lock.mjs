#!/usr/bin/env node
/**
 * Fail-closed golden-path lock (JOV-5085): the certified homepage front
 * door → logged-out first message sends → waitlist write only after
 * verified auth. The certified homepage has exactly two states
 * (JOV-5864 / JOV-6794):
 * - open (WAITLIST_ENABLED=false): name search
 *   ("Search your name" → "Find me") with a /start handoff
 * - waitlist-gated (WAITLIST_ENABLED=true, prelaunch): "Request access"
 *   primary CTA → /signup. Waitlist gating is the only allowed gate.
 * Missing secrets fail closed. Merge gate never reads E2E_PROD.
 */

import { createGoldenPathLinearIssue } from './golden-path-intake.mjs';
import {
  addLinearIssueComment,
  listLinearIssueComments,
} from './linear-issue-intake.mjs';

export const GOLDEN_PATH_LOCK_SCHEMA = 'jovie-golden-path-lock/v1';
export const GOLDEN_PATH_PROD_ORIGIN = 'https://jov.ie';
export const GOLDEN_PATH_HERO_SEARCH_PLACEHOLDER = 'Search your name';
export const GOLDEN_PATH_HERO_SEARCH_ACTION = 'Find me';
export const GOLDEN_PATH_GATED_CTA_LABEL = 'Request access';
export const GOLDEN_PATH_GATED_CTA_HREF = '/signup';
export const GOLDEN_PATH_START_PATH = '/start';
// Homepage link claim (Tim 2026-09-28): claim jov.ie/you, submit to /start.
export const GOLDEN_PATH_HERO_CLAIM_DOMAIN = 'jov.ie/';
export const GOLDEN_PATH_HERO_CLAIM_ACTION = 'Claim';
export const FAKE_RATE_LIMIT_COPY = 'Too many messages';
export const CURSOR_AGENTS_URL = 'https://api.cursor.com/v0/agents';
export const JOVIE_GITHUB_REPO = 'https://github.com/JovieInc/Jovie';
export const JOVIE_GITHUB_REPO_SLUG = 'JovieInc/Jovie';
export const GITHUB_API_URL = 'https://api.github.com';
export const GOLDEN_PATH_FINGERPRINT_PREFIX = 'golden-path-lock:prod';

// JOV-6827: fingerprint dedupe + launch caps. A launch leaves a durable marker
// comment on the canonical Linear issue so later probe runs cap at one launch
// per fingerprint per 24h and escalate to Summer instead of relaunching
// forever (28 duplicate PRs on 2026-09-27).
export const GOLDEN_PATH_AUTOFIX_WINDOW_MS = 24 * 60 * 60 * 1000;
export const GOLDEN_PATH_AUTOFIX_MAX_ATTEMPTS = 3;
export const AUTOFIX_LAUNCH_MARKER = 'golden-path-autofix-launch';
export const AUTOFIX_ESCALATION_MARKER = 'golden-path-autofix-escalate';
export const AUTOFIX_PR_MARKER = 'Autofix-Fingerprint';

export const MERGE_GATE_TEST_FILES = Object.freeze([
  'apps/web/tests/unit/api/chat/onboarding-handler.test.ts',
  'apps/web/tests/unit/onboarding/onboardingChatHelpers.errors.test.ts',
  'apps/web/tests/unit/app/auth-front-door-contract.test.ts',
  'apps/web/tests/unit/api/waitlist/waitlist.test.ts',
]);

export const GOLDEN_PATH_LOCK_SELF_TEST_FILES = Object.freeze([
  'lib/__tests__/golden-path-lock.test.mjs',
  'lib/__tests__/golden-path-prod-autofix-workflow-contract.test.mjs',
]);

/** @returns {{ mode: 'onboarding', messages: { id: string, role: 'user', parts: { type: 'text', text: string }[] }[] }} */
export function buildProdProbeChatPayload() {
  return {
    mode: 'onboarding',
    messages: [
      {
        id: 'golden-path-lock-probe',
        role: 'user',
        parts: [{ type: 'text', text: 'Hi.' }],
      },
    ],
  };
}

/** Prefixes/files that document the locked surfaces. Tests always run. */
export const GOLDEN_PATH_PATH_PREFIXES = Object.freeze([
  'apps/web/app/api/chat/',
  'apps/web/app/api/waitlist/',
  'apps/web/app/api/onboarding/claim/',
  'apps/web/app/api/billing/health/',
  'apps/web/app/api/stripe/webhooks/',
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

/** @typedef {{ id: string, ok: boolean, reason: string, inconclusive?: boolean }} GoldenPathCheck */
/** @typedef {{ changed: string[], matched: string[], touchesGoldenPath: boolean }} GoldenPathPathClassification */
/** @typedef {{ schema: string, mode: 'merge-gate'|'prod-probe'|'autofix', ok: boolean, skipped?: boolean, stub?: boolean, alwaysRan?: boolean, inconclusive?: boolean, origin?: string, fingerprint?: string, testFiles?: string[], classification?: GoldenPathPathClassification, checks?: GoldenPathCheck[] }} GoldenPathReceipt */
/** @typedef {{ schema: string, mode: 'prod-probe', ok: boolean, inconclusive: boolean, skipped: boolean, origin: string, fingerprint: string, checks: GoldenPathCheck[] }} GoldenPathProdProbeReceipt */
/** @typedef {{ action: 'fail_closed'|'dedup'|'escalate'|'launch', reason: string, fingerprint?: string, existingAgentIds?: string[], openPr?: unknown, openPrNumber?: number|null, priorAttemptCount?: number, openIssueUrl?: string|null, request?: { prompt: { text: string }, source: { repository: string, ref: string }, target: { autoCreatePr: boolean, branchName?: string } } }} GoldenPathAutofixPlan */

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
  // JOV-5864 certified homepage, open state: the hero's only conversion
  // control is the name search — placeholder "Search your name" + submit
  // "Find me" — with a /start handoff still present for the onboarding route.
  const hasPlaceholder = html.includes(GOLDEN_PATH_HERO_SEARCH_PLACEHOLDER);
  const hasAction = html.includes(GOLDEN_PATH_HERO_SEARCH_ACTION);
  const hasStartHandoff =
    /(?:href|action)\s*=\s*["'][^"']*\/start(?:[?"']|\/)/i.test(html);
  const hasClaimForm =
    html.includes(GOLDEN_PATH_HERO_CLAIM_DOMAIN) &&
    />\s*Claim\s*</.test(html) &&
    /<form[^>]*action\s*=\s*["'][^"']*\/start(?:[?"']|\/)/i.test(html);
  if (hasClaimForm) {
    return {
      id: 'homepage-cta',
      ok: true,
      reason: `found link claim "${GOLDEN_PATH_HERO_CLAIM_DOMAIN}" → "${GOLDEN_PATH_HERO_CLAIM_ACTION}" submitting to ${GOLDEN_PATH_START_PATH}`,
    };
  }
  // Legacy name search, accepted until production carries the link claim.
  if (hasPlaceholder && hasAction && hasStartHandoff) {
    return {
      id: 'homepage-cta',
      ok: true,
      reason: `found name search "${GOLDEN_PATH_HERO_SEARCH_PLACEHOLDER}" → "${GOLDEN_PATH_HERO_SEARCH_ACTION}" and ${GOLDEN_PATH_START_PATH} handoff`,
    };
  }
  // Certified waitlist-gated state (prelaunch, WAITLIST_ENABLED=true): the
  // hero's conversion control is "Request access" → /signup
  // (PUBLIC_WAITLIST_URL). This is the only allowed gate — the search is
  // intentionally hidden while gated (JOV-6794).
  const gatedHrefPattern = new RegExp(
    `href\\s*=\\s*["'][^"']*${GOLDEN_PATH_GATED_CTA_HREF.replace('/', '\\/')}(?:[?"']|\\/)`,
    'i'
  );
  const hasGatedLabel = html.includes(GOLDEN_PATH_GATED_CTA_LABEL);
  const hasGatedHref = gatedHrefPattern.test(html);
  if (hasGatedLabel && hasGatedHref) {
    return {
      id: 'homepage-cta',
      ok: true,
      reason: `found waitlist-gated CTA "${GOLDEN_PATH_GATED_CTA_LABEL}" → ${GOLDEN_PATH_GATED_CTA_HREF} (certified prelaunch gate)`,
    };
  }
  return {
    id: 'homepage-cta',
    ok: false,
    reason: `homepage conversion must be the link claim ("${GOLDEN_PATH_HERO_CLAIM_DOMAIN}" → "${GOLDEN_PATH_HERO_CLAIM_ACTION}" → ${GOLDEN_PATH_START_PATH}), the name search ("${GOLDEN_PATH_HERO_SEARCH_PLACEHOLDER}" → "${GOLDEN_PATH_HERO_SEARCH_ACTION}") with a ${GOLDEN_PATH_START_PATH} handoff, or the certified waitlist gate "${GOLDEN_PATH_GATED_CTA_LABEL}" → ${GOLDEN_PATH_GATED_CTA_HREF}`,
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

function parseUIMessageStreamEvents(text) {
  const events = [];
  let dataLines = [];
  let malformed = false;
  const dispatch = () => {
    if (dataLines.length === 0) return;
    const data = dataLines.join('\n');
    dataLines = [];
    if (data === '[DONE]') return;
    try {
      const event = JSON.parse(data);
      if (
        !event ||
        typeof event !== 'object' ||
        Array.isArray(event) ||
        typeof event.type !== 'string'
      ) {
        malformed = true;
        return;
      }
      events.push(event);
    } catch {
      malformed = true;
    }
  };

  const hasFinalLineTerminator = /(?:\r\n|\r|\n)$/.test(text);
  const lines = text.split(/\r\n|\r|\n/);
  // split() adds a synthetic final empty item after a terminator. It is not a
  // blank SSE line unless a second terminator actually ended that blank line.
  if (hasFinalLineTerminator) lines.pop();
  for (const line of lines) {
    if (line.length === 0) {
      dispatch();
      continue;
    }
    if (line.startsWith(':')) continue;
    const separator = line.indexOf(':');
    const field = separator === -1 ? line : line.slice(0, separator);
    if (field === 'data') {
      const value = separator === -1 ? '' : line.slice(separator + 1);
      dataLines.push(value.startsWith(' ') ? value.slice(1) : value);
    }
  }
  if (dataLines.length > 0) malformed = true;

  return { events, malformed };
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
    const { events: streamEvents, malformed } =
      parseUIMessageStreamEvents(text);
    if (malformed) {
      return {
        id: 'logged-out-first-message',
        ok: false,
        reason:
          'logged-out first-message stream contained malformed or unterminated data',
      };
    }
    if (streamEvents.some(event => event.type === 'error')) {
      return {
        id: 'logged-out-first-message',
        ok: false,
        reason: 'logged-out first-message stream included an error event',
      };
    }
    if (!streamEvents.some(event => event.type === 'finish')) {
      return {
        id: 'logged-out-first-message',
        ok: false,
        reason: 'logged-out first-message stream did not reach a finish event',
      };
    }
    return {
      id: 'logged-out-first-message',
      ok: true,
      reason: 'logged-out first-message stream reached a clean finish event',
    };
  }
  if (status === 403 && text.includes('TURNSTILE_REQUIRED')) {
    return {
      id: 'logged-out-first-message',
      ok: false,
      inconclusive: true,
      reason:
        'probe reached Turnstile but supplied no valid token; post-challenge first-message path was not exercised',
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

/** @param {{ status?: number }} [input] @returns {GoldenPathCheck} */
export function evaluateClaimUnauth({ status } = {}) {
  if (status === 401) {
    return {
      id: 'claim-unauth',
      ok: true,
      reason: 'unauthenticated onboarding claim rejected with 401',
    };
  }
  return {
    id: 'claim-unauth',
    ok: false,
    reason: `unauthenticated onboarding claim must 401 (got ${status ?? 'missing'})`,
  };
}

/** @param {{ status?: number, body?: unknown }} [input] @returns {GoldenPathCheck} */
export function evaluateBillingHealth({ status, body } = {}) {
  const healthy =
    body && typeof body === 'object' && !Array.isArray(body)
      ? /** @type {{ healthy?: unknown }} */ (body).healthy
      : undefined;
  if (status === 200 && healthy === true) {
    return {
      id: 'billing-health',
      ok: true,
      reason:
        'public billing health liveness is 200 { healthy: true } with no sync metrics required',
    };
  }
  return {
    id: 'billing-health',
    ok: false,
    reason: `billing health must 200 healthy:true (got ${status ?? 'missing'}, healthy=${String(healthy)})`,
  };
}

/** @param {{ status?: number }} [input] @returns {GoldenPathCheck} */
export function evaluateStripeWebhookLiveness({ status } = {}) {
  if (status === 400) {
    return {
      id: 'stripe-webhook-liveness',
      ok: true,
      reason:
        'unsigned Stripe webhook rejected with 400 (route live, signature required)',
    };
  }
  return {
    id: 'stripe-webhook-liveness',
    ok: false,
    reason: `unsigned Stripe webhook must 400 (got ${status ?? 'missing'})`,
  };
}

/** @param {{ homepageHtml?: string, chatStatus?: number, chatBody?: unknown, waitlistStatus?: number, claimStatus?: number, billingStatus?: number, billingBody?: unknown, stripeWebhookStatus?: number }} [input] @returns {{ ok: boolean, checks: GoldenPathCheck[] }} */
export function evaluateProdProbe({
  homepageHtml,
  chatStatus,
  chatBody,
  waitlistStatus,
  claimStatus,
  billingStatus,
  billingBody,
  stripeWebhookStatus,
} = {}) {
  const checks = [
    evaluateHomepageHtml(homepageHtml),
    evaluateChatFirstMessage({ status: chatStatus, body: chatBody }),
    evaluateWaitlistUnauth({ status: waitlistStatus }),
    evaluateClaimUnauth({ status: claimStatus }),
    evaluateBillingHealth({ status: billingStatus, body: billingBody }),
    evaluateStripeWebhookLiveness({ status: stripeWebhookStatus }),
  ];
  return {
    ok: checks.every(check => check.ok),
    checks,
  };
}

/** @param {GoldenPathCheck[]} [checks] @returns {string[]} */
export function failedCheckIds(checks = []) {
  return checks
    .filter(check => !check.ok && check.inconclusive !== true)
    .map(check => check.id);
}

/** @param {GoldenPathCheck[]} [checks] @returns {string} */
export function buildFingerprint(checks = []) {
  const failed = failedCheckIds(checks);
  const hasInconclusive = checks.some(check => check.inconclusive === true);
  const suffix =
    failed.length > 0
      ? failed.join(',')
      : hasInconclusive
        ? 'inconclusive'
        : 'ok';
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
      if (
        item.inconclusive !== undefined &&
        typeof item.inconclusive !== 'boolean'
      ) {
        errors.push(`checks[${index}].inconclusive must be a boolean`);
      }
      if (item.inconclusive === true && item.ok === true) {
        errors.push(`checks[${index}] cannot pass while inconclusive`);
      }
    }
  }
  if (
    receipt.inconclusive !== undefined &&
    typeof receipt.inconclusive !== 'boolean'
  ) {
    errors.push('inconclusive must be a boolean');
  }
  if (receipt.inconclusive === true) {
    if (receipt.ok === true) {
      errors.push('an inconclusive receipt cannot pass');
    }
    if (receipt.mode !== 'prod-probe') {
      errors.push('only prod-probe receipts may be inconclusive');
    }
    if (
      !Array.isArray(receipt.checks) ||
      !receipt.checks.some(
        check =>
          check &&
          typeof check === 'object' &&
          !Array.isArray(check) &&
          check.inconclusive === true
      )
    ) {
      errors.push('inconclusive receipts require an inconclusive check');
    }
  }
  if (Array.isArray(receipt.checks)) {
    const hasInconclusiveCheck = receipt.checks.some(
      check =>
        check &&
        typeof check === 'object' &&
        !Array.isArray(check) &&
        check.inconclusive === true
    );
    if (hasInconclusiveCheck && receipt.inconclusive !== true) {
      errors.push('inconclusive checks must mark the receipt inconclusive');
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
  const inconclusive = list.some(check => check.inconclusive === true);
  return {
    schema: GOLDEN_PATH_LOCK_SCHEMA,
    mode: 'prod-probe',
    ok: Boolean(ok) && list.every(check => check.ok) && !inconclusive,
    inconclusive,
    skipped: false,
    origin,
    fingerprint: buildFingerprint(list),
    checks: list,
  };
}

/** @param {{ fingerprint?: string, checks?: GoldenPathCheck[], origin?: string, receipt?: GoldenPathReceipt | null }} input @returns {string} */
export function buildAutofixPrompt({ fingerprint, checks, origin, receipt }) {
  const checkList = Array.isArray(checks) ? checks : [];
  const failed = checkList.filter(
    check => !check.ok && check.inconclusive !== true
  );
  const hasInconclusive = checkList.some(check => check.inconclusive === true);
  const lines = failed.map(check => `- ${check.id}: ${check.reason}`);
  return [
    'P0: the locked golden path is broken in production. Autofix and open a PR.',
    '',
    'Locked path (do not invent a new product flow):',
    '1. https://jov.ie homepage',
    `2. Certified front door (JOV-5864 / JOV-6794): open state = name search ("${GOLDEN_PATH_HERO_SEARCH_PLACEHOLDER}" → "${GOLDEN_PATH_HERO_SEARCH_ACTION}") → ${GOLDEN_PATH_START_PATH}; waitlist-gated prelaunch state = "${GOLDEN_PATH_GATED_CTA_LABEL}" → ${GOLDEN_PATH_GATED_CTA_HREF} (the only allowed gate)`,
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
    ...(hasInconclusive
      ? [
          'Probe limitation:',
          '- The anonymous chat probe intentionally sends no Turnstile token. A 403 TURNSTILE_REQUIRED is inconclusive: the post-challenge first-message path was not tested and this challenge alone is not an actionable product failure.',
          '- Do not bypass or weaken Turnstile. Use the normal valid challenge flow only when post-challenge verification is specifically needed.',
          '',
        ]
      : []),
    'Reproduce without signup secrets:',
    `- GET ${origin ?? GOLDEN_PATH_PROD_ORIGIN} and require a certified front door: either the name search "${GOLDEN_PATH_HERO_SEARCH_PLACEHOLDER}" → "${GOLDEN_PATH_HERO_SEARCH_ACTION}" plus a ${GOLDEN_PATH_START_PATH} handoff (open state) or "${GOLDEN_PATH_GATED_CTA_LABEL}" → ${GOLDEN_PATH_GATED_CTA_HREF} (waitlist-gated prelaunch state, JOV-6794; never revert to Get started or an uncertified waitlist wall)`,
    `- POST ${origin ?? GOLDEN_PATH_PROD_ORIGIN}/api/chat with ${JSON.stringify(buildProdProbeChatPayload())} — must not 401 or say "Too many messages"; this probe supplies no Turnstile token, so TURNSTILE_REQUIRED leaves the post-challenge path untested`,
    `- POST ${origin ?? GOLDEN_PATH_PROD_ORIGIN}/api/waitlist unauthenticated — must 401`,
    `- POST ${origin ?? GOLDEN_PATH_PROD_ORIGIN}/api/onboarding/claim unauthenticated — must 401`,
    `- GET ${origin ?? GOLDEN_PATH_PROD_ORIGIN}/api/billing/health — anonymous liveness must 200 { healthy: true }. Sync counts require Authorization: Bearer $CRON_SECRET or an admin session and are not part of this probe`,
    `- POST ${origin ?? GOLDEN_PATH_PROD_ORIGIN}/api/stripe/webhooks unsigned — must 400`,
    '',
    'Fix the product regression. Add or update a regression test. Do not skip because secrets are missing.',
    'JOV-INV-018: a changed user-visible screen must be registered; run `pnpm screen-registration-gate` before opening the PR or CI fails it.',
    `When you open the PR, end the PR body with "${AUTOFIX_PR_MARKER}: ${fingerprint}" so later probe runs dedupe against it.`,
    'Do not merge. Do not deploy. Tell Gem she missed this after the lock was on.',
    receipt ? `Receipt: ${JSON.stringify(receipt)}` : '',
  ]
    .filter(line => line !== '')
    .join('\n');
}

/** @param {{ cursorApiKey?: string | null, existingAgentIds?: string[], openPrs?: unknown[], openPrNumber?: number | null, recentAttemptCount?: number, priorAttemptCount?: number, maxAttempts?: number, openIssueUrl?: string, fingerprint?: string, checks?: GoldenPathCheck[], origin?: string, receipt?: GoldenPathReceipt | null, now?: number }} [input] @returns {GoldenPathAutofixPlan} */
export function planAutofix({
  cursorApiKey,
  existingAgentIds = [],
  openPrs = [],
  openPrNumber = null,
  recentAttemptCount = 0,
  priorAttemptCount = 0,
  maxAttempts = GOLDEN_PATH_AUTOFIX_MAX_ATTEMPTS,
  openIssueUrl = '',
  fingerprint,
  checks,
  origin,
  receipt,
  now = Date.now(),
} = {}) {
  const checkList = Array.isArray(checks) ? checks : [];
  const hasInconclusive = checkList.some(check => check.inconclusive === true);
  const hasActionableFailure = checkList.some(
    check => !check.ok && check.inconclusive !== true
  );
  if (hasInconclusive && !hasActionableFailure) {
    return {
      action: 'fail_closed',
      reason: 'probe_inconclusive',
      fingerprint,
    };
  }
  if (typeof cursorApiKey !== 'string' || cursorApiKey.trim().length === 0) {
    return {
      action: 'fail_closed',
      reason: 'missing_cursor_api_key',
      fingerprint,
    };
  }
  const prs = (Array.isArray(openPrs) ? openPrs : []).filter(
    pr => pr && typeof pr === 'object'
  );
  if (prs.length > 0) {
    return {
      action: 'dedup',
      reason: 'open_pr_owns_fingerprint',
      fingerprint,
      openPr: prs[0],
      openIssueUrl: openIssueUrl || null,
    };
  }
  const owned = (
    Array.isArray(existingAgentIds) ? existingAgentIds : []
  ).filter(id => typeof id === 'string' && id.length > 0);
  if (openPrNumber) {
    return {
      action: 'dedup',
      reason: 'open_pr_owns_fingerprint',
      fingerprint,
      existingAgentIds: owned,
      openPrNumber,
      openIssueUrl: openIssueUrl || null,
    };
  }
  if (owned.length > 0) {
    return {
      action: 'dedup',
      reason: 'agent_already_owns_fingerprint',
      fingerprint,
      existingAgentIds: owned,
      openIssueUrl: openIssueUrl || null,
    };
  }
  if (recentAttemptCount > 0) {
    return {
      action: 'dedup',
      reason: 'launch_capped_24h',
      fingerprint,
      openIssueUrl: openIssueUrl || null,
    };
  }
  if (priorAttemptCount >= maxAttempts) {
    return {
      action: 'escalate',
      reason: 'max_attempts_exceeded',
      fingerprint,
      priorAttemptCount,
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
        // JOV-6832: a fingerprint-derived branch is the dedupe key the agent
        // list and open PRs both expose; the suffix avoids reusing a closed branch.
        branchName: `${autofixBranchPrefix(fingerprint)}-${now.toString(36)}`,
      },
    },
  };
}

/** @param {string} apiKey @returns {string} */
export function cursorAuthHeader(apiKey) {
  const token = Buffer.from(`${apiKey}:`, 'utf8').toString('base64');
  return `Basic ${token}`;
}

/** @param {string} [fingerprint] @returns {string} */
export function autofixBranchPrefix(fingerprint) {
  const slug = String(fingerprint ?? '')
    .replace(`${GOLDEN_PATH_FINGERPRINT_PREFIX}:`, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  return `cursor/golden-path-${slug || 'unknown'}`;
}

const FINISHED_AGENT_STATUSES = new Set(['FINISHED', 'ERROR', 'EXPIRED']);

/**
 * Active Cursor agents already working this fingerprint. The list API does not
 * echo the prompt, so match the fingerprint-derived branch too; finished agents
 * are owned by their PR (see findOpenAutofixPr).
 * @param {unknown} agents @param {string} [fingerprint] @returns {string[]}
 */
export function findOwnedAgents(agents, fingerprint) {
  const list = Array.isArray(agents) ? agents : [];
  const needle = String(fingerprint ?? '');
  if (!needle) return [];
  const branch = autofixBranchPrefix(needle);
  return list
    .filter(agent => {
      const record = /** @type {Record<string, unknown>} */ (agent ?? {});
      if (FINISHED_AGENT_STATUSES.has(String(record.status ?? ''))) {
        return false;
      }
      const haystack = JSON.stringify(agent ?? {}).toLowerCase();
      return (
        haystack.includes(needle.toLowerCase()) || haystack.includes(branch)
      );
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

/**
 * Full agent records whose serialized form mentions the fingerprint.
 * @param {unknown} agents @param {string} [fingerprint]
 * @returns {Record<string, unknown>[]}
 */
export function findOwnedAgentRecords(agents, fingerprint) {
  const list = Array.isArray(agents) ? agents : [];
  const needle = String(fingerprint ?? '');
  if (!needle) return [];
  return list.filter(agent => {
    const haystack = JSON.stringify(agent ?? {}).toLowerCase();
    return haystack.includes(needle.toLowerCase());
  });
}

/** @param {unknown} agent @returns {number|null} epoch ms, or null when unparseable */
export function agentCreatedAtMs(agent) {
  const record = /** @type {Record<string, unknown>} */ (agent ?? {});
  const raw = record.createdAt ?? record.created_at;
  const ms =
    typeof raw === 'string' || typeof raw === 'number'
      ? Date.parse(String(raw))
      : Number.NaN;
  return Number.isNaN(ms) ? null : ms;
}

/**
 * PR records (search/list items) whose title, body, or labels mention the
 * fingerprint marker.
 * @param {unknown} prs @param {string} [fingerprint]
 * @returns {Record<string, unknown>[]}
 */
export function findFingerprintPrs(prs, fingerprint) {
  const list = Array.isArray(prs) ? prs : [];
  const needle = String(fingerprint ?? '');
  if (!needle) return [];
  return list.filter(pr => {
    const haystack = JSON.stringify(pr ?? {}).toLowerCase();
    return haystack.includes(needle.toLowerCase());
  });
}

function githubHeaders(token) {
  return {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
  };
}

async function jsonRequest(fetchImpl, url, init = {}) {
  const response = await fetchImpl(url, init);
  const text = await response.text();
  let body = null;
  try {
    body = JSON.parse(text);
  } catch {
    body = text;
  }
  return { ok: response.ok, status: response.status, body };
}

/** Search open Jovie PRs carrying the fingerprint marker. */
export async function searchOpenFingerprintPrs({
  token,
  fingerprint,
  fetchImpl = fetch,
}) {
  if (!token) return { ok: false, reason: 'missing_github_token', items: [] };
  const q = encodeURIComponent(
    `repo:${JOVIE_GITHUB_REPO_SLUG} is:pr is:open ${fingerprint}`
  );
  const result = await jsonRequest(
    fetchImpl,
    `${GITHUB_API_URL}/search/issues?q=${q}`,
    { headers: githubHeaders(token) }
  );
  if (!result.ok) {
    return {
      ok: false,
      reason: `github_pr_search_${result.status}`,
      items: [],
    };
  }
  const items = Array.isArray(result.body?.items) ? result.body.items : [];
  return { ok: true, items: findFingerprintPrs(items, fingerprint) };
}

/** Comment on a pull request via the issue-comments API. */
export async function commentOnPr({
  token,
  prNumber,
  body,
  fetchImpl = fetch,
}) {
  if (!token) return { ok: false, reason: 'missing_github_token' };
  if (!prNumber) return { ok: false, reason: 'missing_pr_number' };
  const result = await jsonRequest(
    fetchImpl,
    `${GITHUB_API_URL}/repos/${JOVIE_GITHUB_REPO_SLUG}/issues/${prNumber}/comments`,
    {
      method: 'POST',
      headers: { ...githubHeaders(token), 'Content-Type': 'application/json' },
      body: JSON.stringify({ body }),
    }
  );
  if (!result.ok) {
    return { ok: false, reason: `github_pr_comment_${result.status}` };
  }
  return { ok: true };
}

/**
 * JOV-6827: deduped, capped Cursor-direct autofix executor.
 *
 * Order of operations keeps every probe failure fingerprint-addressable:
 * upsert the canonical Linear issue, inspect Cursor agents + open PRs +
 * durable launch markers, then plan:
 *  - open PR for the fingerprint     -> dedup, comment on that PR
 *  - running Cursor agent            -> dedup
 *  - a launch in the last 24h        -> dedup (cap: 1 per fingerprint per 24h)
 *  - >= GOLDEN_PATH_AUTOFIX_MAX_ATTEMPTS launches -> escalate to Summer
 *  - otherwise                       -> launch one Cursor agent and record it
 *
 * @param {{ receipt: GoldenPathProdProbeReceipt, cursorApiKey?: string, linearApiKey?: string, githubToken?: string, fetchImpl?: typeof fetch, now?: number }} input
 */
export async function executeAutofix({
  receipt,
  cursorApiKey = '',
  linearApiKey = process.env.LINEAR_API_KEY ?? '',
  githubToken = process.env.GITHUB_TOKEN ?? process.env.GH_TOKEN ?? '',
  fetchImpl = fetch,
  now = Date.now(),
}) {
  const fingerprint = receipt?.fingerprint;
  const prompt = buildAutofixPrompt({
    fingerprint,
    checks: receipt?.checks,
    origin: receipt?.origin,
    receipt,
  });

  // Durable intake first: every probe failure updates the canonical issue so
  // dedupe state survives Cursor list pagination and PR-body drift.
  const linear = await createGoldenPathLinearIssue(
    { fingerprint, prompt, apiKey: linearApiKey },
    fetchImpl
  );
  if (!linear.ok) {
    return {
      ok: false,
      action: 'fail_closed',
      stage: 'linear_intake',
      reason: linear.reason,
      body: linear.body ?? null,
    };
  }

  const ownedAgents = cursorApiKey
    ? await (async () => {
        const listed = await jsonRequest(fetchImpl, CURSOR_AGENTS_URL, {
          headers: {
            Authorization: cursorAuthHeader(cursorApiKey),
            Accept: 'application/json',
          },
        });
        if (!listed.ok) return [];
        const agents = Array.isArray(listed.body?.agents)
          ? listed.body.agents
          : Array.isArray(listed.body)
            ? listed.body
            : [];
        return findOwnedAgentRecords(agents, fingerprint);
      })()
    : [];
  const ownedAgentIds = ownedAgents
    .map(agent => agent.id)
    .filter(
      /** @param {unknown} id @returns {id is string} */
      id => typeof id === 'string' && id.length > 0
    );

  const openPrs = githubToken
    ? (
        await searchOpenFingerprintPrs({
          token: githubToken,
          fingerprint,
          fetchImpl,
        })
      ).items
    : [];

  let launchMarkers = [];
  if (linear.id) {
    const comments = await listLinearIssueComments({
      issueId: linear.id,
      apiKey: linearApiKey,
      fetchImpl,
    });
    if (comments.ok) {
      const marker = `${AUTOFIX_LAUNCH_MARKER}:${fingerprint}`;
      launchMarkers = comments.comments.filter(comment =>
        comment.body.includes(marker)
      );
    }
  }
  const withinWindow = createdAt => {
    const ms = Date.parse(String(createdAt ?? ''));
    return (
      !Number.isNaN(ms) &&
      now - ms >= 0 &&
      now - ms < GOLDEN_PATH_AUTOFIX_WINDOW_MS
    );
  };
  const recentLaunches = launchMarkers.filter(comment =>
    withinWindow(comment.createdAt)
  ).length;
  const recentAgentLaunches = ownedAgents.filter(agent => {
    const ms = agentCreatedAtMs(agent);
    return (
      ms !== null && now - ms >= 0 && now - ms < GOLDEN_PATH_AUTOFIX_WINDOW_MS
    );
  }).length;

  const plan = planAutofix({
    cursorApiKey,
    existingAgentIds: ownedAgentIds,
    openPrs,
    recentAttemptCount: recentLaunches + recentAgentLaunches,
    priorAttemptCount: launchMarkers.length,
    fingerprint,
    checks: receipt?.checks,
    origin: receipt?.origin,
    receipt,
  });

  if (plan.action === 'fail_closed') {
    return { ok: false, action: 'fail_closed', reason: plan.reason };
  }

  if (plan.action === 'escalate') {
    const comment = [
      `${AUTOFIX_ESCALATION_MARKER}:${fingerprint}`,
      '',
      `Summer signal: ${launchMarkers.length} Cursor autofix launch(es) for ${fingerprint} and the golden-path probe still fails.`,
      'No further Cursor agents will be launched for this fingerprint until the outstanding work is reconciled.',
    ].join('\n');
    if (linear.id) {
      const posted = await addLinearIssueComment({
        issueId: linear.id,
        body: comment,
        apiKey: linearApiKey,
        fetchImpl,
      });
      if (!posted.ok) {
        return {
          ok: false,
          action: 'escalate',
          stage: 'linear_comment',
          reason: posted.reason,
        };
      }
    }
    return {
      ok: true,
      action: 'escalate',
      reason: plan.reason,
      priorAttemptCount: launchMarkers.length,
      linearUrl: linear.url ?? null,
    };
  }

  if (plan.action === 'dedup') {
    const pr = /** @type {Record<string, unknown>|undefined} */ (plan.openPr);
    const prNumber =
      typeof pr?.number === 'number'
        ? pr.number
        : typeof pr?.number === 'string'
          ? Number.parseInt(pr.number, 10)
          : null;
    let prComment = null;
    if (prNumber && githubToken) {
      const posted = await commentOnPr({
        token: githubToken,
        prNumber,
        body: [
          `Golden-path probe still failing for \`${fingerprint}\` — deduped, no new Cursor agent was launched.`,
          `Canonical issue: ${linear.url ?? 'unavailable'}`,
        ].join('\n'),
        fetchImpl,
      });
      prComment = { ok: posted.ok, reason: posted.reason ?? null };
    }
    return {
      ok: true,
      action: 'dedup',
      reason: plan.reason,
      openPr:
        prNumber != null
          ? { number: prNumber, url: pr?.html_url ?? pr?.url ?? null }
          : null,
      existingAgentIds: plan.existingAgentIds ?? [],
      prComment,
      linearUrl: linear.url ?? null,
    };
  }

  const launched = await jsonRequest(fetchImpl, CURSOR_AGENTS_URL, {
    method: 'POST',
    headers: {
      Authorization: cursorAuthHeader(cursorApiKey),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(plan.request),
  });
  if (!launched.ok) {
    return {
      ok: false,
      action: 'launch',
      stage: 'cursor_launch',
      reason: `cursor_launch_${launched.status}`,
      body: launched.body,
    };
  }
  const agentId = launched.body?.id ?? null;
  if (linear.id) {
    await addLinearIssueComment({
      issueId: linear.id,
      body: `${AUTOFIX_LAUNCH_MARKER}:${fingerprint} agent=${agentId ?? 'unknown'}`,
      apiKey: linearApiKey,
      fetchImpl,
    });
  }
  return {
    ok: true,
    action: 'launch',
    agentId,
    linearUrl: linear.url ?? null,
  };
}

/**
 * An open Cursor PR already fixing this fingerprint (or any JOV-5085 lock break).
 * @param {unknown} prs @param {string} [fingerprint] @returns {number | null}
 */
export function findOpenAutofixPr(prs, fingerprint) {
  const list = Array.isArray(prs) ? prs : [];
  const needle = String(fingerprint ?? '');
  const branch = autofixBranchPrefix(needle);
  const hit = list.find(pr => {
    const head = String(pr?.headRefName ?? '');
    if (!head.startsWith('cursor/')) return false;
    const text = `${pr?.title ?? ''}\n${pr?.body ?? ''}`;
    return (
      head.startsWith(branch) ||
      (needle !== '' && text.includes(needle)) ||
      text.includes('JOV-5085')
    );
  });
  return typeof hit?.number === 'number' ? hit.number : null;
}
