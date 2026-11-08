import type {
  MomTestAnswers,
  PromoSpendBand,
} from '@/lib/waitlist/role-qualification';

export const QUALIFYING_STEPS = ['artist', 'growth', 'spend'] as const;
export type QualifyingStep = (typeof QUALIFYING_STEPS)[number];
export type QualifyingPosition = 'entry' | QualifyingStep;

/** Request access is step 1; the three questions are steps 2 to 4. */
export const QUALIFYING_STEP_COUNT = QUALIFYING_STEPS.length + 1;

export interface QualifyingAnswers {
  readonly spotifyUrl: string;
  readonly artistName: string | null;
  readonly growth: string;
  readonly spend: PromoSpendBand | '';
}

export const EMPTY_QUALIFYING_ANSWERS: QualifyingAnswers = {
  spotifyUrl: '',
  artistName: null,
  growth: '',
  spend: '',
};

const SPOTIFY_ARTIST_URL =
  /open\.spotify\.com\/(?:intl(?:-\w+)+\/)?artist\/([0-9A-Za-z]{22})/;

/** The Spotify artist id in a pasted or picked artist URL, or null. */
export function spotifyArtistIdFromUrl(url: string): string | null {
  return SPOTIFY_ARTIST_URL.exec(url.trim())?.[1] ?? null;
}

export function nextQualifyingStep(
  current: QualifyingPosition
): QualifyingPosition {
  if (current === 'entry') return QUALIFYING_STEPS[0];
  return QUALIFYING_STEPS[QUALIFYING_STEPS.indexOf(current) + 1] ?? current;
}

export function previousQualifyingStep(
  current: QualifyingPosition
): QualifyingPosition {
  if (current === 'entry') return current;
  const index = QUALIFYING_STEPS.indexOf(current);
  return index <= 0 ? 'entry' : QUALIFYING_STEPS[index - 1];
}

/** The 1-based step number shown in "Step N of 4". */
export function qualifyingStepNumber(current: QualifyingPosition): number {
  return current === 'entry' ? 1 : QUALIFYING_STEPS.indexOf(current) + 2;
}

/** The answers with the current step's answer cleared. */
export function clearQualifyingAnswer(
  answers: QualifyingAnswers,
  step: QualifyingStep
): QualifyingAnswers {
  if (step === 'artist')
    return { ...answers, spotifyUrl: '', artistName: null };
  if (step === 'growth') return { ...answers, growth: '' };
  return { ...answers, spend: '' };
}

/** The answers the join route takes, leaving out every skipped question. */
export function qualifyingPayload(answers: QualifyingAnswers): {
  spotifyArtistId?: string;
  momTest?: MomTestAnswers;
} {
  const spotifyArtistId = spotifyArtistIdFromUrl(answers.spotifyUrl);
  const growth = answers.growth.trim();
  const momTest: MomTestAnswers = {
    ...(growth ? { lastGrowthAttempt: growth } : {}),
    ...(answers.spend ? { promoSpend: answers.spend } : {}),
  };
  return {
    ...(spotifyArtistId ? { spotifyArtistId } : {}),
    ...(Object.keys(momTest).length > 0 ? { momTest } : {}),
  };
}

/** Which questions were answered, for the joined event. */
export function qualifyingAnsweredFlags(answers: QualifyingAnswers) {
  return {
    answered_artist: Boolean(spotifyArtistIdFromUrl(answers.spotifyUrl)),
    answered_growth: answers.growth.trim().length > 0,
    answered_spend: answers.spend !== '',
  };
}
