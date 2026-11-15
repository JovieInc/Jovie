/**
 * Legacy numeric slug migration: pure planning.
 *
 * Before the plain-language slug policy (slug-policy.ts), same-title
 * collisions were resolved with numeric suffixes, so public URLs such as
 * `/tim/sober/sober-2` and `/tim/take-me-over-2` are still live and in the
 * sitemap. This module plans the renames; persistence and redirects live in
 * slug-migration.ts.
 *
 * Only slugs that are provably bug-made are touched: the slug must be the
 * title's own slug plus `-N`. A title that really ends in a number
 * (`Area 51` -> `area-51`) is never treated as legacy.
 */

import {
  NUMERIC_SUFFIX,
  planSlugs,
  type SlugItem,
  slugify,
} from './slug-policy';

/** The title's own slug when `currentSlug` is that slug plus `-N`, else null. */
export function legacySlugBase(
  currentSlug: string,
  title: string
): string | null {
  if (!NUMERIC_SUFFIX.test(currentSlug)) return null;
  const base = slugify(title);
  if (!base || currentSlug === base) return null;
  return currentSlug.replace(NUMERIC_SUFFIX, '') === base ? base : null;
}

export interface SlugRename {
  readonly id: string;
  readonly from: string;
  readonly to: string;
}

/**
 * Bare title slugs no legacy release may take: when every release sharing a
 * title is credited with another main artist (`Seaside Heights` with Vigel),
 * the bare slug stays free for the artist's own solo release, which may not
 * be imported yet. Those releases get a `-with-{artist}` slug instead.
 */
function coPrimaryOnlyBases(releases: readonly SlugItem[]): Set<string> {
  const byBase = new Map<string, SlugItem[]>();
  for (const release of releases) {
    const base = slugify(release.title);
    if (!base) continue;
    byBase.set(base, [...(byBase.get(base) ?? []), release]);
  }
  const bases = new Set<string>();
  for (const [base, group] of byBase) {
    const hasLegacy = group.some(
      r => legacySlugBase(r.currentSlug, r.title) !== null
    );
    if (hasLegacy && group.every(r => r.coPrimary.length > 0)) bases.add(base);
  }
  return bases;
}

/**
 * Plan release renames for one artist. Every release whose slug is not
 * legacy keeps its URL (pinned); legacy releases are planned around them
 * with the shared policy. `reserved` holds slugs owned by anything outside
 * the plan (soft-deleted releases, old-slug redirects).
 */
export function planLegacyReleaseSlugRenames(
  releases: readonly SlugItem[],
  reserved: ReadonlySet<string> = new Set()
): SlugRename[] {
  const legacy = releases.filter(
    r => legacySlugBase(r.currentSlug, r.title) !== null
  );
  if (legacy.length === 0) return [];

  const pinned = new Set(
    releases
      .filter(r => legacySlugBase(r.currentSlug, r.title) === null)
      .map(r => r.key)
  );
  const plan = planSlugs(
    releases,
    new Set([...reserved, ...coPrimaryOnlyBases(releases)]),
    pinned
  );

  const renames: SlugRename[] = [];
  for (const release of legacy) {
    const next = plan.get(release.key)?.slug;
    if (next && next !== release.currentSlug && !NUMERIC_SUFFIX.test(next)) {
      renames.push({ id: release.key, from: release.currentSlug, to: next });
    }
  }
  return renames;
}

export interface ReleaseTrackSlugRow {
  readonly id: string;
  readonly releaseId: string;
  readonly title: string;
  readonly slug: string;
}

/**
 * Plan track renames. Track URLs are scoped to their release
 * (`/{handle}/{release}/{track}`), so a legacy track slug becomes its plain
 * title slug whenever no other track on the same release uses it. When the
 * plain slug is taken the track keeps its URL; it is never made worse.
 */
export function planLegacyTrackSlugRenames(
  tracks: readonly ReleaseTrackSlugRow[]
): SlugRename[] {
  const byRelease = new Map<string, ReleaseTrackSlugRow[]>();
  for (const track of tracks) {
    byRelease.set(track.releaseId, [
      ...(byRelease.get(track.releaseId) ?? []),
      track,
    ]);
  }

  const renames: SlugRename[] = [];
  for (const group of byRelease.values()) {
    const taken = new Set(group.map(t => t.slug));
    const ordered = [...group].sort((a, b) => a.id.localeCompare(b.id));
    for (const track of ordered) {
      const base = legacySlugBase(track.slug, track.title);
      if (!base || taken.has(base)) continue;
      taken.add(base);
      renames.push({ id: track.id, from: track.slug, to: base });
    }
  }
  return renames;
}

/**
 * For an old track URL: the slug without its numeric suffix, which the track
 * route tries within the same release before giving up. Null when the slug
 * has no numeric suffix.
 */
export function legacyTrackSlugFallback(trackSlug: string): string | null {
  if (!NUMERIC_SUFFIX.test(trackSlug)) return null;
  const base = trackSlug.replace(NUMERIC_SUFFIX, '');
  return base && base !== trackSlug ? base : null;
}
