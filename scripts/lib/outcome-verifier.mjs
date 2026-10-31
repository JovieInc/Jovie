// @ts-check
/**
 * Shared outcome-verifier contract: the one place every gate, canary,
 * certification step and agent skill decides "was this the RIGHT outcome",
 * not merely "did something happen".
 *
 * Why it exists: the production golden path certified `chat.first-reply` as
 * passed while the reply bubble said "You have reached your weekly AI message
 * limit" (JOV-9625, run 41165214531). The check asserted that a reply element
 * was visible. /api/chat serves its failure copy ("Jovie could not load your
 * artist context… try again", "Something went wrong. Please try again.") as an
 * HTTP 200 assistant message, so "a response came back" is never evidence of
 * success. Four drifting, hand-rolled error-phrase lists already existed
 * (prod-cert ERROR_TEXT, public-surface-helpers, smoke-test-utils, a spec-local
 * regex); this module replaces them as the single source of truth.
 *
 * The contract has three parts, and a check is only trustworthy with all three:
 *   1. An expected-outcome oracle: assert the semantic result (this artist's
 *      name, at least one real release, the word the probe asked for).
 *   2. A failure-surface detector: error, quota, unavailable, empty and
 *      placeholder content is failure even when the transport said 200.
 *   3. Negative controls: the check must reject every known-bad sample in
 *      NEGATIVE_CONTROLS (red before green). `acceptedNegativeControls(check)`
 *      returns the samples a check wrongly accepts; a gate's test asserts [].
 *
 * Plus a strict verdict fold: a run passes only when it has at least one check
 * and every check passed. `[].every(...)` is true; "no checks ran" is never
 * green, and an unknown, skipped or blocked status never folds into passed.
 *
 * Pure, dependency-free ESM so Node gate scripts, Playwright specs and Vitest
 * all import the same code.
 */

/** @typedef {'error' | 'quota' | 'unavailable' | 'empty' | 'placeholder'} FailureKind */
/** @typedef {{ kind: FailureKind, rule: string, excerpt: string }} FailureSurface */
/** @typedef {RegExp | ((text: string) => boolean)} OutcomeOracle */
/**
 * @typedef {object} VerifyOptions
 * @property {string} label What is being verified, used in failure reasons.
 * @property {OutcomeOracle} [expect] Semantic oracle the observed text must satisfy.
 * @property {string} [expectDescription] Human description of the oracle.
 * @property {number} [minChars] Minimum non-whitespace length (default 2).
 * @property {FailureKind[]} [allowKinds] Failure kinds this check deliberately
 *   expects (for example a negative-path test that wants the quota wall).
 */
/** @typedef {{ ok: boolean, label: string, reasons: string[], failure: FailureSurface | null }} OutcomeVerdict */

/**
 * Failure-surface rules, ordered most to least specific. Phrase-level on
 * purpose: a bare "error" or "failed" would turn legitimate replies ("no
 * errors on your profile") red. Every rule is pinned by a negative control and
 * a positive control in the test file, so a rule cannot be weakened silently.
 *
 * @type {ReadonlyArray<{ id: string, kind: FailureKind, pattern: RegExp }>}
 */
