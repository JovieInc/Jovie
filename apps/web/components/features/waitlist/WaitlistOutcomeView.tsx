'use client';

import { ArrowRight, CheckCircle2, Clock3, RotateCcw } from 'lucide-react';
import Link from 'next/link';
import { APP_ROUTES } from '@/constants/routes';
import { useAuthSafe } from '@/hooks/useClerkSafe';
import { cn } from '@/lib/utils';
import type { WaitlistAccessOutcome } from '@/lib/waitlist/access-request';

export type WaitlistDisplayOutcome =
  | WaitlistAccessOutcome
  | 'pending'
  | 'rate_limited';

interface WaitlistOutcomeViewProps {
  readonly outcome: WaitlistDisplayOutcome;
  readonly onRetry?: () => void;
  /** Confirmed email already collected — required before email promises. */
  readonly confirmedEmail?: string | null;
}

function buildOutcomeCopy(hasConfirmedEmail: boolean): Record<
  WaitlistDisplayOutcome,
  {
    readonly title: string;
    readonly body: string;
    readonly icon: typeof CheckCircle2;
    readonly actionLabel?: string;
    readonly actionHref?: string;
  }
> {
  const emailWhenReady = hasConfirmedEmail
    ? ' We will email you when access opens.'
    : ' Add an email on your account if you want a heads-up when access opens.';

  return {
    accepted: {
      title: 'You Have Access',
      body: 'We saved your release context. Continue setup to finish your profile and open Jovie.',
      icon: CheckCircle2,
      actionLabel: 'Continue Setup',
      actionHref: APP_ROUTES.START,
    },
    already_accepted: {
      title: 'You Have Access',
      body: 'Your request has already been approved. Continue setup to finish your profile.',
      icon: CheckCircle2,
      actionLabel: 'Continue Setup',
      actionHref: APP_ROUTES.START,
    },
    waitlisted_gate_on: {
      title: 'Request Saved',
      body: `We saved your release context and profile details. Jovie is in a private rollout.${emailWhenReady}`,
      icon: Clock3,
    },
    waitlisted_capacity_full: {
      title: "Today's Access Is Full",
      body: `Your request is complete and saved. Today's access slots are full, so you are on the waitlist.${
        hasConfirmedEmail ? emailWhenReady : ''
      }`,
      icon: Clock3,
    },
    already_waitlisted: {
      title: 'Request Already Received',
      body: 'Your request is already saved. We will keep your latest answers attached to your access request.',
      icon: Clock3,
    },
    pending: {
      title: "You're on the list",
      body: hasConfirmedEmail
        ? "We'll email you when your account is ready."
        : 'Your request is saved. Add an email on your account if you want a heads-up when access opens.',
      icon: Clock3,
    },
    save_failed: {
      title: "We Couldn't Save This",
      body: 'Your answers are still on this device. Try again so we can save the required fields before reviewing access.',
      icon: RotateCcw,
    },
    rate_limited: {
      title: 'Too Many Attempts',
      body: 'Please wait a moment before trying again. Your answers are still on this device.',
      icon: Clock3,
    },
  };
}

export function WaitlistOutcomeView({
  outcome,
  onRetry,
  confirmedEmail = null,
}: Readonly<WaitlistOutcomeViewProps>) {
  const hasConfirmedEmail = Boolean(
    confirmedEmail && confirmedEmail.includes('@')
  );
  const copy = buildOutcomeCopy(hasConfirmedEmail)[outcome];
  const Icon = copy.icon;
  const canRetry =
    (outcome === 'save_failed' || outcome === 'rate_limited') && onRetry;
  const { signOut } = useAuthSafe();

  return (
    <section className='w-full rounded-2xl border border-white/[0.08] bg-(--color-bg-surface-0) px-5 py-6 text-primary-token shadow-[0_24px_90px_rgba(0,0,0,0.38)] sm:px-6'>
      <div className='mb-5 flex items-center gap-3'>
        <span className='inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] text-white/74'>
          <Icon className='h-4 w-4' aria-hidden />
        </span>
        <h1 className='text-xl font-semibold leading-6 text-primary-token'>
          {copy.title}
        </h1>
      </div>
      <p className='text-sm leading-6 text-white/62'>{copy.body}</p>

      <div className='mt-6 flex flex-col gap-2 sm:flex-row'>
        {copy.actionHref && copy.actionLabel ? (
          <Link
            href={copy.actionHref}
            className='inline-flex h-10 items-center justify-center gap-2 rounded-full bg-white px-4 text-app font-semibold text-black transition-colors hover:bg-white/90 focus-ring-themed dark:bg-white dark:text-black'
          >
            {copy.actionLabel}
            <ArrowRight className='h-3.5 w-3.5' aria-hidden />
          </Link>
        ) : null}
        {canRetry ? (
          <button
            type='button'
            onClick={onRetry}
            className='inline-flex h-10 items-center justify-center gap-2 rounded-full border border-white/[0.12] px-4 text-app font-semibold text-white/86 transition-colors hover:bg-white/[0.04] focus-ring-themed'
          >
            Try Again
          </button>
        ) : null}
        {copy.actionHref ? null : (
          <button
            type='button'
            onClick={() => {
              void signOut({ redirectUrl: APP_ROUTES.HOME });
            }}
            className={cn(
              'inline-flex h-10 items-center justify-center rounded-full border border-white/[0.12] px-4 text-app font-semibold text-white/74 transition-colors hover:bg-white/[0.04] hover:text-white focus-ring-themed',
              canRetry && 'sm:ml-auto'
            )}
          >
            Sign Out
          </button>
        )}
      </div>
    </section>
  );
}
