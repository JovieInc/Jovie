import { notFound, redirect } from 'next/navigation';
import {
  clearLeadAttributionCookie,
  markLeadClaimPageViewedFromToken,
  setLeadAttributionCookieFromToken,
} from '@/lib/leads/funnel-events';
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

  await setLeadAttributionCookieFromToken(token);
  await markLeadClaimPageViewedFromToken(token);

  redirect(`/${username}/claim`);
}
