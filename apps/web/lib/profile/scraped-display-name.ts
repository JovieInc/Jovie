/**
 * Link-in-bio ingestion stored page titles as display names, e.g.
 * "Mega Ran | Instagram, Facebook, Twitch",
 * "ninadevitry - Listen on YouTube, Spotify" or
 * "ODESZA Tour Dates, Tickets & Merch Links" (JOV-7753). Strip the page-title
 * chrome so a prospect sees their own name, not a scraped tab title. A title
 * that is only a role ("Hip Hop Artist | NC") is not a name, so it returns
 * null and callers fall back to the handle.
 */
const PIPE_SUFFIX = /\s+\|\s+.*$/;
const PAGE_TITLE_SUFFIX =
  /\s+[-|–—]\s+(listen on|official|instagram|tour dates).*$/i;
/** Title chrome with no separator: "ODESZA Tour Dates, Tickets & Merch Links". */
const BARE_TITLE_SUFFIX =
  /\s+(tour dates|tickets\s*&\s*merch|merch links|official links)\b.*$/i;
/** A bare role or genre is a page description, not an artist name. */
const ROLE_ONLY =
  /^((hip[\s-]?hop|rap|pop|r&b|rnb|country|indie|edm|electronic|jazz|rock|latin|gospel|independent|singer[\s/-]?songwriter|music|recording)\s+)*(artist|musician|singer|rapper|producer|band|dj|songwriter|singer[\s/-]?songwriter)s?$/i;

export function cleanScrapedDisplayName(
  value: string | null | undefined
): string | null {
  if (!value) return null;
  const cleaned = value
    .trim()
    .replace(PAGE_TITLE_SUFFIX, '')
    .replace(PIPE_SUFFIX, '')
    .replace(BARE_TITLE_SUFFIX, '')
    .replace(/^@+/, '')
    .trim();
  if (!cleaned || ROLE_ONLY.test(cleaned)) return null;
  return cleaned;
}
