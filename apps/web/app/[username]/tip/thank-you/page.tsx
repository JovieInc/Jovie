import { Button } from '@jovie/ui';
import type { Metadata } from 'next';
import { headers } from 'next/headers';
import Link from 'next/link';
import { PublicPageShell } from '@/components/site/PublicPageShell';
import { NOINDEX_ROBOTS } from '@/lib/seo/noindex-metadata';
import {
  resolveTipCheckoutReturn,
  type TipCheckoutReturnState,
} from '@/lib/services/tips/checkout-return.server';

export const metadata: Metadata = {
  title: 'Payment status | Jovie',
  robots: NOINDEX_ROBOTS,
  referrer: 'no-referrer',
};

const STATUS_COPY = {
  confirmed: {
    title: 'Payment confirmed',
    description: 'Your tip payment was received. Thank you for your support.',
  },
  pending: {
    title: 'Payment not confirmed yet',
    description:
      'Your payment is not confirmed yet. Refresh this page to check again before making another payment.',
  },
  incomplete: {
    title: 'Payment not confirmed',
    description:
      'This checkout has not completed a payment. Check your payment status before trying again.',
  },
  unverified: {
    title: 'Payment not verified',
    description:
      'We could not verify a tip for this profile from this link. Check your payment status before making another payment.',
  },
  unavailable: {
    title: 'Payment status temporarily unavailable',
    description:
      'We cannot check your payment right now. Wait a moment, then refresh this page. Do not pay again while the status is unknown.',
  },
} satisfies Record<
  TipCheckoutReturnState,
  { title: string; description: string }
>;

interface TipThankYouPageProps {
  readonly params: Promise<{ username: string }>;
  readonly searchParams: Promise<{ session_id?: string | string[] }>;
}

export default async function TipThankYouPage({
  params,
  searchParams,
}: TipThankYouPageProps) {
  const [{ username }, { session_id: sessionId }, requestHeaders] =
    await Promise.all([params, searchParams, headers()]);
  const state = await resolveTipCheckoutReturn(
    username,
    sessionId,
    requestHeaders
  );
  const copy = STATUS_COPY[state];

  return (
    <PublicPageShell
      headerVariant='minimal'
      footerVariant='minimal'
      footerShowCta={false}
    >
      <section
        className='mx-auto flex w-full max-w-md flex-col items-start gap-4 px-6 py-16'
        aria-labelledby='payment-status-title'
      >
        <h1
          id='payment-status-title'
          className='text-balance text-xl font-semibold text-primary-token'
        >
          {copy.title}
        </h1>
        <p className='text-sm leading-relaxed text-secondary-token'>
          {copy.description}
        </p>
        <Button asChild variant='secondary' size='sm'>
          <Link
            href={`/${encodeURIComponent(username)}`}
            prefetch={false}
            rel='noreferrer'
          >
            Back to profile
          </Link>
        </Button>
      </section>
    </PublicPageShell>
  );
}
