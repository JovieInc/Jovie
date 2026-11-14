'use client';

import { Button, ProgressBar } from '@jovie/ui';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@jovie/ui/atoms/popover';
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

  const steps: readonly HomeSetupStep[] = [
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

  if (completedCount === steps.length) {
    return <HomeSetupComplete steps={steps} />;
  }

  return (
    <section
      aria-labelledby='home-setup-heading'
      className='w-full max-w-xl space-y-8'
      data-testid='opportunity-inbox-empty-state'
      data-home-setup='true'
      data-home-setup-state='incomplete'
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

interface HomeSetupStep {
  readonly label: string;
  readonly description: string;
  readonly complete: boolean;
}

/** Finished setup is no longer an outstanding task (JOV-12615): the checklist
 * folds into a quiet chip whose popover keeps every step one click from its
 * settings page, and the next release becomes the only call to action.
 */
function HomeSetupComplete({
  steps,
}: {
  readonly steps: readonly HomeSetupStep[];
}) {
  return (
    <section
      aria-labelledby='home-chat-heading'
      className='w-full max-w-xl space-y-8'
      data-testid='opportunity-inbox-empty-state'
      data-home-setup='true'
      data-home-setup-state='complete'
    >
      <header className='space-y-2'>
        <div className='flex items-center justify-between gap-3'>
          <h1
            id='home-chat-heading'
            className='text-balance text-lg font-semibold text-primary-token'
          >
            Plan Your Next Release
          </h1>
          <Popover>
            <PopoverTrigger asChild>
              <Button size='sm' variant='ghost'>
                <Check className='size-4 text-success' aria-hidden />
                Setup Complete
              </Button>
            </PopoverTrigger>
            <PopoverContent
              align='end'
              aria-label='Your Setup'
              className='w-72'
              testId='home-setup-complete-steps'
            >
              <ol className='divide-y divide-subtle'>
                {steps.map(step => (
                  <li key={step.label}>
                    <Link
                      href={APP_ROUTES.SETTINGS_PROFILE}
                      className='focus-ring-themed flex min-h-10 items-center gap-3 rounded-md py-2 hover:bg-surface-1'
                    >
                      <Check
                        className='size-4 shrink-0 text-success'
                        aria-hidden
                      />
                      <span className='min-w-0 flex-1 text-sm text-primary-token'>
                        {step.label}
                        <span className='sr-only'> — Complete</span>
                      </span>
                      <ArrowRight
                        className='size-4 shrink-0 text-tertiary-token'
                        aria-hidden
                      />
                    </Link>
                  </li>
                ))}
              </ol>
            </PopoverContent>
          </Popover>
        </div>
        <p className='text-pretty text-sm text-secondary-token'>
          Start with what you’re releasing, when it’s coming out, and what you
          need help with.
        </p>
      </header>
      <Button asChild variant='primary'>
        <Link href={APP_ROUTES.CHAT}>Start A Chat</Link>
      </Button>
      <div>
        <Link
          href={`${APP_ROUTES.DASHBOARD}?view=done`}
          className='focus-ring-themed inline-flex min-h-12 items-center rounded-md text-app text-secondary-token hover:text-primary-token'
        >
          View Completed Work
        </Link>
      </div>
    </section>
  );
}
