'use client';

import { Button, Textarea } from '@jovie/ui';
import { RadioGroup, RadioGroupItem } from '@jovie/ui/atoms/radio-group';
import { useId } from 'react';
import {
  PROMO_SPEND_BANDS,
  type PromoSpendBand,
} from '@/lib/waitlist/role-qualification';
import { WaitlistSpotifySearch } from './WaitlistSpotifySearch';

export const QUALIFYING_STEPS = ['artist', 'growth', 'spend'] as const;
export type QualifyingStep = (typeof QUALIFYING_STEPS)[number];

/** Request access is step 1; the three questions are steps 2 to 4. */
export const QUALIFYING_STEP_COUNT = QUALIFYING_STEPS.length + 1;

export const GROWTH_ANSWER_MAX = 600;

const SPEND_LABELS: Record<PromoSpendBand, string> = {
  none: 'Nothing yet',
  under_50: 'Under $50 a month',
  '50_plus': '$50 or more a month',
};

const SPOTIFY_ARTIST_URL =
  /open\.spotify\.com\/(?:intl(?:-\w+)+\/)?artist\/([0-9A-Za-z]{22})/;

/** The Spotify artist id in a pasted or picked artist URL, or null. */
export function spotifyArtistIdFromUrl(url: string): string | null {
  return SPOTIFY_ARTIST_URL.exec(url.trim())?.[1] ?? null;
}

export interface QualifyingAnswers {
  readonly spotifyUrl: string;
  readonly artistName: string | null;
  readonly growth: string;
  readonly spend: PromoSpendBand | '';
}

/**
 * The three skippable request-access questions (Pen `request-access`,
 * 2026-11-08): which artist, the last growth attempt, and past promo spend.
 * One step shows at a time inside a fixed-height body, so the card never
 * changes size between steps.
 */
export function WaitlistQualifyingSteps({
  step,
  answers,
  submitting,
  onChange,
  onBack,
  onSkip,
}: Readonly<{
  step: QualifyingStep;
  answers: QualifyingAnswers;
  submitting: boolean;
  onChange: (next: Partial<QualifyingAnswers>) => void;
  onBack: () => void;
  onSkip: () => void;
}>) {
  const id = useId();
  const isLast = step === 'spend';

  return (
    <div
      className='flex min-h-64 w-full flex-col gap-4 text-left'
      data-testid='waitlist-qualifying-step'
      data-step={step}
    >
      <div className='flex-1 space-y-3'>
        {step === 'artist' ? (
          <>
            <p className='text-sm font-medium text-primary-token'>
              Which artist are you?
            </p>
            <WaitlistSpotifySearch
              spotifyUrl={answers.spotifyUrl}
              onUrlChange={url => onChange({ spotifyUrl: url })}
              onArtistNameChange={name => onChange({ artistName: name })}
              fieldErrors={{}}
              isSubmitting={submitting}
              isHydrating={false}
              setInputRef={() => undefined}
            />
            <p className='text-xs text-tertiary-token'>
              Not on Spotify yet? Skip this one.
            </p>
          </>
        ) : null}
        {step === 'growth' ? (
          <label className='grid gap-2' htmlFor={`${id}-growth`}>
            <span className='text-sm font-medium text-primary-token'>
              What&apos;s the last thing you did to grow your fans, and how did
              it go?
            </span>
            <Textarea
              id={`${id}-growth`}
              name='lastGrowthAttempt'
              rows={4}
              maxLength={GROWTH_ANSWER_MAX}
              value={answers.growth}
              onChange={event => onChange({ growth: event.target.value })}
              placeholder='Ran a pre-save for my last single. About 40 people signed up.'
            />
            <span className='text-right text-xs tabular-nums text-tertiary-token'>
              {answers.growth.length}/{GROWTH_ANSWER_MAX}
            </span>
          </label>
        ) : null}
        {step === 'spend' ? (
          <div className='grid gap-2'>
            <p
              id={`${id}-spend-label`}
              className='text-sm font-medium text-primary-token'
            >
              What do you pay for today to promote your music?
            </p>
            <RadioGroup
              aria-labelledby={`${id}-spend-label`}
              value={answers.spend}
              onValueChange={value =>
                onChange({ spend: value as PromoSpendBand })
              }
            >
              {PROMO_SPEND_BANDS.map(band => (
                <label
                  key={band}
                  htmlFor={`${id}-spend-${band}`}
                  className='flex min-h-11 cursor-pointer items-center gap-3 text-sm text-primary-token'
                >
                  <RadioGroupItem id={`${id}-spend-${band}`} value={band} />
                  {SPEND_LABELS[band]}
                </label>
              ))}
            </RadioGroup>
          </div>
        ) : null}
      </div>
      <div className='flex flex-col gap-2'>
        <Button type='submit' size='lg' disabled={submitting}>
          {isLast ? 'Request access' : 'Continue'}
        </Button>
        <div className='flex items-center justify-between'>
          <Button
            type='button'
            variant='ghost'
            size='sm'
            onClick={onBack}
            disabled={submitting}
          >
            Back
          </Button>
          <Button
            type='button'
            variant='ghost'
            size='sm'
            onClick={onSkip}
            disabled={submitting}
          >
            Skip
          </Button>
        </div>
      </div>
    </div>
  );
}
