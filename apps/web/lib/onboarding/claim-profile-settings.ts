import {
  buildClaimVerificationRequest,
  readClaimVerification,
  withClaimVerification,
} from '@/lib/claim/claim-verification';
import { generateProofCode } from '@/lib/claim/proof-code';
import type { creatorProfiles } from '@/lib/db/schema/profiles';
import type { MusicFetchArtistResult } from '@/lib/dsp-enrichment/providers/musicfetch';
import type { ClaimedOnboardingState } from '@/lib/onboarding/claimed-state';

type CreatorProfile = typeof creatorProfiles.$inferSelect;

const MAX_IMPORTED_BIO_LENGTH = 2_000;

export interface HeldClaimVerification {
  readonly spotifyArtistId: string;
  readonly artistName: string | null;
  readonly reach: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function buildOnboardingSettings(
  existingSettings: unknown,
  state: ClaimedOnboardingState,
  conversationId: string,
  claimedAt: Date,
  verification: HeldClaimVerification | null,
  unproven: boolean
): Record<string, unknown> {
  const base = isRecord(existingSettings) ? existingSettings : {};
  const onboarding = isRecord(base.onboarding) ? base.onboarding : {};
  const next: Record<string, unknown> = {
    ...base,
    onboarding: {
      ...onboarding,
      claimedConversationId: conversationId,
      claimedAt: claimedAt.toISOString(),
      selectedSpotifyArtistId:
        state.artist?.id ?? verification?.spotifyArtistId ?? null,
      selectedSpotifyArtistName:
        state.artist?.name ?? verification?.artistName ?? null,
      ...(state.catalogPreview ? { catalogPreview: state.catalogPreview } : {}),
      socialLinks: [...state.socialLinks],
      interviewSignalCount: state.interviewSignals.length,
      profileDraft: state.profileDraft ?? null,
    },
  };
  if (!verification) return next;
  const existing = readClaimVerification(base);
  if (
    existing &&
    (existing.spotifyArtistId === verification.spotifyArtistId ||
      existing.paidAt !== null ||
      existing.status === 'pending_verification' ||
      existing.status === 'awaiting_payment')
  )
    return next;
  return withClaimVerification(
    next,
    buildClaimVerificationRequest({
      spotifyArtistId: verification.spotifyArtistId,
      artistName: verification.artistName,
      reach: verification.reach,
      paid: false,
      proofOnly: unproven,
      proofCode: unproven ? generateProofCode() : undefined,
      now: claimedAt,
    })
  );
}

function cleanImportedBio(bio: string | null | undefined): string | null {
  const cleaned = bio?.trim().replaceAll(/\s+/g, ' ') ?? '';
  if (!cleaned) return null;
  return cleaned.slice(0, MAX_IMPORTED_BIO_LENGTH);
}

function cleanSpotifyAvatarUrl(
  imageUrl: string | null | undefined
): string | null {
  const cleaned = imageUrl?.trim();
  if (!cleaned) return null;

  try {
    const parsed = new URL(cleaned);
    if (parsed.protocol !== 'https:') return null;
    if (
      parsed.hostname === 'i.scdn.co' ||
      parsed.hostname.endsWith('.scdn.co')
    ) {
      return parsed.toString();
    }
  } catch {
    return null;
  }

  return null;
}

export function buildImportedProfileFields({
  existingProfile,
  state,
  musicFetch,
}: {
  readonly musicFetch: MusicFetchArtistResult | null;
  readonly existingProfile: CreatorProfile | null;
  readonly state: ClaimedOnboardingState;
}): Record<string, unknown> {
  if (!state.artist) return {};

  const importedBio = cleanImportedBio(musicFetch?.bio);
  const importedAvatarUrl =
    cleanSpotifyAvatarUrl(state.artist.imageUrl) ??
    cleanSpotifyAvatarUrl(musicFetch?.image?.url);

  return {
    avatarUrl:
      existingProfile?.avatarLockedByUser && existingProfile.avatarUrl
        ? existingProfile.avatarUrl
        : (importedAvatarUrl ?? existingProfile?.avatarUrl ?? null),
    ...(importedBio && !existingProfile?.bio ? { bio: importedBio } : {}),
    spotifyId: state.artist.id,
    spotifyUrl: state.artist.url,
    spotifyFollowers: state.artist.followers,
    spotifyPopularity: state.artist.popularity,
    genres: [...state.artist.genres],
  };
}
