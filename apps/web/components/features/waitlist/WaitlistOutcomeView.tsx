'use client';

import { SignOutButton } from '@clerk/nextjs';
import { ArrowRight, CheckCircle2, Clock3, RotateCcw } from 'lucide-react';
import Link from 'next/link';
import { APP_ROUTES } from '@/constants/routes';
import { cn } from '@/lib/utils';
import type { WaitlistAccessOutcome } from '@/lib/waitlist/access-request';

interface WaitlistOutcomeViewProps {
  readonly outcome: WaitlistAccessOutcome | 'pending';
  readonly onRetry?: () => void;
}

const OUTCOME_COPY: Record<
  WaitlistOutcomeViewProps['outcome'],
  {
    readonly title: string;
    readonly body: string;
    readonly icon: typeof CheckCircle2;
    readonly actionLabel?: string;
    readonly actionHref?: string;
  }
> = {
  accepted: {
    title: 'You Have Access',
    body: 'We saved your release context. Continue setup to finish your profile and open Jovie.',
    icon: CheckCircle2,
    actionLabel: 'Continue Setup',
    actionHref: APP_ROUTES.ONBOARDING,
  },
  already_accepted: {
    title: 'You Have Access',
    body: 'Your request has already been approved. Continue setup to finish your profile.',
    icon: CheckCircle2,
    actionLabel: 'Continue Setup',
    actionHref: APP_ROUTES.ONBOARDING,
  },
  waitlisted_gate_on: {
    title: 'Request Saved',
    body: 'We saved your release context and profile details. Jovie is in a private rollout, and we will email you when access opens.',
    icon: Clock3,
  },
  waitlisted_capacity_full: {
    title: "Today's Access Is Full",
    body: "Your request is complete and saved. Today's access slots are full, so you are on the waitlist.",
    icon: Clock3,
  },
  already_waitlisted: {
    title: 'Request Already Received',
    body: 'Your request is already saved. We will keep your latest answers attached to your access request.',
    icon: Clock3,
  },
  pending: {
    title: 'You Are On The Waitlist',
    body: 'Your access request is saved. We will email you when your account is ready to continue.',
    icon: Clock3,
  },
  save_failed: {
    title: "We Couldn't Save This",
    body: 'Your answers are still on this device. Try again so we can save the transcript before reviewing access.',
    icon: RotateCcw,
  },
};

export function WaitlistOutcomeView({
  outcome,
  onRetry,
}: Readonly<WaitlistOutcomeViewProps>) {
  const copy = OUTCOME_COPY[outcome];
  const Icon = copy.icon;
  const canRetry = outcome === 'save_failed' && onRetry;

  return (
    <div className='flex min-h-dvh w-full items-center justify-center bg-[#06070a] px-4 py-8 text-white [color-scheme:dark]'>
      <main className='w-full max-w-[440px] rounded-2xl border border-white/[0.08] bg-[#0a0c0f] px-5 py-6 shadow-[0_24px_90px_rgba(0,0,0,0.38)] sm:px-6'>
        <div className='mb-5 flex items-center gap-3'>
          <span className='inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] text-white/74'>
            <Icon className='h-4 w-4' aria-hidden />
          </span>
          <h1 className='text-[20px] font-semibold leading-6 text-white'>
            {copy.title}
          </h1>
        </div>
        <p className='text-[14px] leading-6 text-white/62'>{copy.body}</p>

        <div className='mt-6 flex flex-col gap-2 sm:flex-row'>
          {copy.actionHref && copy.actionLabel ? (
            <Link
              href={copy.actionHref}
              className='inline-flex h-10 items-center justify-center gap-2 rounded-full bg-white px-4 text-[13px] font-semibold text-black transition-colors hover:bg-white/90 focus-ring-themed'
            >
              {copy.actionLabel}
              <ArrowRight className='h-3.5 w-3.5' aria-hidden />
            </Link>
          ) : null}
          {canRetry ? (
            <button
              type='button'
              onClick={onRetry}
              className='inline-flex h-10 items-center justify-center gap-2 rounded-full border border-white/[0.12] px-4 text-[13px] font-semibold text-white/86 transition-colors hover:bg-white/[0.04] focus-ring-themed'
            >
              Try Again
            </button>
          ) : null}
          {!copy.actionHref ? (
            <SignOutButton redirectUrl={APP_ROUTES.HOME}>
              <button
                type='button'
                className={cn(
                  'inline-flex h-10 items-center justify-center rounded-full border border-white/[0.12] px-4 text-[13px] font-semibold text-white/74 transition-colors hover:bg-white/[0.04] hover:text-white focus-ring-themed',
                  canRetry && 'sm:ml-auto'
                )}
              >
                Sign Out
              </button>
            </SignOutButton>
          ) : null}
        </div>
      </main>
    </div>
  );
}
