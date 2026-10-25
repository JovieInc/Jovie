/**
 * Silent YouTube channel evidence: does a public channel carry this artist's
 * known catalog? Pure and hermetic.
 *
 * This proves ASSOCIATION (the channel publishes the artist's releases), not
 * OWNERSHIP. Ownership stays OAuth-only (see youtube-verification.ts), so a
 * matched channel may be linked for display but never admits anyone.
 */

export interface ChannelEvidence {
  readonly channelId: string;
  readonly title: string;
  /** Titles of the channel's recent public uploads. */
  readonly videoTitles: readonly string[];
}

export interface ChannelMatch {
  readonly channelId: string;
  readonly proven: boolean;
  readonly isTopic: boolean;
  readonly matchedTitles: readonly string[];
  readonly signals: readonly string[];
}

const TOPIC_SUFFIX = /\s*-\s*topic$/i;
/** Parenthetical / bracketed noise and trailing version tags on a title. */
const NOISE =
  /[([][^)\]]*(official|video|audio|lyric|visuali[sz]er|feat|ft\.?|remaster|live|version|mix|edit)[^)\]]*[)\]]/gi;

export function normalizeTitle(raw: string): string {
  return raw
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(NOISE, ' ')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** Titles too short or generic to be evidence ("Love", "Intro"). */
function isDistinctive(normalized: string): boolean {
  if (normalized.length < 5) return false;
  return normalized.split(' ').length >= 2 || normalized.length >= 8;
}

function containsPhrase(haystack: string, needle: string): boolean {
  return ` ${haystack} `.includes(` ${needle} `);
}

export function scoreChannelAgainstCatalog(input: {
  readonly artistName: string;
  readonly catalogTitles: readonly string[];
  readonly channel: ChannelEvidence;
}): ChannelMatch {
  const { channel } = input;
  const isTopic = TOPIC_SUFFIX.test(channel.title);
  const channelName = normalizeTitle(channel.title.replace(TOPIC_SUFFIX, ''));
  const artist = normalizeTitle(input.artistName);
  const nameMatch = artist.length > 0 && channelName === artist;

  const videos = channel.videoTitles.map(normalizeTitle);
  const matched = new Set<string>();
  for (const title of input.catalogTitles) {
    const normalized = normalizeTitle(title);
    if (!isDistinctive(normalized)) continue;
    if (videos.some(video => containsPhrase(video, normalized))) {
      matched.add(normalized);
    }
  }

  const signals: string[] = [];
  if (nameMatch) signals.push('channel_name_equals_artist');
  if (isTopic) signals.push('youtube_topic_channel');
  if (matched.size > 0) signals.push(`catalog_titles_matched:${matched.size}`);

  // Name equality is mandatory: covers, lyric and fan channels reuse titles
  // under another name. Two distinct titles, or one on an auto-generated
  // Topic channel (only distributors can populate those), prove association.
  const proven =
    nameMatch && (matched.size >= 2 || (isTopic && matched.size >= 1));
  return {
    channelId: channel.channelId,
    proven,
    isTopic,
    matchedTitles: [...matched],
    signals,
  };
}

/**
 * Choose the one channel to link. A typed candidate wins if proven; otherwise
 * a single proven non-Topic channel, otherwise a single proven Topic channel.
 * Several equally ranked proven channels are ambiguous: link nothing.
 */
export function pickProvenChannel(
  matches: readonly ChannelMatch[],
  preferredChannelId?: string | null
): ChannelMatch | null {
  const proven = matches.filter(match => match.proven);
  if (proven.length === 0) return null;
  const preferred = proven.find(m => m.channelId === preferredChannelId);
  if (preferred) return preferred;
  const own = proven.filter(match => !match.isTopic);
  if (own.length === 1) return own[0] ?? null;
  if (own.length > 1) return null;
  return proven.length === 1 ? (proven[0] ?? null) : null;
}
