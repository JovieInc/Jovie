import 'server-only';

import { detectPlatformFromUrl } from '@/lib/utils/social-platform';
import type { WaitlistRequestPayload } from '@/lib/validation/schemas';
import type { AdmissionScore } from '@/lib/waitlist/admission-score';
import { hashEmailForWaitlist } from '@/lib/waitlist/signup-entry';

function normalizeSpotifyUrl(url: string): string {
  try {
    const parsed = new URL(url);
    parsed.protocol = 'https:';
    for (const param of [
      'si',
      'utm_source',
      'utm_medium',
      'utm_campaign',
      'nd',
    ]) {
      parsed.searchParams.delete(param);
    }
    return parsed.toString();
  } catch {
    return url;
  }
}

function buildQualificationInputs(data: WaitlistRequestPayload) {
  return {
    primaryGoal: data.primaryGoal ?? null,
    primarySocialUrl: data.primarySocialUrl,
    spotifyUrl: data.spotifyUrl ?? null,
    spotifyArtistName: data.spotifyArtistName?.trim() || null,
    heardAbout: data.heardAbout?.trim() || null,
    selectedPlan: data.selectedPlan ?? null,
  };
}

export function buildEntryValues(params: {
  readonly data: WaitlistRequestPayload;
  readonly email: string;
  readonly fullName: string;
  readonly source: string;
  readonly admissionScore?: AdmissionScore;
}) {
  const { data, email, fullName, source } = params;
  const { platform, normalizedUrl } = detectPlatformFromUrl(
    data.primarySocialUrl
  );
  const spotifyUrlNormalized = data.spotifyUrl
    ? normalizeSpotifyUrl(data.spotifyUrl)
    : null;

  return {
    fullName,
    email,
    emailNormalized: email,
    emailHash: hashEmailForWaitlist(email),
    primaryGoal: data.primaryGoal ?? null,
    primarySocialUrl: data.primarySocialUrl,
    primarySocialPlatform: platform,
    primarySocialUrlNormalized: normalizedUrl,
    spotifyUrl: data.spotifyUrl ?? null,
    spotifyUrlNormalized,
    spotifyArtistName: data.spotifyArtistName?.trim() || null,
    heardAbout: data.heardAbout?.trim() || null,
    selectedPlan: data.selectedPlan ?? null,
    source,
    canonical: true,
    qualificationInputs: {
      ...buildQualificationInputs(data),
      ...(params.admissionScore
        ? { admissionScore: params.admissionScore }
        : {}),
    },
    updatedAt: new Date(),
    // Store a useful fallback in existing fields without inventing launch scoring.
    primarySocialFollowerCount: null,
  };
}
