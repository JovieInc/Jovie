import { eq } from 'drizzle-orm';
import { type Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { BASE_URL } from '@/constants/app';
import { APP_ROUTES } from '@/constants/routes';
import { getOptionalAuth } from '@/lib/auth/cached';
import {
  clearPendingClaimContext,
  readPendingClaimContext,
  writePendingClaimContext,
} from '@/lib/claim/context';
import { db } from '@/lib/db';
import { users } from '@/lib/db/schema/auth';
import {
  clearLeadAttributionCookie,
  lookupLeadByClaimToken,
  markLeadClaimPageViewedFromToken,
  setLeadAttributionCookieFromToken,
} from '@/lib/leads/funnel-events';
import { hashClaimToken } from '@/lib/security/claim-token';
import {
  getProfileByUsername,
  isClaimTokenValid,
} from '@/lib/services/profile';
import {
  USERNAME_MAX_LENGTH,
  USERNAME_PATTERN,
} from '@/lib/validation/username-core';

interface Props {
  readonly params: Promise<{ readonly username: string }>;
  readonly searchParams?: Promise<{
    readonly next?: string;
    readonly token?: string;
  }>;
}

function getCanonicalSpotifyUrl(profile: {
  spotifyId: string | null;
  spotifyUrl: string | null;
}): string | null {
  if (profile.spotifyUrl) {
    return profile.spotifyUrl;
  }

  if (!profile.spotifyId) {
    return null;
  }

  return `https://open.spotify.com/artist/${encodeURIComponent(profile.spotifyId)}`;
}

async function hasActiveCreatorProfile(clerkUserId: string): Promise<boolean> {
  const [user] = await db
    .select({ activeProfileId: users.activeProfileId })
    .from(users)
    .where(eq(users.clerkId, clerkUserId))
    .limit(1);

  return Boolean(user?.activeProfileId);
}

function buildAuthStartPath(params: {
  username: string;
  spotifyArtistName: string;
  spotifyUrl: string | null;
  isSignedIn: boolean;
}): string {
  const onboardingParams = new URLSearchParams({
    handle: params.username,
  });

  if (params.isSignedIn) {
    return `${APP_ROUTES.ONBOARDING}?${onboardingParams.toString()}`;
  }

  const signUpParams = new URLSearchParams({
    handle: params.username,
    redirect_url: `${APP_ROUTES.ONBOARDING}?${onboardingParams.toString()}`,
  });

  if (params.spotifyUrl) {
    signUpParams.set('spotify_url', params.spotifyUrl);
    signUpParams.set('artist_name', params.spotifyArtistName);
  }

  return `${APP_ROUTES.SIGNUP}?${signUpParams.toString()}`;
}

export default async function ClaimPage({ params, searchParams }: Props) {
  const { username } = await params;
  const resolvedSearchParams = await searchParams;
  const normalizedUsername = username.toLowerCase();

  if (
    username.length > USERNAME_MAX_LENGTH ||
    !USERNAME_PATTERN.test(username)
  ) {
    notFound();
  }

  const profile = await getProfileByUsername(normalizedUsername);

  if (!profile) {
    redirect('/');
  }

  const { userId } = await getOptionalAuth();
  if (userId && (await hasActiveCreatorProfile(userId))) {
    redirect(APP_ROUTES.DASHBOARD);
  }

  const existingPendingClaim = await readPendingClaimContext({
    username: profile.usernameNormalized,
  });
  const claimPreviewUrl = `/${profile.usernameNormalized}?claim=1`;

  const token = resolvedSearchParams?.token?.trim();
  if (token) {
    const isValid = await isClaimTokenValid(profile.usernameNormalized, token);
    if (isValid) {
      const lead = await lookupLeadByClaimToken(token);
      await setLeadAttributionCookieFromToken(token);
      await markLeadClaimPageViewedFromToken(token);
      await writePendingClaimContext({
        mode: 'token_backed',
        creatorProfileId: profile.id,
        username: profile.usernameNormalized,
        claimTokenHash: await hashClaimToken(token),
        leadId: lead?.id ?? null,
        expectedSpotifyArtistId: profile.spotifyId ?? null,
      });

      if (resolvedSearchParams?.next === 'auth') {
        redirect(
          buildAuthStartPath({
            username: profile.usernameNormalized,
            spotifyArtistName: profile.displayName ?? profile.username,
            spotifyUrl: getCanonicalSpotifyUrl(profile),
            isSignedIn: Boolean(userId),
          })
        );
      }

      redirect(claimPreviewUrl);
    }

    await clearLeadAttributionCookie();
    await clearPendingClaimContext();
    redirect(claimPreviewUrl);
  }

  if (resolvedSearchParams?.next === 'auth') {
    if (profile.isClaimed) {
      await clearPendingClaimContext();
      redirect(`/${profile.usernameNormalized}`);
    }

    if (
      existingPendingClaim &&
      existingPendingClaim.creatorProfileId === profile.id &&
      existingPendingClaim.username === profile.usernameNormalized
    ) {
      redirect(
        buildAuthStartPath({
          username: profile.usernameNormalized,
          spotifyArtistName: profile.displayName ?? profile.username,
          spotifyUrl: getCanonicalSpotifyUrl(profile),
          isSignedIn: Boolean(userId),
        })
      );
    }

    if (!profile.spotifyId) {
      redirect(`/${profile.usernameNormalized}?claim=unsupported`);
    }

    await writePendingClaimContext({
      mode: 'direct_profile',
      creatorProfileId: profile.id,
      username: profile.usernameNormalized,
      expectedSpotifyArtistId: profile.spotifyId,
    });

    redirect(
      buildAuthStartPath({
        username: profile.usernameNormalized,
        spotifyArtistName: profile.displayName ?? profile.username,
        spotifyUrl: getCanonicalSpotifyUrl(profile),
        isSignedIn: Boolean(userId),
      })
    );
  }

  redirect(
    profile.isClaimed ? `/${profile.usernameNormalized}` : claimPreviewUrl
  );
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { username } = await params;

  return {
    title: `Claim Your Profile - @${username}`,
    robots: { index: false, follow: false },
    alternates: { canonical: `${BASE_URL}/${username}` },
    other: { referrer: 'no-referrer' },
  };
}
