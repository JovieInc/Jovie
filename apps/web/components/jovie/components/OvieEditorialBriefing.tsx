'use client';

import { Button } from '@jovie/ui';
import type { OvieHomeBriefing } from '@/lib/ovie/home-briefing';

interface OvieEditorialBriefingProps {
  readonly briefing: OvieHomeBriefing;
  readonly onSelectAction: (prompt: string) => void;
}

export function OvieEditorialBriefing({
  briefing,
  onSelectAction,
}: OvieEditorialBriefingProps) {
  const { signal } = briefing;

  return (
    <article
      aria-labelledby='ovie-home-signal-title'
      className='mx-auto flex min-h-full w-full max-w-6xl flex-col justify-center py-3 sm:py-5'
      data-signal-id={signal.id}
      data-testid='ovie-editorial-briefing'
    >
      <div className='w-full border-y border-subtle'>
        <header className='flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-3 sm:py-4'>
          <p
            className='text-app font-medium text-primary-token'
            data-testid='ovie-home-greeting'
          >
            {briefing.greeting}
          </p>
          <p className='text-2xs text-tertiary-token'>
            {briefing.updatedLabel}
          </p>
        </header>

        <div className='grid border-t border-subtle md:grid-cols-3'>
          <div className='min-w-0 py-5 pr-0 md:col-span-2 md:py-7 md:pr-8'>
            <p className='text-2xs font-medium text-tertiary-token'>
              What Matters Right Now
            </p>
            <h2
              id='ovie-home-signal-title'
              className='mt-2 max-w-3xl text-balance text-2xl font-semibold leading-tight tracking-tight text-primary-token sm:text-3xl'
            >
              {signal.title}
            </h2>
            <p className='mt-3 max-w-2xl text-sm leading-6 text-secondary-token'>
              {signal.summary}
            </p>
            <p className='mt-4 text-xs leading-5 text-primary-token'>
              Next: {signal.nextAction}
            </p>
          </div>

          <dl className='grid content-center gap-3 border-t border-subtle py-5 md:border-t-0 md:border-l md:py-7 md:pl-6'>
            <div>
              <dt className='text-2xs text-tertiary-token'>Current Signal</dt>
              <dd className='mt-1 text-sm font-medium leading-5 text-primary-token'>
                {signal.currentValue}
              </dd>
            </div>
            {signal.delta ? (
              <div>
                <dt className='text-2xs text-tertiary-token'>Change</dt>
                <dd className='mt-1 text-xs text-secondary-token'>
                  {signal.delta}
                </dd>
              </div>
            ) : null}
            {signal.target ? (
              <div>
                <dt className='text-2xs text-tertiary-token'>Target</dt>
                <dd className='mt-1 text-xs text-secondary-token'>
                  {signal.target}
                </dd>
              </div>
            ) : null}
            <div>
              <dt className='text-2xs text-tertiary-token'>Source</dt>
              <dd className='mt-1 text-xs text-secondary-token'>
                {signal.sourceLabel}
              </dd>
            </div>
          </dl>
        </div>

        <fieldset
          className='flex min-h-14 flex-wrap items-center gap-2 border-t border-subtle py-3'
          data-testid='ovie-home-actions'
        >
          <legend className='sr-only'>Briefing Actions</legend>
          {briefing.actions.map(action => (
            <Button
              key={action.id}
              type='button'
              size='sm'
              variant='secondary'
              onClick={() => onSelectAction(action.prompt)}
            >
              {action.label}
            </Button>
          ))}
        </fieldset>
      </div>
    </article>
  );
}
