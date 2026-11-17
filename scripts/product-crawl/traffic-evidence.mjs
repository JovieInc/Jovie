// Extend the crawl's native Playwright request events. Interception admission,
// browser events and wire traffic are different planes; never total them as a bill.
export const CRAWL_UA = 'Jovie-SyntheticMonitoring/1.0 ProductCrawl/1.0';
export const markedUserAgent = ua =>
  ua.includes(CRAWL_UA) ? ua : `${ua} ${CRAWL_UA}`;
const ASSETS = new Set([
  'stylesheet',
  'script',
  'image',
  'font',
  'media',
  'manifest',
  'texttrack',
]);
const value = (request, key) =>
  typeof request[key] === 'function' ? request[key]() : request[key];
const counters = () => ({
  attempted: 0,
  pages: 0,
  assets: 0,
  other: 0,
  redirects: 0,
  failures: 0,
  inFlight: 0,
  responseBodyBytes: 0,
  responseHeaderBytes: 0,
  requestsWithSizes: 0,
  requestsWithoutSizes: 0,
  serviceWorkerResponses: 0,
  serviceWorkerResponseBodyBytes: 0,
});

/** Only proven page hops/direct requests receive custom metadata. Foreign
 * requests continue with their original browser headers and CORS behavior. */
export function firstPartyMetadata(url, origin, headers, metadata = {}) {
  if (new URL(url).origin !== new URL(origin).origin) return headers;
  const out = { ...headers, 'x-synthetic-monitoring': 'product-crawl' };
  for (const name of ['run', 'deployment', 'invocation']) {
    const entry = String(metadata[name] ?? '');
    if (/^[A-Za-z0-9_.:/-]{1,128}$/u.test(entry))
      out[`x-jovie-crawl-${name}`] = entry;
  }
  return out;
}

/** A per-invocation admission seam, not a whole-browser network controller.
 * Pacing belongs before context/page measurement, never on individual assets.
 * Browser Request objects and explicit fetch descriptors use the same observer.
 * @param {{ origin: string, maxInterceptedRequests?: number, pageIntervalMs?: number,
 * deadlineEpochMs?: number, now?: () => number, sleep?: (ms:number)=>Promise<any> }} opts
 */
