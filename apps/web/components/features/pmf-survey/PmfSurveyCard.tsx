'use client';

import { Button, RadioGroup, RadioGroupItem, Textarea } from '@jovie/ui';
import { X } from 'lucide-react';
import { type FormEvent, useId, useState } from 'react';
import { ContentSurfaceCard } from '@/components/molecules/ContentSurfaceCard';

export type PmfSurveyChoice =
  | 'very_disappointed'
  | 'somewhat_disappointed'
  | 'not_disappointed';

export interface PmfSurveyAnswer {
  readonly response: PmfSurveyChoice;
  readonly mainBenefit: string | null;
}

export type PmfSurveyCardResult = { readonly ok: boolean };

const CHOICES: readonly { value: PmfSurveyChoice; label: string }[] = [
  { value: 'very_disappointed', label: 'Very Disappointed' },
  { value: 'somewhat_disappointed', label: 'Somewhat Disappointed' },
  { value: 'not_disappointed', label: 'Not Disappointed' },
];

const BENEFIT_MAX_LENGTH = 1000;

type CardState = 'idle' | 'missing' | 'pending' | 'error' | 'done' | 'closed';

export interface PmfSurveyCardProps {
  readonly onSubmit: (answer: PmfSurveyAnswer) => Promise<PmfSurveyCardResult>;
  readonly onDismiss: () => Promise<PmfSurveyCardResult>;
  /** Story and test seam for showing a state directly. */
  readonly initialState?: Exclude<CardState, 'closed'>;
}

/**
 * One-question Sean Ellis survey on the dashboard home. Answering or
 * dismissing hides it; the server decides whether it comes back.
 */
export function PmfSurveyCard({
  onSubmit,
  onDismiss,
  initialState = 'idle',
}: PmfSurveyCardProps) {
  const questionId = useId();
  const benefitId = useId();
  const [state, setState] = useState<CardState>(initialState);
  const [choice, setChoice] = useState<PmfSurveyChoice | null>(null);
  const [benefit, setBenefit] = useState('');

  if (state === 'closed') return null;

  const dismiss = () => {
    setState('closed');
    void onDismiss().catch(() => undefined);
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (state === 'pending') return;
    if (!choice) {
      setState('missing');
      return;
    }
    setState('pending');
    try {
      const result = await onSubmit({
        response: choice,
        mainBenefit: benefit.trim() ? benefit.trim() : null,
      });
      setState(result.ok ? 'done' : 'error');
    } catch {
      setState('error');
    }
  };

  const pending = state === 'pending';

  return (
    <ContentSurfaceCard
      aria-labelledby={questionId}
      data-testid='pmf-survey-card'
      data-state={state}
      role='region'
    >
      <div className='p-4'>
        <div className='flex items-start gap-3'>
          <div className='min-w-0 flex-1'>
            <p
              className='text-sm font-semibold text-primary-token'
              id={questionId}
            >
              {state === 'done'
                ? 'Thanks for answering'
                : 'How would you feel if you could no longer use Jovie?'}
            </p>
            <p className='mt-1 text-sm text-tertiary-token'>
              {state === 'done'
                ? 'Your answer helps decide what Jovie builds next.'
                : 'One question, then it goes away.'}
            </p>
          </div>
          <Button
            aria-label='Dismiss'
            data-testid='pmf-survey-dismiss'
            onClick={state === 'done' ? () => setState('closed') : dismiss}
            size='icon-sm'
            type='button'
            variant='ghost'
          >
            <X aria-hidden='true' className='h-3 w-3' strokeWidth={2.25} />
          </Button>
        </div>

        {state === 'done' ? null : (
          <form className='mt-4' onSubmit={submit}>
            <RadioGroup
              aria-labelledby={questionId}
              disabled={pending}
              onValueChange={value => {
                setChoice(value as PmfSurveyChoice);
                if (state === 'missing') setState('idle');
              }}
              value={choice ?? ''}
            >
              {CHOICES.map(option => {
                const optionId = `${questionId}-${option.value}`;
                return (
                  <label
                    className='flex cursor-pointer items-center gap-3 rounded-lg px-2 py-2 transition-colors duration-subtle ease-subtle hover:bg-interactive-hover motion-reduce:transition-none'
                    htmlFor={optionId}
                    key={option.value}
                  >
                    <RadioGroupItem id={optionId} value={option.value} />
                    <span className='text-sm text-secondary-token'>
                      {option.label}
                    </span>
                  </label>
                );
              })}
            </RadioGroup>

            <label
              className='mt-4 block text-sm text-secondary-token'
              htmlFor={benefitId}
            >
              What is the main benefit you get?{' '}
              <span className='text-tertiary-token'>Optional</span>
            </label>
            <Textarea
              className='mt-2'
              disabled={pending}
              id={benefitId}
              maxLength={BENEFIT_MAX_LENGTH}
              onChange={event => setBenefit(event.target.value)}
              rows={3}
              value={benefit}
            />

            {state === 'missing' ? (
              <p className='mt-3 text-sm text-error' role='alert'>
                Pick an answer first.
              </p>
            ) : null}

            {state === 'error' ? (
              <p className='mt-3 text-sm text-error' role='alert'>
                Your answer was not saved. Try again.
              </p>
            ) : null}

            <div className='mt-4 flex justify-end'>
              <Button
                data-testid='pmf-survey-submit'
                disabled={pending}
                size='sm'
                type='submit'
                variant='primary'
              >
                {pending ? 'Sending' : 'Send answer'}
              </Button>
            </div>
          </form>
        )}
      </div>
    </ContentSurfaceCard>
  );
}
