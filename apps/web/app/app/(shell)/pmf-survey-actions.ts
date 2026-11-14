'use server';

import { z } from 'zod';
import { PMF_SURVEY_RESPONSES } from '@/lib/db/schema/pmf-survey';
import { captureError } from '@/lib/error-tracking';
import { resolvePmfSurveyUserId } from '@/lib/pmf/prompt.server';
import {
  PMF_MAIN_BENEFIT_MAX_LENGTH,
  recordPmfSurveyAnswer,
  recordPmfSurveyDismissal,
} from '@/lib/pmf/store.server';

export type PmfSurveyActionResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly error: 'unavailable' | 'invalid' };

const answerSchema = z.object({
  response: z.enum(PMF_SURVEY_RESPONSES),
  mainBenefit: z.string().max(PMF_MAIN_BENEFIT_MAX_LENGTH).nullable(),
});

const ROUTE = 'app/app/(shell)/pmf-survey-actions';

/** Store the signed-in user's answer when the prompt is due for them. */
export async function submitPmfSurveyAnswer(
  input: unknown
): Promise<PmfSurveyActionResult> {
  const parsed = answerSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'invalid' };
  try {
    const now = new Date();
    const userId = await resolvePmfSurveyUserId({ now });
    if (!userId) return { ok: false, error: 'unavailable' };
    const result = await recordPmfSurveyAnswer({
      userId,
      response: parsed.data.response,
      mainBenefit: parsed.data.mainBenefit,
      now,
    });
    return result.stored ? { ok: true } : { ok: false, error: 'unavailable' };
  } catch (error) {
    await captureError('pmf-survey: answer write failed', error, {
      route: ROUTE,
    });
    return { ok: false, error: 'unavailable' };
  }
}

/** Count a dismissal; the prompt may come back once, 14 days later. */
export async function dismissPmfSurvey(): Promise<PmfSurveyActionResult> {
  try {
    const now = new Date();
    const userId = await resolvePmfSurveyUserId({ now });
    if (!userId) return { ok: false, error: 'unavailable' };
    const result = await recordPmfSurveyDismissal({ userId, now });
    return result.stored ? { ok: true } : { ok: false, error: 'unavailable' };
  } catch (error) {
    await captureError('pmf-survey: dismissal write failed', error, {
      route: ROUTE,
    });
    return { ok: false, error: 'unavailable' };
  }
}
