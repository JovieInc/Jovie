import { notFound, redirect } from 'next/navigation';
import { writePendingClaimContext } from '@/lib/claim/context';
import {
  clearLeadAttributionCookie,
  lookupLeadByClaimToken,
  markLeadClaimPageViewedFromToken,
  setLeadAttributionCookieFromToken,
} from '@/lib/leads/funnel-events';
import { hashClaimToken } from '@/lib/security/claim-token';
import { getProfileByUsername } from '@/lib/services/profile';
import {
  isClaimTokenValid,
  lookupUsernameByClaimToken,
} from '@/lib/services/profile/queries';

interface ClaimTokenPageProps {
  readonly params: Promise<{ readonly token: string }>;
}

export default async function ClaimTokenPage({ params }: ClaimTokenPageProps) {
  const { token } = await params;

  if (!token) {
    notFound();
  }

  const username = await lookupUsernameByClaimToken(token);
  if (!username) {
    await clearLeadAttributionCookie();
    notFound();
  }

  const isValid = await isClaimTokenValid(username, token);
  if (!isValid) {
    await clearLeadAttributionCookie();
    notFound();
  }

  const profile = await getProfileByUsername(username);
  if (!profile) {
    await clearLeadAttributionCookie();
    notFound();
  }

  const lead = await lookupLeadByClaimToken(token);
  const claimTokenHash = await hashClaimToken(token);

  await setLeadAttributionCookieFromToken(token);
  await markLeadClaimPageViewedFromToken(token);
  await writePendingClaimContext({
    mode: 'token_backed',
    creatorProfileId: profile.id,
    username: profile.usernameNormalized,
    claimTokenHash,
    leadId: lead?.id ?? null,
    expectedSpotifyArtistId: profile.spotifyId ?? null,
  });

  redirect(`/${profile.usernameNormalized}?claim=1`);
}
