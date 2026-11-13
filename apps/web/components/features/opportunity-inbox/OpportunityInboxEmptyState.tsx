'use client';

import { Button, ProgressBar } from '@jovie/ui';
import { ArrowRight, Check, Circle } from 'lucide-react';
import Link from 'next/link';
import { EmptyState } from '@/components/molecules/EmptyState';
import { APP_ROUTES } from '@/constants/routes';

export interface HomeSetupProgress {
  readonly profileComplete: boolean;
  readonly musicConnected: boolean;
  readonly linksAdded: boolean;
}

/** Home setup uses only verified profile, music and link facts. Chat history
 * is not available here, so starting a conversation is a separate next action.
 */
export function OpportunityInboxEmptyState({
  setup,
}: {
  readonly setup?: HomeSetupProgress;
}) {
  if (!setup) {
    return (
      <EmptyState
        heading='Your Inbox Is Clear'
        action={{ href: APP_ROUTES.CHAT, label: 'Start A Chat' }}
        testId='opportunity-inbox-empty-state'
      />
    );
  }

  const steps = [
    {
      label: 'Complete Your Profile',
      description: 'Add your name, photo, handle, and music.',
      complete: setup.profileComplete,
    },
    {
      label: 'Connect Your Music',
      description: 'Add Spotify or another music platform.',
      complete: setup.musicConnected,
    },
    {
      label: 'Add Your Links',
      description: 'Add the places listeners can find you.',
      complete: setup.linksAdded,
    },
  ];
  const completedCount = steps.filter(step => step.complete).length;

  return (
    <section
      aria-labelledby='home-setup-heading'
      className='w-full max-w-xl space-y-8'
      data-testid='opportunity-inbox-empty-state'
      data-home-setup='true'
    >
      <header className='space-y-2'>
        <h1
          id='home-setup-heading'
          className='text-balance text-lg font-semibold text-primary-token'
        >
          Make Jovie Yours
        </h1>
        <p className='text-pretty text-sm text-secondary-token'>
          Bring your profile, music, and plans together so Jovie can help with
          your next release.
        </p>
      </header>
      <section aria-labelledby='home-setup-checklist-heading'>
        <div className='mb-3 flex items-center justify-between gap-3'>
          <h2
            id='home-setup-checklist-heading'
            className='text-balance text-sm font-medium text-primary-token'
          >
            Your Setup
          </h2>
          <p className='text-xs tabular-nums text-secondary-token'>
            {completedCount} of {steps.length} complete
          </p>
        </div>
        <ProgressBar
          value={completedCount}
          max={steps.length}
          aria-label='Setup Completion'
        />
        <ol className='mt-3 divide-y divide-subtle'>
          {steps.map(step => (
            <li key={step.label}>
              <Link
                href={APP_ROUTES.SETTINGS_PROFILE}
                className='focus-ring-themed flex min-h-12 items-center gap-3 rounded-md py-3 hover:bg-surface-1'
              >
                {step.complete ? (
                  <Check className='size-4 shrink-0 text-success' aria-hidden />
                ) : (
                  <Circle
                    className='size-4 shrink-0 text-tertiary-token'
                    aria-hidden
                  />
                )}
                <span className='min-w-0 flex-1'>
                  <span className='block text-sm font-medium text-primary-token'>
                    {step.label}
                    {step.complete ? (
                      <span className='sr-only'> — Complete</span>
                    ) : null}
                  </span>
                  <span className='block text-pretty text-app text-secondary-token'>
                    {step.description}
                  </span>
                </span>
                <ArrowRight
                  className='size-4 shrink-0 text-tertiary-token'
                  aria-hidden
                />
              </Link>
            </li>
          ))}
        </ol>
      </section>
      <section aria-labelledby='home-chat-heading' className='space-y-3'>
        <div className='space-y-1'>
          <h2
            id='home-chat-heading'
            className='text-balance text-sm font-medium text-primary-token'
          >
            Plan Your Next Release
          </h2>
          <p className='text-pretty text-sm text-secondary-token'>
            Start with what you’re releasing, when it’s coming out, and what you
            need help with.
          </p>
        </div>
        <Button asChild variant='primary'>
          <Link href={APP_ROUTES.CHAT}>Start A Chat</Link>
        </Button>
      </section>
      <Link
        href={`${APP_ROUTES.DASHBOARD}?view=done`}
        className='focus-ring-themed inline-flex min-h-12 items-center rounded-md text-app text-secondary-token hover:text-primary-token'
      >
        View Completed Work
      </Link>
    </section>
  );
}
