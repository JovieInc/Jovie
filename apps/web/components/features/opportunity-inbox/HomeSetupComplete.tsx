'use client';

import { Button } from '@jovie/ui';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@jovie/ui/atoms/popover';
import { ArrowRight, Check } from 'lucide-react';
import Link from 'next/link';
import { APP_ROUTES } from '@/constants/routes';

export interface HomeSetupStep {
  readonly label: string;
  readonly description: string;
  readonly complete: boolean;
}

/** Finished setup is no longer an outstanding task (JOV-12615): the checklist
 * folds into a quiet chip whose popover keeps every step one click from its
 * settings page, and the next release becomes the only call to action.
 */
export function HomeSetupComplete({
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
                      className='flex min-h-10 items-center gap-3 rounded-md py-2 hover:bg-surface-1'
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
          className='inline-flex min-h-12 items-center rounded-md text-app text-secondary-token hover:text-primary-token'
        >
          View Completed Work
        </Link>
      </div>
    </section>
  );
}
