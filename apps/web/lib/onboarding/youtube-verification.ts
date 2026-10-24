/**
 * YouTube channel verification states for onboarding.
 *
 *   none -> unverified -> verified
 *
 * `unverified`: the visitor named a cadence-qualified channel, but typing a URL
 * proves nothing. It is display-only: no admission, no approval, no public
 * claim, no checkout unlock.
 * `verified`: OAuth `channels?mine=true` (listOwnedYouTubeChannels) returned
 * the candidate's channel id for the signed-in user. Only then does the
 * channel supply `verifiedOwnedChannelIds` to the access decision.
 *
 * Pure module (no server-only imports) so client components can share types.
 */

export interface YouTubeCandidate {
  readonly channelId: string;
  readonly title: string;
  readonly url: string;
  /** Server-computed at interview time; never read from client input. */
  readonly cadenceQualified: true;
}

export type YouTubeVerificationState = 'none' | 'unverified' | 'verified';

const CHANNEL_ID_RE = /^UC[A-Za-z0-9_-]{22}$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Strictly parse a stored candidate; anything malformed is "no candidate". */
export function parseYouTubeCandidate(value: unknown): YouTubeCandidate | null {
  if (!isRecord(value)) return null;
  const { channelId, title, url, cadenceQualified } = value;
  if (
    typeof channelId !== 'string' ||
    !CHANNEL_ID_RE.test(channelId) ||
    typeof title !== 'string' ||
    typeof url !== 'string' ||
    cadenceQualified !== true
  ) {
    return null;
  }
  try {
    const parsed = new URL(url);
    if (
      parsed.protocol !== 'https:' ||
      parsed.hostname.replace(/^(www|m)\./, '') !== 'youtube.com'
    ) {
      return null;
    }
  } catch {
    return null;
  }
  return { channelId, title: title.slice(0, 120), url, cadenceQualified };
}

/** Read the candidate recorded at claim time from profile settings. */
export function readYouTubeCandidateFromSettings(
  settings: unknown
): YouTubeCandidate | null {
  if (!isRecord(settings) || !isRecord(settings.onboarding)) return null;
  return parseYouTubeCandidate(settings.onboarding.youtubeCandidate);
}

export function resolveYouTubeVerificationState(
  candidate: YouTubeCandidate | null,
  verifiedOwnedChannelIds: readonly string[]
): YouTubeVerificationState {
  if (!candidate) return 'none';
  return verifiedOwnedChannelIds.includes(candidate.channelId)
    ? 'verified'
    : 'unverified';
}

/**
 * Of the channels the signed-in user owns (OAuth), pick the one matching the
 * candidate. Used to choose among multiple channels; null = mismatch.
 */
export function pickOwnedCandidateChannel<T extends { readonly id: string }>(
  owned: readonly T[],
  candidate: YouTubeCandidate | null
): T | null {
  if (!candidate) return null;
  return owned.find(channel => channel.id === candidate.channelId) ?? null;
}
