'use client';

import { Button, Textarea } from '@jovie/ui';
import { RadioGroup, RadioGroupItem } from '@jovie/ui/atoms/radio-group';
import { useEffect, useId, useRef, useState } from 'react';
import { formatAmountNoCents } from '@/lib/utils/format-number';
import {
  PROMO_SPEND_BANDS,
  type PromoSpendBand,
} from '@/lib/waitlist/role-qualification';
import { WaitlistSpotifySearch } from './WaitlistSpotifySearch';
import {
  type QualifyingAnswers,
  type QualifyingStep,
  spotifyArtistIdFromUrl,
} from './waitlist-qualifying';

export const GROWTH_ANSWER_MAX = 600;

/** The line between the two paid spend bands the join route stores. */
const SPEND_BAND_LINE = formatAmountNoCents(5000);

/** Shown when Continue is pressed on a link that names no Spotify artist. */
export const ARTIST_LINK_ERROR =
  'That link is not a Spotify artist. Paste one from open.spotify.com/artist, or skip.';

const SPEND_LABELS: Record<PromoSpendBand, string> = {
  none: 'Nothing yet',
  under_50: `Under ${SPEND_BAND_LINE} a month`,
  '50_plus': `${SPEND_BAND_LINE} or more a month`,
};

/**
 * The artist answer. Arriving back with an artist already picked shows that
 * pick with Change; otherwise the search stays mounted while they type or
 * paste, since the URL field updates the answer on every keystroke.
 */
function WaitlistArtistAnswer({
  answers,
  submitting,
  linkError,
  onChange,
}: Readonly<{
  answers: QualifyingAnswers;
  submitting: boolean;
  linkError: boolean;
  onChange: (next: Partial<QualifyingAnswers>) => void;
}>) {
  const [showPick, setShowPick] = useState(
    () => spotifyArtistIdFromUrl(answers.spotifyUrl) !== null
  );
  // The search opens in search mode, which hides the link field, so a
  // leftover link that names no artist is dropped on arrival rather than
  // blocking Continue with nothing on screen to fix.
  const arrival = useRef({ url: answers.spotifyUrl, onChange });
  useEffect(() => {
    const { url, onChange: change } = arrival.current;
    if (url.trim() !== '' && spotifyArtistIdFromUrl(url) === null) {
      change({ spotifyUrl: '', artistName: null });
    }
  }, []);
  if (!showPick) {
    return (
      <WaitlistSpotifySearch
        spotifyUrl={answers.spotifyUrl}
        onUrlChange={url => onChange({ spotifyUrl: url })}
        onArtistNameChange={name => onChange({ artistName: name })}
        fieldErrors={linkError ? { spotifyUrl: [ARTIST_LINK_ERROR] } : {}}
        isSubmitting={submitting}
        isHydrating={false}
        setInputRef={() => undefined}
      />
    );
  }
  return (
    <div
      className='flex min-h-11 items-center justify-between gap-3 rounded-lg border border-subtle px-3'
      data-testid='waitlist-chosen-artist'
    >
      <span className='truncate text-sm text-primary-token'>
        {answers.artistName ?? answers.spotifyUrl}
      </span>
      <Button
        type='button'
        variant='ghost'
        size='sm'
        disabled={submitting}
        onClick={() => {
          onChange({ spotifyUrl: '', artistName: null });
          setShowPick(false);
        }}
      >
        Change
      </Button>
    </div>
  );
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
  const [linkErrorShown, setLinkErrorShown] = useState(false);
  // A pasted link that names no artist (an album, a short link, a typo) would
  // otherwise be dropped without a word, so Continue stops and says so.
  const linkIsUnusable =
    step === 'artist' &&
    answers.spotifyUrl.trim() !== '' &&
    spotifyArtistIdFromUrl(answers.spotifyUrl) === null;

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
            <WaitlistArtistAnswer
              answers={answers}
              submitting={submitting}
              linkError={linkErrorShown && linkIsUnusable}
              onChange={onChange}
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
        <Button
          type='submit'
          size='lg'
          disabled={submitting}
          onClick={event => {
            if (!linkIsUnusable) return;
            event.preventDefault();
            setLinkErrorShown(true);
          }}
        >
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
