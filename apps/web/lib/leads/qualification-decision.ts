export interface LeadQualificationDecision {
  status: 'qualified' | 'disqualified';
  disqualificationReason: string | null;
}

export interface LeadQualificationInput {
  displayName: string | null;
  links: ReadonlyArray<{ url: string }>;
  hasSpotifyArtistUrl: boolean;
  spotifyLinkCount: number;
}

/**
 * Default-off. When enabled, a public name plus any public link can qualify.
 * Spotify is no longer required. Who is marked qualified can change, so the
 * flag stays off until contact policy is decided.
 */
export function isGenericLeadQualificationEnabled(): boolean {
  return process.env.FEATURE_LEAD_QUALIFY_GENERIC === 'true';
}

function legacyDecision(
  input: LeadQualificationInput
): LeadQualificationDecision {
  if (!input.hasSpotifyArtistUrl) {
    return {
      status: 'disqualified',
      disqualificationReason:
        input.spotifyLinkCount > 0 ? 'spotify_artist_required' : 'no_spotify',
    };
  }

  return {
    status: 'disqualified',
    disqualificationReason: 'commercial_fit_review_needed',
  };
}

export function decideLeadQualification(
  input: LeadQualificationInput
): LeadQualificationDecision {
  if (!isGenericLeadQualificationEnabled()) {
    return legacyDecision(input);
  }

  const hasName = (input.displayName ?? '').trim().length > 0;
  const hasPublicLink = input.links.some(link => link.url.trim().length > 0);
  if (hasName && hasPublicLink) {
    return { status: 'qualified', disqualificationReason: null };
  }

  return {
    status: 'disqualified',
    disqualificationReason: 'insufficient_identity',
  };
}
