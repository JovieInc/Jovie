/**
 * Slug policy: plain-language, SEO-friendly, never numeric suffixes.
 *
 * When one artist has several items with the same title, the most meaningful
 * qualifier disambiguates them, in this order:
 *   1. version type from EXPLICIT metadata (remixer credit, version field);
 *      a version is never inferred from the title text
 *   2. co-primary artist                      `seaside-heights-with-vigel`
 *      (featured artist: `-feat-<name>`)
 *   3. release year                           `seaside-heights-2020`
 *   4. year + version type, year + collaborator
 *   5. full release date
 * ISRC is an internal identifier and never appears in a slug.
 *
 * The bare slug goes to the artist's own original recording: not a versioned
 * edit, then solo (no co-primary artist), then earliest release, then most
 * popular.
 *
 * Pure functions only; persistence lives in slug.ts and slug-migration.ts.
 */

export type SlugQualifier =
  | 'bare'
  | 'established'
  | 'version'
  | 'co_primary'
  | 'featured'
  | 'year'
  | 'year_version'
  | 'year_co_primary'
  | 'date'
  | 'unique_word';

export type VersionType =
  | 'remix'
  | 'acoustic'
  | 'live'
  | 'remastered'
  | 'sped-up'
  | 'instrumental'
  | 'radio-edit';

/** A numeric disambiguation suffix such as `-2` or `-12`. Never generated. */
export const NUMERIC_SUFFIX = /-\d{1,3}$/;

export function slugify(value: string, maxLength = 50): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replaceAll(/[̀-ͯ]/g, '')
    .replaceAll(/[^a-z0-9\s-]/g, '')
    .replaceAll(/\s+/g, '-')
    .replaceAll(/-+/g, '-')
    .replaceAll(/(^-)|(-$)/g, '')
    .slice(0, maxLength)
    .replaceAll(/-$/g, '');
}

export interface SlugItem {
  /** Stable key (release id). */
  readonly key: string;
  readonly kind: 'release' | 'recording';
  readonly title: string;
  readonly currentSlug: string;
  readonly releaseDate: Date | null;
  /** Other `main_artist` credits besides the profile owner (co-primary). */
  readonly coPrimary: readonly string[];
  /** `featured_artist` credits. */
  readonly featured: readonly string[];
  /** `remixer` credits. */
  readonly remixers: readonly string[];
  /** Explicit version metadata, when the release carries it. */
  readonly versionType?: VersionType | null;
  readonly popularity: number;
}

export interface SlugAssignment {
  readonly slug: string;
  readonly qualifier: SlugQualifier;
}

function versionSlug(
  item: Pick<SlugItem, 'versionType' | 'remixers'>
): string | null {
  if (item.remixers.length > 0) {
    const remixer = slugify(item.remixers[0] ?? '', 30);
    return remixer ? `${remixer}-remix` : 'remix';
  }
  return item.versionType ?? null;
}

function namesSlug(prefix: string, names: readonly string[]): string | null {
  const parts = names
    .slice(0, 2)
    .map(n => slugify(n, 24))
    .filter(Boolean);
  return parts.length ? `${prefix}-${parts.join('-and-')}` : null;
}

const MONTHS = [
  'january',
  'february',
  'march',
  'april',
  'may',
  'june',
  'july',
  'august',
  'september',
  'october',
  'november',
  'december',
];

function dateWords(date: Date): string {
  return `${MONTHS[date.getUTCMonth()]}-${date.getUTCDate()}-${date.getUTCFullYear()}`;
}