export const FAILURE_SURFACE_RULES = Object.freeze([
  // Quota and rate-limit walls render into the same reply element as a real
  // answer (the JOV-9625 false green).
  {
    id: 'quota.message-limit',
    kind: 'quota',
    pattern: /\b(?:weekly |daily |monthly )?(?:ai )?message limit\b/i,
  },
  {
    id: 'quota.out-of',
    kind: 'quota',
    pattern: /\bout of (?:messages|credits|requests|quota)\b/i,
  },
  {
    id: 'quota.limit-reached',
    kind: 'quota',
    pattern:
      /\b(?:usage |generation |chat |rate )?limit (?:reached|exceeded)\b|\breached your (?:\w+ ){0,3}limit\b/i,
  },
  {
    id: 'quota.paywall',
    kind: 'quota',
    pattern:
      /\brequires? (?:the |a )?\w+ plan\b|\bupgrade to (?:continue|unlock|keep)\b/i,
  },
  {
    id: 'quota.rate-limited',
    kind: 'quota',
    pattern:
      /\brate[- ]limited\b|\btoo many requests\b|\bquota (?:exceeded|reached)\b/i,
  },
  // Service unavailable / kill switch.
  {
    id: 'unavailable.temporarily',
    kind: 'unavailable',
    pattern:
      /\btemporarily unavailable\b|\bservice unavailable\b|\bunder maintenance\b/i,
  },
  {
    id: 'unavailable.paused',
    kind: 'unavailable',
    pattern:
      /\b(?:chat|jovie|service|it) is (?:currently )?paused\b|\bpaused while we\b/i,
  },
  // Generic error copy, including 200-with-error-body assistant messages.
  {
    id: 'error.went-wrong',
    kind: 'error',
    pattern: /\bsomething went wrong\b/i,
  },
  {
    id: 'error.framework',
    kind: 'error',
    pattern:
      /\bapplication error\b|\binternal server error\b|\bunhandled runtime error\b|\bserver-side exception\b|\bthis page could not be found\b/i,
  },
  {
    id: 'error.occurred',
    kind: 'error',
    pattern:
      /\ban? (?:unexpected |unknown )?error (?:has )?occurred\b|\bunexpected error\b/i,
  },
  {
    id: 'error.could-not',
    kind: 'error',
    pattern:
      /\b(?:could ?n[o']t|couldn’t|unable to|failed to|cannot|can['’]t) (?:\w+ ){0,2}?(?:load|start|save|verify|generate|process|complete|continue|connect|reach|fetch|record|find|create|send|retrieve|restore|access|authenticate|be (?:saved|verified|loaded|found|restored|completed|processed))\b/i,
  },
  {
    id: 'error.failed',
    kind: 'error',
    pattern:
      /\b(?:request|chat|challenge|operation|generation|upload|sync|import|lookup|check) failed\b|\bfailed\.?\s*$/i,
  },
  {
    id: 'error.auth',
    kind: 'error',
    pattern:
      /^\s*(?:unauthori[sz]ed|forbidden|access denied)\b|\bor unauthori[sz]ed\b|\b(?:admin )?role required\b|\bsign in (?:is )?required\b/i,
  },
  {
    id: 'error.invalid-request',
    kind: 'error',
    pattern:
      /^\s*(?:missing|invalid) [a-z]|\b(?:id|profileId|clientTurnId|field|parameter) (?:is )?required\b/i,
  },
  {
    id: 'error.reload',
    kind: 'error',
    pattern: /\breload to continue\b|\brefresh (?:the page )?to continue\b/i,
  },
  {
    id: 'unavailable.not-configured',
    kind: 'unavailable',
    pattern: /\b(?:is|are) not configured\b|^\s*client disconnected\b/i,
  },
  {
    id: 'error.try-again',
    kind: 'error',
    pattern:
      /\bplease (?:refresh (?:and|or) )?try again\b|\btry again (?:later|in a (?:few|moment|minute))\b/i,
  },
  {
    id: 'error.http-status',
    kind: 'error',
    pattern:
      /^\s*(?:4\d\d|5\d\d)\b|\b(?:HTTP|status(?: code)?) (?:4\d\d|5\d\d)\b|\b(?:404|500|502|503|504) (?:error|not found|bad gateway|service unavailable|gateway timeout)\b/i,
  },
  {
    id: 'error.not-found',
    kind: 'error',
    pattern:
      /\b(?:page|profile|release|user|artist|resource|conversation) not found\b|\bnot found\.?\s*$/i,
  },
  // Placeholder, template and serialization leaks.
  {
    id: 'placeholder.serialization',
    kind: 'placeholder',
    pattern: /\[object Object\]|^\s*(?:undefined|null|NaN|true|false)\s*$/,
  },
  {
    id: 'placeholder.template',
    kind: 'placeholder',
    pattern:
      /\{\{[^}]*\}\}|\$\{[^}]*\}|\blorem ipsum\b|\bTODO\b|\bTBD\b|\bplaceholder\b/i,
  },
  {
    id: 'placeholder.pending',
    kind: 'placeholder',
    pattern:
      /\bstill in progress\b|\bstill (?:loading|processing|generating)\b/i,
  },
  {
    id: 'placeholder.loading',
    kind: 'placeholder',
    pattern: /^\s*(?:loading|thinking|please wait)(?:\.{3}|…)?\s*$/i,
  },
  // Empty states presented as content.
  {
    id: 'empty.no-results',
    kind: 'empty',
    pattern:
      /^\s*(?:no (?:results|releases|data|items|content|messages|[a-z]+ links)(?: (?:found|yet|available))?|nothing (?:here|to show)(?: yet)?)\b(?:[.!]|\s+on your|\s*$)/i,
  },
]);

const DEFAULT_MIN_CHARS = 2;

/**
 * @param {string} text
 * @param {RegExpExecArray} match
 */
