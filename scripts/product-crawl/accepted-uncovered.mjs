// Reviewed exceptions for the product crawl. ready-gate.mjs counts a route
// the crawl can't load as covered only through an entry here (copied into
// receipt.uncovered with accepted: true). Add a route only in a reviewed PR,
// with the concrete reason; a route the crawl can fill does not belong here.
// An entry applies only while the crawl found no sample for the route, so a
// conditional reason ("crawled once ...") gives way on its own.

const ADMIN =
  'admin-only: the crawl signs in as the creator-ready canary, which is not an admin, so the admin layout redirects to /app/dashboard before the id is read; crawled when a signed-in admin list links one';

export const ACCEPTED_UNCOVERED = Object.freeze({
  '/drop/[token]':
    'private share-drop link: the token is minted per drop and only its recipients hold it; no page links to one',
  '/p/[token]':
    'secret asset share link: the token is the access grant itself; no page links to one',
  '/claim/agent/[draftId]':
    'agent draft claim link: the draft id and handoff code exist only in the link sent to that artist',
  '/content-preview/[versionId]':
    'signed homepage preview: needs an HMAC ?token= for the version, and unsigned versions 404',
  '/investor-portal/[slug]':
    'memo slugs live in the private investor store, not the repo, and every slug 404s without an investor token (closed in production)',
  '/r/[slug]':
    'legacy {releaseSlug}--{profileId} link: needs a profile internal id, which no public page shows; it redirects to /[username]/[slug], which is crawled',
  '/out/[id]':
    'wrapped-link interstitial: ids are minted per wrapped sensitive link; crawled when the cert profile links one',
  '/app/admin/agent-runs/[id]': ADMIN,
  '/app/admin/lists/[id]': ADMIN,
  '/app/admin/lists/views/[viewId]': ADMIN,
  '/app/admin/wiki/[...slug]': `${ADMIN}; wiki pages come from the gbrain service, not the repo`,
  '/hud/wiki/[...slug]': `rewritten to /app/ov/wiki (next.config.js beforeFiles), so it is the admin wiki; ${ADMIN}`,
  '/engineering/[slug]':
    'no engineering story is published yet (content/engineering holds drafts only) and dynamicParams is false, so the route has no page; crawled once /sitemap.xml lists one',
  '/playlists/[slug]':
    'no playlist is published yet (/playlists says coming soon and /sitemap.xml lists none); crawled once /sitemap.xml lists one',
  '/playlists/genre/[genre]':
    'a genre hub 404s unless a published playlist carries the genre, and none is published yet; crawled from the playlist page once one is',
  '/playlists/mood/[mood]':
    'a mood hub 404s unless a published playlist carries the mood, and none is published yet; crawled from the playlist page once one is',
  '/billing/cancel':
    'loading it signed in records a checkout_cancelled analytics event for the test account, and strangers are sent to sign in',
});

// Pages a signed-in load could change the test account from, or that would
// end the session; the stranger crawl still covers them.
export const SIGNED_IN_SKIP =
  /delete|sign-?out|logout|cancel|remove|unsubscribe/;

// Matched by SIGNED_IN_SKIP's words, but the page is only a server redirect,
// so loading it signed in changes nothing (sample-params.test.mjs pins that
// each file still is one). Route -> page file.
export const SIGNED_IN_SAFE = Object.freeze({
  // redirects to /app/settings/data-privacy; deleting needs a click there
  '/app/settings/delete-account':
    'apps/web/app/app/(shell)/settings/delete-account/page.tsx',
  // redirects to /pricing
  '/billing/remove-branding': 'apps/web/app/billing/remove-branding/page.tsx',
});

/** @param {string} route */
export const skipSignedIn = route =>
  SIGNED_IN_SKIP.test(route) && !Object.hasOwn(SIGNED_IN_SAFE, route);

/**
 * The receipt entry for a route the crawl did not load: the reviewed reason
 * when one is listed, otherwise the crawl's own (which the gate won't accept).
 * @param {string} route @param {string} reason
 */
export function uncoveredEntry(route, reason) {
  return Object.hasOwn(ACCEPTED_UNCOVERED, route)
    ? { route, reason: ACCEPTED_UNCOVERED[route], accepted: true }
    : { route, reason };
}
