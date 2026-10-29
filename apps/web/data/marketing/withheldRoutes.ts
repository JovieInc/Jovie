/**
 * Withheld marketing pages: routes that promise something that does not
 * exist yet. Single source for navigation, footer, flyouts, and the sitemap.
 * Tim, 2026-10-29: these come out of nav and sitemap until they are real.
 *
 * The routes stay reachable (no 404) so existing links keep working, and each
 * page serves noindex metadata. To publish one again, ship the `returnsWhen`
 * feature and delete the entry in the same change.
 */
export interface WithheldMarketingRoute {
  readonly route: string;
  readonly reason: string;
  /** The feature that must ship before the page returns. */
  readonly returnsWhen: string;
  /** Linear-friendly note for the tracking issue. */
  readonly note: string;
}

export const WITHHELD_MARKETING_ROUTES: readonly WithheldMarketingRoute[] = [
  {
    route: '/card',
    reason: 'Product is not available yet; the page only collects interest.',
    returnsWhen: 'Jovie Card ships and can be ordered or used.',
    note: 'Restore /card to nav, footer, and sitemap when Jovie Card is live.',
  },
  {
    route: '/demovideo',
    reason: 'Legacy duplicate of the demo video route, which has no video.',
    returnsWhen: 'A real product demo video is published.',
    note: 'Restore with /demo/video once the demo video exists.',
  },
  {
    route: '/demo/video',
    reason: 'Page promises a product demo but has no video to play.',
    returnsWhen: 'A real product demo video is published.',
    note: 'Restore Product Demo links once the video is recorded and hosted.',
  },
  {
    route: '/youtube-thumbnails',
    reason: 'Page promises thumbnails but shows none.',
    returnsWhen: 'Thumbnail generation returns real results for a channel.',
    note: 'Restore after the preview API returns thumbnails end to end.',
  },
  {
    route: '/integrations',
    reason: 'Page is close to empty and lists nothing a visitor can connect.',
    returnsWhen: 'At least three live integrations are listed with real setup.',
    note: 'Restore the developers link and sitemap entry with real content.',
  },
  {
    route: '/compare',
    reason: 'Hub page is close to empty.',
    returnsWhen: 'The hub lists published comparisons with real content.',
    note: 'Leaf pages under /compare/* stay published; only the hub is withheld.',
  },
  {
    route: '/alternatives',
    reason: 'Hub page is close to empty.',
    returnsWhen: 'The hub lists published alternatives with real content.',
    note: 'Leaf pages under /alternatives/* stay published; only the hub is withheld.',
  },
];

const WITHHELD_PATHS: ReadonlySet<string> = new Set(
  WITHHELD_MARKETING_ROUTES.map(entry => entry.route)
);

function normalize(href: string): string {
  const path = href.split(/[?#]/u)[0]?.replace(/\/+$/, '') ?? '';
  return path === '' ? '/' : path;
}

/** True for the exact withheld pathname; sub-paths are not withheld. */
export function isWithheldMarketingPath(href: string): boolean {
  return WITHHELD_PATHS.has(normalize(href));
}
