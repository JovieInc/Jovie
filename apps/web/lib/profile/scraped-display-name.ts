/**
 * Link-in-bio ingestion stored page titles as display names, e.g.
 * "Mega Ran | Instagram, Facebook, Twitch" or
 * "ninadevitry - Listen on YouTube, Spotify" (JOV-7753). Strip the page-title
 * chrome so a prospect sees their own name, not a scraped tab title.
 */
const PIPE_SUFFIX = /\s+\|\s+.*$/;
const PAGE_TITLE_SUFFIX =
  /\s+[-|–—]\s+(listen on|official|instagram|tour dates).*$/i;

export function cleanScrapedDisplayName(
  value: string | null | undefined
): string | null {
  if (!value) return null;
  const cleaned = value
    .trim()
    .replace(PAGE_TITLE_SUFFIX, '')
    .replace(PIPE_SUFFIX, '')
    .replace(/^@+/, '')
    .trim();
  return cleaned || null;
}
