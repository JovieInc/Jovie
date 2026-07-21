/**
 * Entity-linked bio mentions.
 *
 * Deterministic, server-side linker that turns plain-text bio/AEO paragraphs
 * into typed segments so entity mentions (this profile's own releases and
 * credited artists with Jovie profiles) render as internal links. No LLM,
 * no client fetching — the same input always produces the same segments, so
 * the output is safe to bake into ISR pages.
 */

export interface EntityMentionRelease {
  readonly title: string;
  readonly slug?: string | null;
}

export interface EntityMentionArtist {
  readonly name: string;
  /** Jovie handle when the artist has a public profile; otherwise null. */
  readonly handle?: string | null;
}

export interface EntityMentionContext {
  /** Handle of the profile the text belongs to (release links hang off it). */
  readonly ownHandle: string;
  readonly releases?: readonly EntityMentionRelease[];
  readonly artists?: readonly EntityMentionArtist[];
}

export type EntityMentionSegment =
  | { readonly type: 'text'; readonly text: string }
  | { readonly type: 'release'; readonly text: string; readonly href: string }
  | { readonly type: 'artist'; readonly text: string; readonly href: string };

export interface ProfileEntityMentionLink {
  readonly kind: 'release' | 'artist';
  readonly name: string;
  readonly href: string;
}

/** Cap on collected mentions (JSON-LD bloat guard). */
export const MAX_ENTITY_MENTIONS = 25;

const MIN_PHRASE_LENGTH = 2;
const WORD_CHAR = /[a-z0-9]/;

interface MentionCandidate {
  readonly kind: 'release' | 'artist';
  readonly phrase: string;
  readonly lowerPhrase: string;
  readonly href: string;
}

function isWordChar(char: string | undefined): boolean {
  return char != null && WORD_CHAR.test(char);
}

function buildCandidates(context: EntityMentionContext): MentionCandidate[] {
  const seen = new Set<string>();
  const candidates: MentionCandidate[] = [];

  for (const release of context.releases ?? []) {
    const title = release.title?.trim();
    const slug = release.slug?.trim();
    if (!title || title.length < MIN_PHRASE_LENGTH || !slug) continue;
    const lower = title.toLowerCase();
    if (seen.has(lower)) continue;
    seen.add(lower);
    candidates.push({
      kind: 'release',
      phrase: title,
      lowerPhrase: lower,
      href: `/${encodeURIComponent(context.ownHandle)}/${encodeURIComponent(slug)}`,
    });
  }

  for (const artist of context.artists ?? []) {
    const name = artist.name?.trim();
    const handle = artist.handle?.trim();
    // Artists without a Jovie profile stay plain text — internal interlinking only.
    if (!name || name.length < MIN_PHRASE_LENGTH || !handle) continue;
    const lower = name.toLowerCase();
    if (seen.has(lower)) continue;
    seen.add(lower);
    candidates.push({
      kind: 'artist',
      phrase: name,
      lowerPhrase: lower,
      href: `/${encodeURIComponent(handle)}`,
    });
  }

  // Longest match first so overlapping names ("Cosmic Gate" vs "Gate")
  // resolve to the most specific entity. Stable sort keeps releases ahead of
  // artists at equal length, so a same-named release links to the release.
  return candidates.sort(
    (left, right) => right.phrase.length - left.phrase.length
  );
}

/**
 * Split plain text into typed segments, linking mentions of the entities in
 * `context`. Matching is case-insensitive and word-boundary aware, so quoted
 * titles (`"Take Me Over"`) match while substrings of longer words
 * (`Sky` inside `Skyline`) do not.
 */
export function linkEntityMentions(
  text: string,
  context: EntityMentionContext
): EntityMentionSegment[] {
  if (!text) return [];

  const candidates = buildCandidates(context);
  if (candidates.length === 0) {
    return [{ type: 'text', text }];
  }

  const lowerText = text.toLowerCase();
  const segments: EntityMentionSegment[] = [];
  let cursor = 0;
  let index = 0;

  const pushTextUpTo = (end: number) => {
    if (end > cursor) {
      segments.push({ type: 'text', text: text.slice(cursor, end) });
    }
  };

  while (index < text.length) {
    let matched: MentionCandidate | null = null;

    if (!isWordChar(lowerText[index - 1])) {
      for (const candidate of candidates) {
        if (!lowerText.startsWith(candidate.lowerPhrase, index)) continue;
        const end = index + candidate.lowerPhrase.length;
        if (isWordChar(lowerText[end])) continue;
        matched = candidate;
        break;
      }
    }

    if (matched) {
      pushTextUpTo(index);
      segments.push({
        type: matched.kind,
        text: text.slice(index, index + matched.phrase.length),
        href: matched.href,
      });
      index += matched.phrase.length;
      cursor = index;
    } else {
      index += 1;
    }
  }

  pushTextUpTo(text.length);
  return segments;
}

/**
 * Flat, deduped list of linkable entities for a profile — used to build
 * JSON-LD `mentions` without re-deriving the candidate set.
 */
export function collectEntityMentions(
  context: EntityMentionContext,
  limit: number = MAX_ENTITY_MENTIONS
): ProfileEntityMentionLink[] {
  return buildCandidates(context)
    .slice(0, Math.max(0, limit))
    .map(candidate => ({
      kind: candidate.kind,
      name: candidate.phrase,
      href: candidate.href,
    }));
}
