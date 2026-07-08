import { headers } from 'next/headers';
import Link from 'next/link';
import { redirect } from 'next/navigation';
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

function InviteMessage({
  title,
  body,
}: {
  readonly title: string;
  readonly body: string;
}) {
  return (
    <main className='mx-auto flex min-h-screen w-full max-w-lg flex-col justify-center px-6 py-16'>
      <div className='space-y-4'>
        <h1 className='text-title font-semibold tracking-normal text-primary-token'>
          {title}
        </h1>
        <p className='text-base leading-7 text-secondary-token'>{body}</p>
        <Link
          href='/waitlist'
          className='inline-flex rounded-md border border-subtle px-3 py-2 text-sm font-medium text-primary-token outline-none transition-colors focus-visible:ring-2 focus-visible:ring-accent'
        >
          Check waitlist status
        </Link>
      </div>
    </main>
  );
}

export default async function WaitlistInvitePage({
  searchParams,
}: WaitlistInvitePageProps) {
  const { token } = await searchParams;

  if (!token) {
    return (
      <InviteMessage
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
      <InviteMessage
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

    return <InviteMessage title='Too many attempts' body={rateLimitMessage} />;
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
      <InviteMessage
        title='Invite expired'
        body='This invite link has expired. Your waitlist record is still saved, and an admin can resend a fresh invite.'
      />
    );
  }

  if (result.outcome === 'email_mismatch') {
    return (
      <InviteMessage
        title='Use the invited email'
        body='This invite belongs to a different email address. Sign in with the invited address and open the link again.'
      />
    );
  }

  return (
    <InviteMessage
      title='Invite link invalid'
      body='This invite link is not valid. Open the latest invite email or check your waitlist status.'
    />
  );
}
