/**
 * Shared degraded-response tolerance for the app-shell screen-cert
 * producers (tasks, contacts). Both mount the full authenticated shell,
 * which polls a couple of unrelated chrome widgets that have no noop-DB
 * fallback of their own and are not gated by either producer's
 * reserved-profile fixture:
 * - /api/analytics/navigation: a 503 is this app's own "service
 *   unavailable" convention for a degraded analytics beacon.
 * - /api/chat/conversations: the assistant panel's conversation list
 *   genuinely 500s (an uncaught exception, not a controlled response).
 * Plus a later, background re-request of the proof route itself (React
 * Query revalidation / the sidebar's hover-prefetch touching the same
 * query key), which can also 500 or get cancelled. This is safe to
 * tolerate by path+status alone, with no marker to distinguish it from the
 * initial navigation: each spec's `page.goto(enterUrl, ...)` call already
 * asserts `response?.status() === 200` for that initial navigation before
 * this tolerance ever runs, so a same-path failure collected afterward can
 * only be a later request, never the one already verified to succeed.
 *
 * Scoped to exactly these paths and statuses, not a blanket allowance, so
 * a real failure from either producer's own fixtured endpoint
 * (getTasks/getTask, GET /api/dashboard/contacts) still fails its proof.
 */
const EXPECTED_DEGRADED_RESPONSES = new Map<string, number>([
  ['/api/analytics/navigation', 503],
  ['/api/chat/conversations', 500],
]);

export function createAppShellDegradedTolerance(proofRoute: string) {
  const expectedAbortedPaths = new Set([
    proofRoute,
    ...EXPECTED_DEGRADED_RESPONSES.keys(),
  ]);

  function isExpectedDegradedResponse(entry: string): boolean {
    const match = /^(\d{3}) (\S+)$/.exec(entry);
    if (!match) return false;
    const status = Number(match[1]);
    try {
      const { pathname } = new URL(match[2]);
      if (pathname === proofRoute) return status === 500;
      return EXPECTED_DEGRADED_RESPONSES.get(pathname) === status;
    } catch {
      return false;
    }
  }

  // Chrome mirrors each failed fetch/XHR as a console error with no URL, so
  // this can't be path-scoped the same way — the network-level check above
  // is the authoritative one; this is a strict subset that can't admit
  // anything the network-level check would not have already admitted,
  // since both assertions must pass for the proof to pass.
  function isExpectedDegradedConsoleError(entry: string): boolean {
    return /the server responded with a status of (500|503)\b/.test(entry);
  }

  // formatRequestFailure (aborted-image-request.ts) joins as "<url> <error
  // text>"; parse the leading URL out rather than assuming a fixed suffix
  // shape.
  function isExpectedDegradedRequestFailure(entry: string): boolean {
    if (!entry.endsWith(' net::ERR_ABORTED')) return false;
    const urlText = entry.slice(0, entry.length - ' net::ERR_ABORTED'.length);
    try {
      return expectedAbortedPaths.has(new URL(urlText).pathname);
    } catch {
      return false;
    }
  }

  return {
    isExpectedDegradedResponse,
    isExpectedDegradedConsoleError,
    isExpectedDegradedRequestFailure,
  };
}