function excerptAround(text, match) {
  const start = Math.max(0, match.index - 40);
  return text.slice(start, match.index + match[0].length + 40).trim();
}

/**
 * Find the first failure surface (error, quota, unavailable, placeholder or
 * empty-state content) in observed text. Null when none matched. Missing or
 * whitespace-only text is itself the `empty` failure.
 *
 * @param {string | null | undefined} text
 * @returns {FailureSurface | null}
 */
export function detectFailureSurface(text) {
  const value = typeof text === 'string' ? text : '';
  if (value.trim().length === 0) {
    return { kind: 'empty', rule: 'empty.blank', excerpt: '' };
  }
  for (const rule of FAILURE_SURFACE_RULES) {
    const match = rule.pattern.exec(value);
    if (match) {
      return {
        kind: rule.kind,
        rule: rule.id,
        excerpt: excerptAround(value, match),
      };
    }
  }
  return null;
}

/**
 * @param {OutcomeOracle} oracle
 * @param {string} text
 */
function oracleHolds(oracle, text) {
  if (oracle instanceof RegExp) {
    oracle.lastIndex = 0;
    return oracle.test(text);
  }
  return oracle(text) === true;
}

/**
 * Verify an observed outcome against the full contract: non-trivial content,
 * no failure surface, and (when given) the semantic oracle.
 *
 * @param {string | null | undefined} observed
 * @param {VerifyOptions} options
 * @returns {OutcomeVerdict}
 */
export function verifyOutcome(observed, options) {
  const { label, minChars = DEFAULT_MIN_CHARS, allowKinds = [] } = options;
  const text = typeof observed === 'string' ? observed : '';
  /** @type {string[]} */
  const reasons = [];
  const trimmed = text.replace(/\s+/g, ' ').trim();

  let failure = detectFailureSurface(text);
  if (failure && allowKinds.includes(failure.kind)) failure = null;
  if (failure) {
    reasons.push(
      `${label}: observed a ${failure.kind} surface (${failure.rule}), not the expected outcome: "${failure.excerpt.slice(0, 160)}"`
    );
  } else if (trimmed.length < minChars) {
    reasons.push(
      `${label}: observed ${trimmed.length} characters, need at least ${minChars}`
    );
  }
  if (options.expect && !oracleHolds(options.expect, text)) {
    const want = options.expectDescription ?? String(options.expect);
    reasons.push(
      `${label}: expected outcome not observed (${want}); got "${trimmed.slice(0, 160)}"`
    );
  }
  return { ok: reasons.length === 0, label, reasons, failure };
}

/**
 * Throwing form for Playwright steps and gate scripts. The error message
 * carries every reason so the receipt summary names the real failure.
 *
 * @param {string | null | undefined} observed
 * @param {VerifyOptions} options
 * @returns {string} the observed text, trimmed, for receipt summaries
 */
export function assertOutcome(observed, options) {
  const verdict = verifyOutcome(observed, options);
  if (!verdict.ok) throw new Error(verdict.reasons.join('; '));
  return (observed ?? '').trim();
}

/**
 * Strict verdict fold. `passed` requires at least one check and every check
 * exactly `passed`. Any `failed` is failed; anything else (blocked, skipped,
 * pending, unknown, missing status, no checks at all) is blocked, never green.
 *
 * @param {ReadonlyArray<string | null | undefined>} statuses
 * @returns {'passed' | 'failed' | 'blocked'}
 */
export function foldVerdict(statuses) {
  if (statuses.some(status => status === 'failed')) return 'failed';
  if (statuses.length === 0) return 'blocked';
  return statuses.every(status => status === 'passed') ? 'passed' : 'blocked';
}

/**
 * Known-bad observations every content check must reject. Each one is real
 * copy a Jovie surface has served (most with HTTP 200), or a canonical
 * empty/placeholder leak. Add to this list whenever a false green is found;
 * never delete from it.
 *
 * @type {ReadonlyArray<{ id: string, text: string, source: string }>}
 */
