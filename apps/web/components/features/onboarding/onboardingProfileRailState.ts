import type { CanonicalArtistMetrics } from '@/lib/onboarding/canonical-metrics';
import type { OnboardingCatalogPreview } from '@/lib/onboarding/catalog-preview';
import type { OnboardingProfileDraft } from '@/lib/onboarding/profile-draft';
import type { OnboardingDspMatch } from './OnboardingToolArtifacts';

// The rail's state and the check for whether it has anything to show. Kept
// apart from OnboardingProfileRail.tsx so onboarding can decide to render the
// rail without loading the profile preview it draws.

export interface OnboardingProfileArtist {
  readonly tagline?: string | null;
  readonly id: string;
  readonly name: string;
  readonly url: string;
  readonly imageUrl?: string | null;
  /**
   * Display follower count — always `metrics.spotifyFollowers` when metrics
   * are present. Kept as a convenience mirror; never store monthly listeners here.
   */
  readonly followers?: number | null;
  readonly metrics?: CanonicalArtistMetrics | null;
  readonly popularity?: number | null;
  readonly genres?: readonly string[];
  readonly dspMatches?: readonly OnboardingDspMatch[];
  /** JOV-9758: the artist's real catalog, rendered before any pricing step. */
  readonly catalog?: OnboardingCatalogPreview | null;
}

export interface OnboardingProfileBuilderState {
  readonly profileDraft?: OnboardingProfileDraft | null;
  readonly artist: OnboardingProfileArtist | null;
  readonly artistConfirmed: boolean;
  readonly handle: string | null;
  readonly socialLinks: readonly string[];
}

export const EMPTY_ONBOARDING_PROFILE_BUILDER_STATE: OnboardingProfileBuilderState =
  {
    artist: null,
    artistConfirmed: false,
    handle: null,
    socialLinks: [],
  };

/**
 * Non-artists (JOV-3379) have no Spotify match; once they pick a handle and
 * share a public profile, preview jov.ie/<handle> from those alone.
 */
export function resolvePreviewArtist(
  state: OnboardingProfileBuilderState
): OnboardingProfileArtist | null {
  const draft = state.profileDraft;
  if (draft && draft.activeRole !== 'artist') {
    const source = draft.selectedSource;
    if (!source || !draft.activeRole) return null;
    return {
      id: `source-${source.url}`,
      name:
        source.status === 'available' && source.title
          ? source.title
          : new URL(source.url).hostname,
      url: '',
      tagline: draft.outcome,
    };
  }
  if (state.artist) {
    // JOV-10169: the artist preview must never render a fabricated
    // jov.ie/your-handle identity. Between the artist pick and a known
    // handle, the rail stays empty (the shell falls back to the entry
    // preview) instead of flashing the placeholder URL and /your-handle
    // links.
    if (!state.handle) return null;
    return state.artist;
  }
  // Pen R6As7U: the draft profile is present as soon as a handle is known,
  // before any artist or link is attached.
  if (!state.handle) return null;
  return { id: `handle-${state.handle}`, name: state.handle, url: '' };
}
