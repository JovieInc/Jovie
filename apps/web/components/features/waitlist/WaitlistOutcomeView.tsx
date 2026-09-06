'use client';

import { Button } from '@jovie/ui';
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
  /** Known contact email for the receipt (optional). */
  readonly email?: string | null;
}

type OutcomeCopy = {
  readonly title: string;
  /** Body may depend on whether a contact email is known (never invent one). */
  readonly body: (hasEmail: boolean) => string;
  readonly icon: typeof CheckCircle2;
  readonly actionLabel?: string;
  readonly actionHref?: string;
  readonly showNextSteps?: boolean;
};

const OUTCOME_COPY: Record<WaitlistOutcomeViewProps['outcome'], OutcomeCopy> = {
  accepted: {
    title: 'You Have Access',
    body: () =>
      'We saved your release context. Continue setup to finish your profile and open Jovie.',
    icon: CheckCircle2,
    actionLabel: 'Continue Setup',
    actionHref: APP_ROUTES.START,
  },
  already_accepted: {
    title: 'You Have Access',
    body: () =>
      'Your request has already been approved. Continue setup to finish your profile.',
    icon: CheckCircle2,
    actionLabel: 'Continue Setup',
    actionHref: APP_ROUTES.START,
  },
  waitlisted_gate_on: {
    title: 'Request Saved',
    body: hasEmail =>
      hasEmail
        ? 'Jovie is in a private rollout. We saved your release context and will email you when access opens — usually within a few days of capacity.'
        : 'Jovie is in a private rollout. We saved your release context. Return to /start when a spot opens — usually within a few days of capacity.',
    icon: Clock3,
    showNextSteps: true,
  },
  waitlisted_capacity_full: {
    title: "Today's Access Is Full",
    body: hasEmail =>
      hasEmail
        ? "Your request is saved. Today's slots are full, so you are on the waitlist. We email when a spot opens."
        : "Your request is saved. Today's slots are full, so you are on the waitlist. Check back via /start when capacity opens.",
    icon: Clock3,
    showNextSteps: true,
  },
  already_waitlisted: {
    title: 'Request Already Received',
    body: hasEmail =>
      hasEmail
        ? 'Your request is already saved with your latest answers. Watch for an email when access opens.'
        : 'Your request is already saved with your latest answers. Return via /start when access opens.',
    icon: Clock3,
    showNextSteps: true,
  },
  pending: {
    title: "You're on the list",
    body: hasEmail =>
      hasEmail
        ? "Request saved. We'll email you when a spot opens — typically within a few days of capacity."
        : 'Request saved. Return via /start when a spot opens — typically within a few days of capacity.',
    icon: Clock3,
    showNextSteps: true,
  },
  save_failed: {
    title: "We Couldn't Save This",
    body: () =>
      'Your answers are still on this device. Try again so we can save the required fields before reviewing access.',
    icon: RotateCcw,
  },
  rate_limited: {
    title: 'Too Many Attempts',
    body: () =>
      'Please wait a moment before trying again. Your answers are still on this device.',
    icon: Clock3,
  },
};

function NextSteps({ email }: { readonly email?: string | null }) {
  const knownEmail = email?.trim() || null;
  const contactLine = knownEmail
    ? `Watch ${knownEmail} for the access email.`
    : 'Add a contact email at sign-in if you want a heads-up when access opens.';

  return (
    <ol
      className='mt-4 list-decimal space-y-1.5 pl-5 text-sm leading-6 text-white/62'
      data-testid='waitlist-next-steps'
    >
      <li>{contactLine}</li>
      <li>Expected timing: a few days once capacity opens — not instant.</li>
      <li>
        Resume anytime at{' '}
        <Link
          href={APP_ROUTES.START}
          className='font-medium text-white/86 underline-offset-2 hover:underline'
        >
          /start
        </Link>{' '}
        or the waitlist page; your context stays attached to this request.
      </li>
    </ol>
  );
}

function PrimaryCtaLink({
  href,
  label,
  testId,
}: {
  readonly href: string;
  readonly label: string;
  readonly testId?: string;
}) {
  return (
    <Button asChild variant='primary' size='lg'>
      <Link href={href} data-testid={testId}>
        {label}
        <ArrowRight className='h-3.5 w-3.5' aria-hidden />
      </Link>
    </Button>
  );
}

export function WaitlistOutcomeView({
  outcome,
  onRetry,
  email,
}: Readonly<WaitlistOutcomeViewProps>) {
  const copy = OUTCOME_COPY[outcome];
  const Icon = copy.icon;
  const hasEmail = Boolean(email?.trim());
  const body = copy.body(hasEmail);
  const canRetry =
    (outcome === 'save_failed' || outcome === 'rate_limited') && onRetry;
  const { signOut } = useAuthSafe();
  const primaryHref = copy.actionHref;
  const primaryLabel = copy.actionLabel;
  const showResumeCta = Boolean(copy.showNextSteps && !primaryHref);

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
      <p className='text-sm leading-6 text-white/62'>{body}</p>
      {copy.showNextSteps ? <NextSteps email={email} /> : null}

      <div className='mt-6 flex flex-col gap-2 sm:flex-row'>
        {primaryHref && primaryLabel ? (
          <PrimaryCtaLink href={primaryHref} label={primaryLabel} />
        ) : null}
        {showResumeCta ? (
          <PrimaryCtaLink
            href={APP_ROUTES.START}
            label='Resume At Start'
            testId='waitlist-resume-start'
          />
        ) : null}
        {canRetry ? (
          <Button type='button' onClick={onRetry} variant='secondary' size='lg'>
            Try Again
          </Button>
        ) : null}
        {primaryHref || copy.showNextSteps ? null : (
          <Button
            type='button'
            onClick={() => {
              void signOut({ redirectUrl: APP_ROUTES.HOME });
            }}
            variant='secondary'
            size='lg'
            className={cn(
              'text-white/74 hover:text-white',
              canRetry && 'sm:ml-auto'
            )}
          >
            Sign Out
          </Button>
        )}
      </div>
    </section>
  );
}
