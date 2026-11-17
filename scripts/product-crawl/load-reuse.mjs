import { sitemapPaths } from './sample-params.mjs';

// The core crawl's within-invocation cold-measurement reuse stays isolated by
// identity, viewport, full URL and fixture. Rechecks bypass this cache.
export function createColdVisit(safeVisit, origin) {
  const loads = new Map();
  let reuses = 0;
  return {
    reuses: () => reuses,
    async visit(job) {
      const key = JSON.stringify([
        job.identity,
        job.viewport,
        new URL(job.target, origin).href,
        job.fixture ?? null,
      ]);
      const cached = loads.get(key);
      if (cached && Date.now() - cached.at < 5 * 60_000) {
        const row = await cached.promise;
        if (
          !row.error &&
          row.status >= 100 &&
          row.status < 400 &&
          (!job.collect || row.collected)
        ) {
          reuses++;
          return { ...row, route: job.route, measurementReused: true };
        }
      }
      const promise = safeVisit(job);
      loads.set(key, { at: Date.now(), promise });
      return promise;
    },
  };
}

// Manual redirects are each admitted/counted. Only the proven first party gets
// the existing protection cookie; another origin never inherits credentials.
export async function readSitemap(fetchImpl, origin, cookieHeader = '') {
  let url = new URL('/sitemap.xml', origin);
  for (let hop = 0; hop <= 5; hop++) {
    const res = await fetchImpl(url.href, {
      headers:
        url.origin === new URL(origin).origin && cookieHeader
          ? { cookie: cookieHeader }
          : {},
    });
    if ([301, 302, 303, 307, 308].includes(res.status)) {
      const location = res.headers.get('location');
      if (!location) throw new Error('sitemap redirect has no location');
      url = new URL(location, url);
      if (
        !['http:', 'https:'].includes(url.protocol) ||
        url.username ||
        url.password
      )
        throw new Error('sitemap redirect is not an HTTP target');
      continue;
    }
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.text();
  }
  throw new Error('sitemap exceeded five redirects');
}

// A failed sitemap is retried once and remains an explicit discovery problem.
export async function loadSitemap(
  fetchImpl,
  { origin, cookieHeader, hosts, retry, startupProblem }
) {
  let problem;
  for (let attempt = 1; attempt <= 2; attempt++) {
    if (attempt > 1) retry();
    try {
      if (startupProblem) throw new Error(startupProblem);
      return {
        paths: sitemapPaths(
          await readSitemap(fetchImpl, origin, cookieHeader),
          hosts
        ),
        problem: null,
      };
    } catch (error) {
      problem = error instanceof Error ? error.message : String(error);
    }
  }
  return { paths: [], problem };
}
