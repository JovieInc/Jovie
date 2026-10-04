/**
 * Link-in-bio ingestion stored page titles as display names, e.g.
 * "Mega Ran | Instagram, Facebook, Twitch" or
 * "ninadevitry - Listen on YouTube, Spotify" (JOV-7753). Strip the page-title
 * chrome so a prospect sees their own name, not a scraped tab title.
 */
const PIPE_SUFFIX = /\s+\|\s+.*$/;
const LISTEN_ON_SUFFIX = /\s+[-–—]\s+listen on\b.*$/i;

export function cleanScrapedDisplayName(
  value: string | null | undefined
): string | null {
  if (!value) return null;
  const cleaned = value
    .replace(PIPE_SUFFIX, '')
    .replace(LISTEN_ON_SUFFIX, '')
    .replace(/^@+/, '')
    .trim();
  return cleaned || null;
}
