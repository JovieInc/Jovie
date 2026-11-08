/**
 * Truthful certification (Tim, 2026-11-07: "we need a truthful system that
 * certifies it for real").
 *
 * The golden path is certified only when a stranger could walk it. A
 * stranger has no passage token, no canary identity, no synthetic header and
 * no pre-admitted account, so these checks use none of those either: a plain
 * browser user agent and nothing else. Every check names what a stranger
 * would actually see when it fails.
 *
 * Jank thresholds turn the browser run's layout-shift and long-frame
 * observations (apps/web/tests/e2e/utils/prod-cert-steps.ts) into checks, so
 * a surface that jumps or freezes is not certified either.
 */

/** A real desktop browser, no `+synthetic` marker: what a stranger sends. */
export const STRANGER_USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

export const WAITLIST_PATH = '/waitlist';

/** Paths a stranger can start an account from. */
const SIGNUP_ENTRY = /href="(\/(?:signup|start|claim)(?:[/?][^"]*)?)"/giu;

/**
 * Good-experience bounds (web.dev Core Web Vitals: CLS <= 0.1 is "good";
 * INP <= 200 ms is "good", so no single frame may block longer than that).
 */
export const JANK_LIMITS = Object.freeze({
  'jank.cls': { max: 0.1, what: 'cumulative layout shift' },
  'jank.worst-frame-ms': { max: 200, what: 'longest blocked frame (ms)' },
});

export async function strangerGet(origin, path, fetchImpl) {
  const response = await fetchImpl(new URL(path, origin), {
    redirect: 'follow',
    headers: { 'user-agent': STRANGER_USER_AGENT },
  });
  const body = await response.text();
  return { response, body };
}

/** Final path after redirects, or null when the transport does not say. */
export function finalPath(response) {
  if (!response?.url) return null;
  try {
    return new URL(response.url).pathname;
  } catch {
    return null;
  }
}

/**
 * Throws when a stranger requesting `path` cannot start an account there:
 * an error status, or a redirect onto the waitlist.
 */
export async function assertStrangerCanStart(origin, path, fetchImpl) {
  const page = await strangerGet(origin, path, fetchImpl);
  if (page.response.status !== 200)
    throw new Error(`stranger GET ${path}: HTTP ${page.response.status}`);
  const landed = finalPath(page.response);
  if (landed === WAITLIST_PATH) {
    throw new Error(
      `a stranger at ${path} lands on the waitlist (Request access), so nobody new can sign up`
    );
  }
  return { summary: `stranger ${path} -> ${landed ?? path}`, page };
}

/** Signup entry links a stranger can follow from an HTML page. */
export function signupEntries(html) {
  return [...new Set([...html.matchAll(SIGNUP_ENTRY)].map(m => m[1]))];
}

/** Paid-plan entry links (`plan=pro`) on the pricing page. */
export function paidEntries(html) {
  return signupEntries(html).filter(href => /[?&]plan=pro\b/u.test(href));
}

/**
 * @param {{ origin: string, fetchImpl: typeof fetch, run: (id: string, fn: () => Promise<any>) => Promise<any> }} deps
 */
export function strangerChecks({ origin, fetchImpl, run }) {
  const fresh = () => `stranger-${Date.now().toString(36)}`;
  return {
    landing: () => [
      run('stranger-homepage-signup-entry', async () => {
        const page = await strangerGet(origin, '/', fetchImpl);
        const entries = signupEntries(page.body);
        if (entries.length === 0) {
          throw new Error(
            'the homepage has no signup, claim or start link for a stranger (invite only)'
          );
        }
        await assertStrangerCanStart(origin, entries[0], fetchImpl);
        return { summary: `homepage entry ${entries[0]} is open` };
      }),
    ],
    signup: () =>
      run('signup-renders', async () => {
        const { summary } = await assertStrangerCanStart(
          origin,
          '/signup',
          fetchImpl
        );
        return { summary };
      }),
    start: () =>
      run('start-renders', async () => {
        const { summary } = await assertStrangerCanStart(
          origin,
          `/start?handle=${fresh()}`,
          fetchImpl
        );
        return { summary };
      }),
    checkout: () => [
      run('stranger-paid-cta-reaches-signup', async () => {
        const pricing = await strangerGet(origin, '/pricing', fetchImpl);
        const paid = paidEntries(pricing.body);
        if (paid.length === 0)
          throw new Error('/pricing has no paid-plan (plan=pro) link');
        await assertStrangerCanStart(origin, paid[0], fetchImpl);
        // The paid CTA's claim step hands the chosen handle to /start.
        const { summary } = await assertStrangerCanStart(
          origin,
          `/start?handle=${fresh()}&plan=pro`,
          fetchImpl
        );
        return { summary: `${paid[0]} then ${summary}` };
      }),
    ],
  };
}

/**
 * Turn jank observations into checks. Unknown contracts are ignored; a
 * missing measurement is not a pass, but it is also not a jank failure, so
 * nothing is emitted for it here.
 * @param {{ contractId: string, value: number, unit?: string }[]} observations
 */
export function jankChecks(observations = [], at = new Date().toISOString()) {
  const worst = new Map();
  for (const o of observations) {
    if (!JANK_LIMITS[o.contractId] || !Number.isFinite(o.value)) continue;
    worst.set(o.contractId, Math.max(worst.get(o.contractId) ?? 0, o.value));
  }
  return [...worst].map(([contractId, value]) => {
    const { max, what } = JANK_LIMITS[contractId];
    const shown = Math.round(value * 1000) / 1000;
    return {
      id: contractId,
      status: value > max ? 'failed' : 'passed',
      startedAt: at,
      endedAt: at,
      summary: `${what} ${shown} (limit ${max})`,
    };
  });
}