export function createTrafficEvidence({
  origin,
  maxInterceptedRequests = 20_000,
  pageIntervalMs = 1000,
  deadlineEpochMs = Infinity,
  now = Date.now,
  sleep = ms => new Promise(resolve => setTimeout(resolve, ms)),
}) {
  if (
    !Number.isSafeInteger(maxInterceptedRequests) ||
    maxInterceptedRequests < 1 ||
    !Number.isFinite(pageIntervalMs) ||
    pageIntervalMs < 0 ||
    pageIntervalMs > 60_000
  )
    throw new Error('invalid crawl admission ceiling or page interval');
  const ownOrigin = new URL(origin).origin;
  const observed = counters();
  const owners = {
    frameOrDedicatedWorker: counters(),
    serviceWorker: counters(),
    directFetch: counters(),
  };
  const parties = { firstParty: counters(), thirdParty: counters() };
  const admission = {
    admitted: 0,
    blocked: 0,
    visitsAdmitted: 0,
    visitsNotStarted: 0,
    explicitRetries: 0,
  };
  const states = new WeakMap();
  const reservations = new WeakMap();
  const pending = new Set();
  const errors = new Set();
  let sawServiceWorker = false;
  let nextStart = -Infinity;
  let tail = Promise.resolve();
  const seen = (request, direct = false) => {
    let state = states.get(request);
    if (state) return state;
    let owner = 'frameOrDedicatedWorker';
    try {
      if (request.serviceWorker?.()) owner = 'serviceWorker';
    } catch {
      errors.add('request owner unavailable');
    }
    if (direct) owner = 'directFetch';
    const party =
      new URL(value(request, 'url')).origin === ownOrigin
        ? 'firstParty'
        : 'thirdParty';
    state = {
      owner,
      party,
      failed: false,
      terminal: false,
      response: false,
      fromWorker: false,
    };
    states.set(request, state);
    const type = value(request, 'resourceType');
    const key =
      type === 'document' ? 'pages' : ASSETS.has(type) ? 'assets' : 'other';
    for (const bucket of [observed, owners[owner], parties[party]]) {
      bucket.attempted++;
      bucket[key]++;
      bucket.inFlight++;
      bucket.requestsWithoutSizes++;
    }
    return state;
  };
  const add = (state, key, n = 1) => {
    for (const bucket of [observed, owners[state.owner], parties[state.party]])
      bucket[key] += n;
  };
  const terminal = state => {
    if (!state.terminal) {
      state.terminal = true;
      add(state, 'inFlight', -1);
    }
  };
  const failed = request => {
    const state = seen(request);
    if (!state.failed) {
      state.failed = true;
      add(state, 'failures');
    }
    terminal(state);
  };
  const response = (request, status, fromWorker = false) => {
    const state = seen(request);
    if (state.response) return;
    state.response = true;
    state.fromWorker = fromWorker;
    if (fromWorker) add(state, 'serviceWorkerResponses');
    if ([301, 302, 303, 307, 308].includes(status)) add(state, 'redirects');
    if (status >= 400 && !state.failed) {
      state.failed = true;
      add(state, 'failures');
    }
  };
  const finished = async request => {
    const state = seen(request);
    if (state.terminal) return;
    terminal(state);
    try {
      const sizes = await request.sizes();
      if (
        ![sizes.responseBodySize, sizes.responseHeadersSize].every(
          n => Number.isFinite(n) && n >= 0
        )
      )
        return;
      add(state, 'responseBodyBytes', sizes.responseBodySize);
      add(state, 'responseHeaderBytes', sizes.responseHeadersSize);
      if (state.fromWorker)
        add(state, 'serviceWorkerResponseBodyBytes', sizes.responseBodySize);
      add(state, 'requestsWithSizes');
      add(state, 'requestsWithoutSizes', -1);
    } catch {
      /* A missing size is unknown, including direct Fetch transport. */
    }
  };
  const track = promise => {
    pending.add(promise);
    void promise.finally(() => pending.delete(promise));
  };
  const exhausted = () =>
    admission.admitted >= maxInterceptedRequests ||
    observed.attempted >= maxInterceptedRequests;
  const admit = (request, { direct = false } = {}) => {
    // CDP admission and Playwright observation refer to the same page request.
    if (direct) seen(request, true);
    if (reservations.has(request)) return reservations.get(request);
    const reason =
      now() >= deadlineEpochMs
        ? 'deadline'
        : admission.admitted >= maxInterceptedRequests
          ? 'intercepted-request-budget'
          : null;
    const result = { allowed: reason === null, reason };
    admission[reason ? 'blocked' : 'admitted']++;
    reservations.set(request, result);
    return result;
  };
  return {
    admit,
    failed,
    response,
    finished,
    exhausted,
    retry: () => {
      admission.explicitRetries++;
    },
    instrumentationError: reason => errors.add(reason),
    observe(context) {
      context.on('request', request => seen(request));
      context.on('response', r =>
        response(r.request(), r.status(), r.fromServiceWorker())
      );
      context.on('requestfailed', failed);
      context.on('requestfinished', request => track(finished(request)));
      // Registration is normal product behavior. Never close/disable its context.
      context.on('serviceworker', () => {
        sawServiceWorker = true;
      });
    },
    pace() {
      const slot = tail.then(async () => {
        const at = Math.max(now(), nextStart);
        const reason =
          at >= deadlineEpochMs
            ? 'deadline'
            : exhausted()
              ? 'intercepted-request-budget'
              : null;
        if (reason) {
          admission.visitsNotStarted++;
          return { allowed: false, reason };
        }
        const wait = at - now();
        if (wait > 0) await sleep(wait);
        if (now() >= deadlineEpochMs) {
          admission.visitsNotStarted++;
          return { allowed: false, reason: 'deadline' };
        }
        if (exhausted()) {
          admission.visitsNotStarted++;
          return { allowed: false, reason: 'intercepted-request-budget' };
        }
        nextStart = now() + pageIntervalMs;
        admission.visitsAdmitted++;
        return { allowed: true, reason: null };
      });
      tail = slot.then(() => undefined);
      return slot;
    },
    async settle() {
      await Promise.all([...pending]);
    },
    snapshot() {
      return {
        schema: 'product-crawl-traffic/v1',
        scope:
          'Playwright request events and explicit crawl fetches; includes logical SW deliveries',
        observed: { ...observed },
        owners: structuredClone(owners),
        parties: structuredClone(parties),
        admission: {
          ...admission,
          maxInterceptedRequests,
          pageIntervalMs,
          scope:
            'page-owned CDP network hops and explicit crawl fetches only; other observed requests stop subsequent visits, with possible in-flight overshoot',
        },
        accounting: {
          complete: false,
          absoluteAllNetworkCapEnforced: false,
          browserProcessRequests: {
            attempted: null,
            bytes: null,
            automaticServiceWorkerUpdatesPossible: sawServiceWorker,
          },
          browserInternalRetries: null,
          instrumentationErrors: [...errors],
          bytesDefinition:
            'available Playwright per-request response sizes; SW logical delivery can duplicate network bytes; not a wire total',
        },
        metadataScope:
          'first-party page network hops and explicit crawl fetches only; worker/browser-process run metadata unavailable',
        cost: { estimatedUsd: null, billedUsd: null },
      };
    },
  };
}

