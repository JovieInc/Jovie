import type { Frame, Page, Request, Response } from '@playwright/test';

type CapturedResponse = { readonly status: number; readonly body: string };
type NavigationPhase = 'start' | 'goto-complete' | 'presence-url-ready';
type CaptureEvent = {
  readonly atMs: number;
  readonly event: string;
  readonly request?: number;
  readonly path?: '/api/suggestions';
  readonly method?: string;
  readonly status?: number;
  readonly code?: string;
};

const METHODS = new Set([
  'GET',
  'POST',
  'PUT',
  'PATCH',
  'DELETE',
  'HEAD',
  'OPTIONS',
]);
const FAILURE_CODES = new Set([
  'net::ERR_ABORTED',
  'net::ERR_FAILED',
  'net::ERR_TIMED_OUT',
  'net::ERR_CONNECTION_CLOSED',
  'net::ERR_CONNECTION_RESET',
  'net::ERR_CONNECTION_REFUSED',
  'net::ERR_NAME_NOT_RESOLVED',
  'net::ERR_NETWORK_CHANGED',
  'net::ERR_INTERNET_DISCONNECTED',
]);

function isSuggestions(url: string) {
  try {
    return new URL(url).pathname === '/api/suggestions';
  } catch {
    return false;
  }
}

/** Observe the real response; never intercept, retry, or change its verdict. */
export async function captureFirstSuggestionsResponse(page: Page) {
  const started = performance.now();
  const events: CaptureEvent[] = [];
  const requests = new WeakMap<Request, number>();
  let nextRequest = 0;
  let droppedEvents = 0;
  let settled = false;
  let disposed = false;
  let end: {
    atMs: number;
    reason: 'success' | 'deadline' | 'disposed';
  } | null = null;
  const elapsed = () => Math.round(performance.now() - started);
  const record = (
    event: string,
    details: Omit<CaptureEvent, 'atMs' | 'event'> = {}
  ) => {
    if (disposed) return;
    if (events.length < 64) events.push({ atMs: elapsed(), event, ...details });
    else droppedEvents += 1;
  };
  const requestDetails = (request: Request) => {
    let id = requests.get(request);
    if (id === undefined) {
      id = ++nextRequest;
      requests.set(request, id);
    }
    const method = request.method();
    return {
      request: id,
      path: '/api/suggestions' as const,
      method: METHODS.has(method) ? method : 'OTHER',
    };
  };
  const onRequest = (request: Request) => {
    if (isSuggestions(request.url()))
      record('request', requestDetails(request));
  };
  const onFinished = (request: Request) => {
    if (isSuggestions(request.url()))
      record('request-finished', requestDetails(request));
  };
  const onFailed = (request: Request) => {
    if (!isSuggestions(request.url())) return;
    const error = request.failure()?.errorText ?? '';
    record('request-failed', {
      ...requestDetails(request),
      code: FAILURE_CODES.has(error) ? error : 'OTHER',
    });
  };
  const onNavigation = (frame: Frame) => {
    if (frame === page.mainFrame()) record('document-navigation');
  };
  const onDomContentLoaded = () => record('dom-content-loaded');
  const onLoad = () => record('load');
  let resolveCapture: (value: CapturedResponse) => void = () => {};
  // Keep the wrapper: awaiting registration must not await the later response.
  const captured = new Promise<CapturedResponse>(resolve => {
    resolveCapture = resolve;
  });
  let lastError: CapturedResponse | null = null;
  const giveUp = setTimeout(() => {
    if (settled) return;
    settled = true;
    end = { atMs: elapsed(), reason: 'deadline' };
    resolveCapture(lastError ?? { status: 0, body: '' });
  }, 30_000);
  const onResponse = (response: Response) => {
    if (!isSuggestions(response.url())) return;
    const details = {
      ...requestDetails(response.request()),
      status: response.status(),
    };
    record('response', details);
    if (settled) return;
    record('body-read-start', details);
    void response
      .text()
      .then(body => {
        record('body-read-complete', details);
        if (settled) return;
        // Preserve existing selection: retain non-200 responses until a 200 or deadline.
        if (response.status() !== 200) {
          lastError = { status: response.status(), body };
          return;
        }
        settled = true;
        clearTimeout(giveUp);
        end = { atMs: elapsed(), reason: 'success' };
        resolveCapture({ status: response.status(), body });
      })
      .catch((error: unknown) => {
        const message = error instanceof Error ? error.message : '';
        record('body-read-failed', {
          ...details,
          code: message.includes('Network.getResponseBody')
            ? 'RESPONSE_BODY_UNAVAILABLE'
            : 'BODY_READ_FAILED',
        });
        // Preserve the existing wait after a body read fails; diagnostics do not retry.
      });
  };
  page.on('request', onRequest);
  page.on('requestfinished', onFinished);
  page.on('requestfailed', onFailed);
  page.on('response', onResponse);
  page.on('framenavigated', onNavigation);
  page.on('domcontentloaded', onDomContentLoaded);
  page.on('load', onLoad);
  record('capture-start');

  return {
    captured,
    markNavigation: (phase: NavigationPhase) => record(`navigation-${phase}`),
    failureMessage: () =>
      `[presence-suggestions-capture] ${JSON.stringify({
        elapsedMs: elapsed(),
        end,
        droppedEvents,
        events,
      })}`,
    dispose: () => {
      if (disposed) return;
      end ??= { atMs: elapsed(), reason: 'disposed' };
      disposed = true;
      settled = true;
      clearTimeout(giveUp);
      page.off('request', onRequest);
      page.off('requestfinished', onFinished);
      page.off('requestfailed', onFailed);
      page.off('response', onResponse);
      page.off('framenavigated', onNavigation);
      page.off('domcontentloaded', onDomContentLoaded);
      page.off('load', onLoad);
    },
  };
}
