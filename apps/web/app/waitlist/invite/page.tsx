import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { WaitlistInviteMessage } from '@/components/features/waitlist/WaitlistInviteMessage';
import { APP_ROUTES } from '@/constants/routes';
import { getCachedAuth, getCachedCurrentUser } from '@/lib/auth/cached';
import {
  enforceOnboardingRateLimit,
  getOnboardingRateLimitMessage,
} from '@/lib/onboarding/rate-limit';
import { extractClientIP } from '@/lib/utils/ip-extraction';
import { redeemWaitlistInviteToken } from '@/lib/waitlist/redeem';

interface WaitlistInvitePageProps {
  readonly searchParams: Promise<{ token?: string }>;
}

export default async function WaitlistInvitePage({
  searchParams,
}: WaitlistInvitePageProps) {
  const { token } = await searchParams;

  if (!token) {
    return (
      <WaitlistInviteMessage
        title='Invite link missing'
        body='This invite link is missing its secure token. Open the latest invite email and try again.'
      />
    );
  }

  const { userId } = await getCachedAuth();
  if (!userId) {
    const redirectUrl = `/waitlist/invite?token=${encodeURIComponent(token)}`;
    redirect(`/signin?redirect_url=${encodeURIComponent(redirectUrl)}`);
  }

  const currentUser = await getCachedCurrentUser();
  const verifiedEmails =
    currentUser?.emailAddresses
      ?.map(e => e.emailAddress)
      .filter(email => email.trim().length > 0) ?? [];

  if (verifiedEmails.length === 0) {
    return (
      <WaitlistInviteMessage
        title='Verify your email'
        body='Sign in with the same verified email address that received this invite, then open the link again.'
      />
    );
  }

  const requestHeaders = await headers();
  try {
    await enforceOnboardingRateLimit({
      userId,
      ip: extractClientIP(requestHeaders),
      checkIP: true,
    });
  } catch (error) {
    const rateLimitMessage = getOnboardingRateLimitMessage(error);
    if (!rateLimitMessage) throw error;

    return (
      <WaitlistInviteMessage
        title='Too many attempts'
        body={rateLimitMessage}
      />
    );
  }

  const result = await redeemWaitlistInviteToken({
    token,
    clerkUserId: userId,
    verifiedEmails,
  });

  if (result.outcome === 'approved') {
    redirect(`${APP_ROUTES.START}?fresh_signup=true`);
  }

  if (result.outcome === 'signed_up') {
    redirect('/app');
  }

  if (result.outcome === 'expired') {
    return (
      <WaitlistInviteMessage
        title='Invite expired'
        body='This invite link has expired. Your waitlist record is still saved, and an admin can resend a fresh invite.'
      />
    );
  }

  if (result.outcome === 'email_mismatch') {
    return (
      <WaitlistInviteMessage
        title='Use the invited email'
        body='This invite belongs to a different email address. Sign in with the invited address and open the link again.'
      />
    );
  }

  return (
    <WaitlistInviteMessage
      title='Invite link invalid'
      body='This invite link is not valid. Open the latest invite email or check your waitlist status.'
    />
  );
}