export const NEGATIVE_CONTROLS = Object.freeze([
  {
    id: 'jov-9625-quota-wall',
    text: 'You have reached your weekly AI message limit. Upgrade to Pro for 70 messages per week.',
    source: 'lib/rate-limit/limiters.ts; run 41165214531 false green',
  },
  {
    id: 'quota-alert-title',
    text: "You're out of messages for this week",
    source: 'components/jovie/components/ChatUsageAlert.tsx',
  },
  {
    id: 'chat-artist-context',
    text: 'Jovie could not load your artist context for this request. Please refresh and try again.',
    source: 'app/api/chat/route.ts (HTTP 200 stream)',
  },
  {
    id: 'chat-deterministic-fail',
    text: 'Something went wrong. Please try again.',
    source: 'app/api/chat/route.ts (HTTP 200 stream)',
  },
  {
    id: 'chat-kill-switch',
    text: 'Jovie chat is paused while we address an upstream issue. Please try again in a few minutes.',
    source: 'app/api/chat/route.ts',
  },
  {
    id: 'chat-start-failed',
    text: "We couldn't start your chat",
    source: 'onboarding /start error state',
  },
  {
    id: 'onboarding-save-failed',
    text: 'Your conversation could not be saved. Try again.',
    source: 'app/api/chat/onboarding-handler.ts',
  },
  {
    id: 'album-art-limit',
    text: 'Album art generation limit reached. Please try again later.',
    source: 'app/api/chat/route.ts',
  },
  {
    id: 'next-app-error',
    text: 'Application error: a client-side exception has occurred (see the browser console for more information).',
    source: 'Next.js error overlay',
  },
  {
    id: 'next-not-found',
    text: '404 This page could not be found.',
    source: 'Next.js not-found page',
  },
  {
    id: 'gateway-502',
    text: '502 Bad Gateway',
    source: 'edge/proxy error body',
  },
  {
    id: 'json-error-200',
    text: '{"error":"Internal Server Error","status":500}',
    source: '200-with-error-body JSON',
  },
  { id: 'blank', text: '   ', source: 'empty reply bubble' },
  {
    id: 'loading-stuck',
    text: 'Loading...',
    source: 'spinner text captured as content',
  },
  { id: 'object-leak', text: '[object Object]', source: 'serialization leak' },
  { id: 'undefined-leak', text: 'undefined', source: 'serialization leak' },
  {
    id: 'template-leak',
    text: 'Welcome back, {{artistName}}!',
    source: 'unrendered template',
  },
  {
    id: 'empty-releases',
    text: 'No releases found.',
    source: 'empty catalog state',
  },
  {
    id: 'went-wrong-bare',
    text: 'Something went wrong',
    source: 'error boundary copy without a retry hint',
  },
  {
    id: 'paused-bare',
    text: 'Jovie is paused for maintenance',
    source: 'kill-switch copy without a retry hint',
  },
  {
    id: 'paywall-reply',
    text: 'Album art generation requires the Pro plan.',
    source: 'app/api/chat/route.ts (entitlement wall)',
  },
  {
    id: 'rate-limited',
    text: 'You are being rate limited.',
    source: 'provider/edge rate limit body',
  },
  {
    id: 'bare-try-again',
    text: 'Hmm, that did not work. Please try again.',
    source: 'generic assistant apology',
  },
  {
    id: 'profile-not-found',
    text: 'Profile not found.',
    source: 'public profile lookup miss',
  },
]);

/**
 * Real successful observations every content check must accept, so the
 * detector cannot be made "safe" by rejecting everything.
 *
 * @type {ReadonlyArray<{ id: string, text: string }>}
 */
export const POSITIVE_CONTROLS = Object.freeze([
  { id: 'probe-ok', text: 'ok' },
  {
    id: 'probe-ok-sentence',
    text: 'OK! What would you like to work on today?',
  },
  {
    id: 'confirm-artist',
    text: 'Is this you? UNMARKED — I found 12 releases on Spotify, including "Night Drive".',
  },
  {
    id: 'get-artist',
    text: "Let's set up your artist profile. Paste your Spotify artist link and I'll pull in your releases.",
  },
  {
    id: 'no-errors-good-news',
    text: 'Good news: your profile has no errors and every release link resolves.',
  },
  {
    id: 'no-problem',
    text: 'No problem. I can help you plan your next release.',
  },
  {
    id: 'limit-word-legit',
    text: 'There is no limit to how many links you can add to your profile.',
  },
]);

/**
 * Red-before-green helper: run a check against every negative control and
 * return the ones it wrongly ACCEPTS. A trustworthy check returns []. The
 * check receives the observed text and returns true when it would pass.
 *
 * @param {(text: string) => boolean} check
 * @returns {string[]} ids of negative controls the check accepted
 */
export function acceptedNegativeControls(check) {
  return NEGATIVE_CONTROLS.filter(sample => {
    try {
      return check(sample.text) === true;
    } catch {
      return false;
    }
  }).map(sample => sample.id);
}
