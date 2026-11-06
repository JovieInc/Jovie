'use strict';

// JOV-7973: public-surface verification for the protected-origin probe.
// Hosted in its own module so the closed/invite-entry reconciliation
// (canon/PRODUCT.md, 2026-11-02) can grow without growing the
// size-baselined probe script. This module owns no credentials and no
// state: every platform primitive arrives via the injected `deps` object.

// Anonymous /start and /signup intentionally redirect to the role form
// while public signup is closed. This is one explicit 307 transition,
// not permission for bootstrap, health, or other surface redirects.
const CLOSED_ENTRY_SURFACES = new Set(['/signup', '/start']);
const CLOSED_ENTRY_REDIRECT_TARGET = '/waitlist';
const WAITLIST_ROLE_FORM_PATTERN =
  /<form\b[^>]*\bdata-testid=["']waitlist-role-form["']/i;
const HTML_COMMENT_BLOCK = /<!--[\s\S]*?(?:-->|$)/g;

// Final-URL identity only: the follow request must land on the exact URL it
// asked for. Full response checks (status, redirect discipline) stay with
// the caller's assertExactProbeResponse.
function assertExactResponseUrl(response, requestedUrl, deps) {
  const expected = deps.parseProbeUrl(requestedUrl);
  if (typeof response.url !== 'string' || response.url.length === 0) {
    throw new Error(
      'Protected probe response did not preserve its request URL.'
    );
  }
  const finalUrl = deps.parseProbeUrl(response.url, 'Probe response URL');
  if (
    finalUrl.origin !== expected.origin ||
    finalUrl.pathname !== expected.pathname ||
    finalUrl.search !== expected.search
  ) {
    throw new Error(
      `Protected probe resolved outside the requested route ${deps.safeRouteLabel(expected)}.`
    );
  }
  return expected;
}

async function verifyPublicSurfaceOnce(
  surface,
  targetUrl,
  cookieHeader,
  fetchImpl,
  deadline,
  cacheBust,
  injectedDeps
) {
  const {
    buildOriginBoundCookieRequest,
    fetchWithinDeadline,
    discardResponseBody,
    readResponseText,
    assertExactProbeResponse,
    parseProbeUrl,
    publicErrorContent,
    stripInlineScriptContent,
    assertLiveReleaseDocument,
  } = injectedDeps;

  const url = new URL(surface.path, targetUrl.origin);
  url.searchParams.set('_cb', cacheBust);
  const request = buildOriginBoundCookieRequest(url, {
    cookieHeader,
    headers: {
      Accept: surface.json ? 'application/json' : 'text/html',
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      Pragma: 'no-cache',
      'User-Agent': 'Mozilla/5.0 (compatible; JovieCI/1.0; +https://jov.ie)',
    },
  });
  let response = await fetchWithinDeadline(
    deadline,
    fetchImpl,
    request.url,
    request.options
  );
  let responseUrl = request.url;
  let closedSignupRedirect = false;
  assertExactResponseUrl(response, responseUrl, injectedDeps);
  if (
    CLOSED_ENTRY_SURFACES.has(surface.path) &&
    response.status === 307 &&
    response.headers.get('location')
  ) {
    const destination = parseProbeUrl(
      new URL(response.headers.get('location'), request.url),
      'Closed signup redirect'
    );
    if (
      destination.origin === request.url.origin &&
      destination.pathname === CLOSED_ENTRY_REDIRECT_TARGET &&
      destination.search === ''
    ) {
      await deadline.run(() => discardResponseBody(response));
      const waitlistRequest = buildOriginBoundCookieRequest(destination, {
        cookieHeader,
        headers: request.options.headers,
      });
      responseUrl = waitlistRequest.url;
      response = await fetchWithinDeadline(
        deadline,
        fetchImpl,
        responseUrl,
        waitlistRequest.options
      );
      closedSignupRedirect = true;
    }
  }
  assertExactProbeResponse(response, responseUrl);
  if (response.status !== 200) {
    await deadline.run(() => discardResponseBody(response));
    throw new Error(`${surface.label} returned HTTP ${response.status}.`);
  }

  const contentType = (
    response.headers.get('content-type') ?? ''
  ).toLowerCase();
  const body = await readResponseText(response, deadline);
  if (surface.json) {
    if (!contentType.includes('application/json')) {
      throw new Error(`${surface.label} did not return JSON.`);
    }
    let payload;
    try {
      payload = JSON.parse(body);
    } catch {
      throw new Error(`${surface.label} returned invalid JSON.`);
    }
    const reportsAnonymousLiveness =
      surface.acceptsAnonymousLiveness === true &&
      payload &&
      typeof payload === 'object' &&
      payload.healthy === true &&
      typeof payload.timestamp === 'string' &&
      Object.keys(payload).every(
        key => key === 'healthy' || key === 'timestamp'
      );
    if (reportsAnonymousLiveness) return;
    if (
      !payload ||
      typeof payload !== 'object' ||
      payload.status !== surface.expectedStatus
    ) {
      throw new Error(`${surface.label} did not report healthy status.`);
    }
    for (const check of surface.requiredChecks ?? []) {
      if (payload.checks?.[check]?.ok !== true) {
        throw new Error(
          `${surface.label} did not report healthy ${check} state.`
        );
      }
    }
    if (
      Object.hasOwn(payload, 'database') &&
      payload.database !== 'ok' &&
      !(
        payload.database &&
        typeof payload.database === 'object' &&
        payload.database.ok === true
      )
    ) {
      throw new Error(
        `${surface.label} did not report healthy database state.`
      );
    }
    return;
  }

  if (!contentType.includes('text/html')) {
    throw new Error(`${surface.label} did not return HTML.`);
  }
  if (
    Buffer.byteLength(body) < surface.minimumBytes ||
    !/<html(?:\s|>)/i.test(body) ||
    !/<body(?:\s|>)/i.test(body)
  ) {
    throw new Error(`${surface.label} returned an incomplete document.`);
  }
  // Scan the rendered markup only. Inline <script> RSC flight payloads echo
  // component copy (including error-branch strings), so testing the raw body
  // here false-fails healthy deploys. Visible error/not-found copy lives outside
  // <script> tags and is still caught.
  if (publicErrorContent.test(stripInlineScriptContent(body))) {
    throw new Error(`${surface.label} returned error or not-found content.`);
  }
  if (
    closedSignupRedirect &&
    !WAITLIST_ROLE_FORM_PATTERN.test(
      stripInlineScriptContent(body).replace(HTML_COMMENT_BLOCK, ' ')
    )
  ) {
    throw new Error(`${surface.label} did not reach the waitlist role form.`);
  }
  if (surface.release === true) assertLiveReleaseDocument(surface, body);
  return body;
}

module.exports = {
  CLOSED_ENTRY_REDIRECT_TARGET,
  CLOSED_ENTRY_SURFACES,
  HTML_COMMENT_BLOCK,
  WAITLIST_ROLE_FORM_PATTERN,
  assertExactResponseUrl,
  verifyPublicSurfaceOnce,
};
