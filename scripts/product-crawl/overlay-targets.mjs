// Select existing crawl rows for read-only interaction coverage. Selection
// stays isolated by identity and by successfully loaded product section.
export const MAX_WALKS_PER_IDENTITY = 10;

const usable = p =>
  p.viewport === 'desktop' &&
  !p.error &&
  !p.authGated &&
  (p.status ?? 0) < 400 &&
  (p.overlaySurface?.rail || p.overlaySurface?.hoverables > 0);
const section = url =>
  new URL(url, 'https://x').pathname.split('/').slice(0, 3).join('/');

/**
 * Which crawled pages to walk: per identity, pages with the shell sidebar
 * first, then the most hover triggers, one page per product section.
 * @param {any[]} pages @param {{ max?: number }} [opts]
 * @returns {{ route: string, url: string, identity: string }[]}
 */
export function pickWalkTargets(pages, { max = MAX_WALKS_PER_IDENTITY } = {}) {
  const out = [];
  for (const identity of [...new Set(pages.map(p => p.identity))]) {
    const seen = new Set();
    const ranked = pages
      .filter(p => p.identity === identity && usable(p))
      .sort(
        (a, b) =>
          Number(b.overlaySurface.rail) - Number(a.overlaySurface.rail) ||
          a.url.length - b.url.length ||
          b.overlaySurface.hoverables - a.overlaySurface.hoverables
      );
    for (const p of ranked) {
      if (seen.has(section(p.url)) || seen.size >= max) continue;
      seen.add(section(p.url));
      out.push({ route: p.route, url: p.url, identity });
    }
  }
  return out;
}

/**
 * Paths a walk may navigate to: loaded fine by the crawl as this identity.
 * @param {any[]} pages @param {string} identity
 * @param {(route: string) => boolean} [skip]
 */
export function safePaths(pages, identity, skip = () => false) {
  return [
    ...new Set(
      pages
        .filter(
          p =>
            p.identity === identity &&
            !p.error &&
            !p.authGated &&
            (p.status ?? 0) < 400 &&
            !skip(p.route)
        )
        .map(p => new URL(p.url, 'https://x').pathname)
    ),
  ];
}