/** Candidates in policy order for a non-winning item. */
export function qualifierCandidates(
  baseSlug: string,
  item: Pick<
    SlugItem,
    'releaseDate' | 'coPrimary' | 'featured' | 'remixers' | 'versionType'
  >
): Array<{ slug: string; qualifier: SlugQualifier }> {
  const out: Array<{ slug: string; qualifier: SlugQualifier }> = [];
  const add = (suffix: string | null, qualifier: SlugQualifier) => {
    if (!suffix) return;
    if (baseSlug.includes(suffix)) return; // title already says it
    out.push({ slug: `${baseSlug}-${suffix}`, qualifier });
  };
  const version = versionSlug(item);
  const collab = namesSlug('with', item.coPrimary);
  const feat = namesSlug('feat', item.featured);
  const year = item.releaseDate
    ? String(item.releaseDate.getUTCFullYear())
    : null;

  add(version, 'version');
  add(collab, 'co_primary');
  add(feat, 'featured');
  add(year, 'year');
  if (year && version) add(`${year}-${version}`, 'year_version');
  if (year && collab) add(`${year}-${collab}`, 'year_co_primary');
  if (item.releaseDate) {
    add(dateWords(item.releaseDate), 'date');
  }
  return out;
}

/** Who gets the bare slug: non-remix, solo, earliest, most popular. */
export function compareForBareSlug(a: SlugItem, b: SlugItem): number {
  const rank = (i: SlugItem) => [
    i.kind === 'release' ? 0 : 1,
    versionSlug(i) ? 1 : 0,
    i.coPrimary.length > 0 ? 1 : 0,
    i.releaseDate ? i.releaseDate.getTime() : Number.MAX_SAFE_INTEGER,
    -i.popularity,
  ];
  const ra = rank(a);
  const rb = rank(b);
  for (let i = 0; i < ra.length; i++) {
    if (ra[i] !== rb[i]) return ra[i] < rb[i] ? -1 : 1;
  }
  return a.key.localeCompare(b.key);
}

/**
 * Assign a slug to every item. `reserved` are slugs that must not be used
 * (for example redirects owned by content outside this plan). `pinned` items
 * have an ESTABLISHED canonical URL (publicly live, not a bug-made numeric
 * suffix): they keep their slug, never lose the bare slug to a newer or
 * better-ranked sibling, and everyone else plans around them.
 */
export function planSlugs(
  items: readonly SlugItem[],
  reserved: ReadonlySet<string> = new Set(),
  pinned: ReadonlySet<string> = new Set()
): Map<string, SlugAssignment> {
  const taken = new Set(reserved);
  const result = new Map<string, SlugAssignment>();

  for (const item of items) {
    if (!pinned.has(item.key)) continue;
    taken.add(item.currentSlug);
    result.set(item.key, { slug: item.currentSlug, qualifier: 'established' });
  }

  const groups = new Map<string, SlugItem[]>();
  for (const item of items) {
    if (pinned.has(item.key)) continue;
    const base = slugify(item.title) || item.kind;
    groups.set(base, [...(groups.get(base) ?? []), item]);
  }

  // Bare slugs first, across all groups, so a qualified slug in one group can
  // never take a bare slug another group is entitled to.
  const ordered = [...groups.entries()].sort(([a], [b]) => a.localeCompare(b));
  const losers: Array<{ base: string; item: SlugItem }> = [];
  for (const [base, group] of ordered) {
    const [winner, ...rest] = [...group].sort(compareForBareSlug);
    if (winner && !taken.has(base)) {
      taken.add(base);
      result.set(winner.key, { slug: base, qualifier: 'bare' });
    } else if (winner) {
      rest.unshift(winner);
    }
    for (const item of rest) losers.push({ base, item });
  }

  for (const { base, item } of losers) {
    const pick = qualifierCandidates(base, item).find(c => !taken.has(c.slug));
    if (pick) {
      taken.add(pick.slug);
      result.set(item.key, pick);
      continue;
    }
    // Last resort, still non-numeric: letters derived from the item key.
    const word = [...item.key.replaceAll(/[^a-f]/gi, '').toLowerCase()]
      .join('')
      .padEnd(6, 'x')
      .slice(0, 6);
    let slug = `${base}-${word}`;
    for (let i = 0; taken.has(slug); i++)
      slug = `${base}-${word}${'x'.repeat(i + 1)}`;
    taken.add(slug);
    result.set(item.key, { slug, qualifier: 'unique_word' });
  }
  return result;
}