/** Sum known observation planes while preserving all unknown planes as unknown. */
export function mergeTrafficEvidence(receipts) {
  const ledgers = receipts.map(r => r.traffic).filter(Boolean);
  const sum = xs => {
    const keys = new Set(xs.flatMap(x => Object.keys(x ?? {})));
    return Object.fromEntries(
      [...keys]
        .filter(k => xs.some(x => typeof x?.[k] === 'number'))
        .map(k => [
          k,
          xs.reduce((n, x) => n + (typeof x?.[k] === 'number' ? x[k] : 0), 0),
        ])
    );
  };
  return {
    schema: 'product-crawl-traffic/v1',
    scope: ledgers[0]?.scope,
    observed: sum(ledgers.map(l => l.observed)),
    owners: Object.fromEntries(
      ['frameOrDedicatedWorker', 'serviceWorker', 'directFetch'].map(k => [
        k,
        sum(ledgers.map(l => l.owners?.[k])),
      ])
    ),
    parties: Object.fromEntries(
      ['firstParty', 'thirdParty'].map(k => [
        k,
        sum(ledgers.map(l => l.parties?.[k])),
      ])
    ),
    admission: {
      ...sum(ledgers.map(l => l.admission)),
      pageIntervalMs: Math.max(
        0,
        ...ledgers.map(l => l.admission.pageIntervalMs)
      ),
      scope: ledgers[0]?.admission?.scope,
    },
    accounting: {
      ...ledgers[0]?.accounting,
      complete: false,
      absoluteAllNetworkCapEnforced: false,
      browserProcessRequests: {
        attempted: null,
        bytes: null,
        automaticServiceWorkerUpdatesPossible: ledgers.some(
          l =>
            l.accounting?.browserProcessRequests
              ?.automaticServiceWorkerUpdatesPossible
        ),
      },
      instrumentationErrors: [
        ...new Set(
          ledgers.flatMap(l => l.accounting?.instrumentationErrors ?? [])
        ),
      ],
      missingShardLedgers: receipts.length - ledgers.length,
    },
    cost: { estimatedUsd: null, billedUsd: null },
  };
}
