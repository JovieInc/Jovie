import { createRequire } from 'node:module';
import {
  CRAWL_UA,
  firstPartyMetadata,
  markedUserAgent,
} from './traffic-evidence.mjs';

// Reuse the existing untyped CJS verification and secret recorder through a
// narrow adapter. Bootstrap fixtures exercise their original validation.
const loadCommonJs = createRequire(import.meta.url);
/** @type {{bootstrapOriginBoundAccess: (origin:string, options:Record<string,unknown>) => Promise<{cookies:any[],cookieHeader:string}>}} */
const protectedOrigin = loadCommonJs(
  '../../apps/web/scripts/vercel-protected-origin.cjs'
);
/** @type {{recordSensitiveValues:(path:string|undefined,values:string[])=>void, sensitiveCookieValues:(cookies:any[])=>string[]}} */
const protectedBrowser = loadCommonJs(
  '../../apps/web/scripts/lighthouse-vercel-bypass.cjs'
);

/** Browser-process SW updates ignore context UA overrides. Read the actual
 * unchanged default UA without network, then append only a generic marker at
 * launch. Device-specific context UAs retain their own exact prefix.
 */
export async function launchIdentifiedBrowser(browserType) {
  const probe = await browserType.launch();
  let userAgent;
  try {
    const session = await probe.newBrowserCDPSession();
    ({ userAgent } = await session.send('Browser.getVersion'));
  } finally {
    await probe.close();
  }
  if (typeof userAgent !== 'string' || !userAgent)
    throw new Error('native browser UA unavailable');
  const browser = await browserType.launch({
    args: [`--user-agent=${markedUserAgent(userAgent)}`],
  });
  return { browser, nativeUserAgent: userAgent, marker: CRAWL_UA };
}

/** Reuse the existing verified exact-deployment bootstrap. These cookies carry
 * only the already-authorized host-bound protection state, never account state.
 */
export async function bootstrapProtection({
  origin,
  sha,
  bypass,
  fetchImpl,
  deadlineEpochMs = Infinity,
}) {
  if (!bypass) return { cookies: [], cookieHeader: '' };
  const remaining = Math.min(120_000, deadlineEpochMs - Date.now());
  if (remaining < 1000)
    throw new Error('crawl deadline before protection bootstrap');
  return protectedOrigin.bootstrapOriginBoundAccess(origin, {
    bypassSecret: bypass,
    expectedCommitSha: sha,
    expectedDeploymentOrigin: origin,
    expectedEnvironment: 'production',
    fetchImpl,
    timeoutMs: remaining,
    onSensitiveValues: cookies =>
      protectedBrowser.recordSensitiveValues(
        process.env.PLAYWRIGHT_DYNAMIC_SECRETS_FILE,
        protectedBrowser.sensitiveCookieValues(cookies)
      ),
  });
}

/** CDP per-hop headers do not extend to a subsequent redirect (unlike Route
 * overrides). Only page-owned first-party hops receive invocation metadata.
 */
export async function identifyPage(
  context,
  page,
  { origin, metadata, evidence }
) {
  const session = await context.newCDPSession(page);
  session.on('Fetch.requestPaused', async event => {
    try {
      if (!evidence.admit(event.request).allowed) {
        await session.send('Fetch.failRequest', {
          requestId: event.requestId,
          errorReason: 'BlockedByClient',
        });
        return;
      }
      if (new URL(event.request.url).origin !== new URL(origin).origin) {
        await session.send('Fetch.continueRequest', {
          requestId: event.requestId,
        });
        return;
      }
      const headers = firstPartyMetadata(
        event.request.url,
        origin,
        event.request.headers,
        metadata
      );
      await session.send('Fetch.continueRequest', {
        requestId: event.requestId,
        headers: Object.entries(headers).map(([name, value]) => ({
          name,
          value: String(value),
        })),
      });
    } catch (error) {
      if (
        !/Target.*closed|Session closed|already handled|aborted|Invalid InterceptionId/u.test(
          String(error)
        )
      )
        evidence.instrumentationError('page invocation metadata unavailable');
      await session
        .send('Fetch.failRequest', {
          requestId: event.requestId,
          errorReason: 'BlockedByClient',
        })
        .catch(() => {});
    }
  });
  await session.send('Fetch.enable', {
    patterns: [{ urlPattern: '*', requestStage: 'Request' }],
  });
}

/** Fresh contexts retain native SW/HTTP-cache semantics. Context.route disables
 * HTTP cache; this existing per-page CDP seam preserves it. No worker bridge, proxy,
 * feature disabling, cross-origin headers or account/session sharing.
 */
export function createContextFactory({
  browser,
  origin,
  viewports,
  storageState,
  evidence,
  metadata = {},
  protectionCookies = [],
  deviceOptions = {},
}) {
  return async ({ viewport, identity }) => {
    const admission = await evidence.pace();
    if (!admission.allowed)
      throw new Error(`crawl ${admission.reason}: page not started`);
    const device = deviceOptions[viewport] ?? {};
    const context = await browser.newContext({
      viewport: viewports[viewport],
      ...device,
      ...(device.userAgent
        ? { userAgent: markedUserAgent(device.userAgent) }
        : {}),
      ...(identity === 'signed-in' ? { storageState } : {}),
    });
    try {
      evidence.observe(context);
      if (protectionCookies.length)
        await context.addCookies(
          protectionCookies.map(cookie => ({ ...cookie }))
        );
      const newPage = context.newPage.bind(context);
      context.newPage = async () => {
        const page = await newPage();
        try {
          await identifyPage(context, page, { origin, metadata, evidence });
        } catch (error) {
          await context.close().catch(() => {});
          throw error;
        }
        return page;
      };
      return context;
    } catch (error) {
      await context.close().catch(() => {});
      throw error;
    }
  };
}
