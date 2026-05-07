import 'server-only';

const DEFAULT_BASE_URL = 'https://jov.ie';
// Standard SMS segment cap is 160 GSM-7 chars. We aim well under so the URL
// is never split across segments (Twilio bills per segment). 320 is two
// segments and still cheap; we hard-cap at that for a long artist+title.
const SMS_SOFT_LIMIT = 320;

export interface ReleaseDaySmsInputs {
  /** Display name of the artist. */
  artistName: string;
  /** Title of the release. */
  releaseTitle: string;
  /** URL-safe username (used to build the public URL). */
  username: string;
  /** Release slug (used to build the public URL). */
  slug: string;
  /** Optional override for the public site origin. */
  baseUrl?: string;
}

/**
 * Build the SMS body for a release-day notification.
 *
 * Format: `New from {artist}: "{title}" - {url}`. Plain ASCII (no emoji per
 * UI rules; SMS bodies aren't UI but we keep tone consistent and avoid
 * GSM-7 fallback to UCS-2 which halves segment capacity). Total length is
 * capped near two SMS segments so a long title still fits without
 * truncating the URL.
 */
export function buildReleaseDaySmsBody(inputs: ReleaseDaySmsInputs): string {
  const baseUrl = (inputs.baseUrl ?? DEFAULT_BASE_URL).replace(/\/$/, '');
  const url = `${baseUrl}/${encodeURIComponent(inputs.username)}/${encodeURIComponent(inputs.slug)}`;
  const artist = inputs.artistName.trim();
  const title = inputs.releaseTitle.trim();

  const fullMessage = `New from ${artist}: "${title}" - ${url}`;
  if (fullMessage.length <= SMS_SOFT_LIMIT) {
    return fullMessage;
  }

  // URL must always survive — clamp the title instead. Keep at least 4 chars
  // of title plus an ellipsis so the trim is obviously intentional.
  const fixedSuffix = ` - ${url}`;
  const prefix = `New from ${artist}: "`;
  const closingQuote = '"';
  const ellipsis = '...';
  const reservedForTitle =
    SMS_SOFT_LIMIT - prefix.length - closingQuote.length - fixedSuffix.length;
  if (reservedForTitle <= ellipsis.length + 1) {
    // Pathological: artist name + URL alone exceed limit. Drop the title
    // wrapper entirely; the URL is the actionable bit.
    const compact = `New from ${artist}${fixedSuffix}`;
    return compact.length <= SMS_SOFT_LIMIT
      ? compact
      : `New release${fixedSuffix}`;
  }

  const trimmedTitle =
    title.slice(0, reservedForTitle - ellipsis.length).trimEnd() + ellipsis;
  return `${prefix}${trimmedTitle}${closingQuote}${fixedSuffix}`;
}
