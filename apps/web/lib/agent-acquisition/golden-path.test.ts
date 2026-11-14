import { describe, expect, it } from 'vitest';

import {
  answerQuestionSchema,
  claimHandleSchema,
  GOLDEN_PATH_QUESTIONS,
  GOLDEN_PATH_TOOL_NAMES,
  GOLDEN_PATH_WAITLIST_COPY,
  presentGoldenPathQualification,
  shareProfileSchema,
  shareTextFor,
} from './golden-path';

describe('golden-path locked copy', () => {
  it('uses the locked not-qualified line verbatim', () => {
    expect(GOLDEN_PATH_WAITLIST_COPY).toBe(
      'Your handle is reserved. You’re on the waitlist.'
    );
  });

  it('asks the onboarding Mom Test questions verbatim', () => {
    expect(GOLDEN_PATH_QUESTIONS.map(question => question.id)).toEqual([
      'lastGrowthAttempt',
      'promoSpend',
    ]);
    expect(GOLDEN_PATH_QUESTIONS[0]?.question).toBe(
      "What's the last thing you did to grow your fans, and how did it go?"
    );
    expect(GOLDEN_PATH_QUESTIONS[1]?.question).toBe(
      'What do you pay each month to promote your music?'
    );
  });
});

describe('presentGoldenPathQualification', () => {
  it('maps an admit to qualified without the waitlist line', () => {
    const view = presentGoldenPathQualification({
      admit: true,
      reason: 'admit_resolved_artist',
    });
    expect(view).toEqual({
      status: 'qualified',
      reason: 'admit_resolved_artist',
      message: null,
      requiresVerification: false,
    });
  });

  it('maps every hold to queued with the locked copy', () => {
    for (const reason of [
      'hold_golden_path_not_green',
      'hold_capacity_full',
      'hold_reach_unknown',
      'hold_open_learnings',
    ]) {
      const view = presentGoldenPathQualification({ admit: false, reason });
      expect(view.status).toBe('queued');
      expect(view.reason).toBe(reason);
      expect(view.message).toBe(GOLDEN_PATH_WAITLIST_COPY);
    }
  });
});

describe('golden-path tool surface', () => {
  it('exposes the seven founder-ordered steps in order', () => {
    expect(GOLDEN_PATH_TOOL_NAMES).toEqual([
      'claim_handle',
      'answer_onboarding_question',
      'get_qualification',
      'build_profile',
      'publish_profile',
      'share_profile',
      'start_upgrade',
    ]);
  });
});

describe('golden-path input schemas', () => {
  const draftRef = {
    draft_id: '9efebd98-39b7-4a77-8965-04b5aafad9ad',
    draft_token: 'x'.repeat(100),
  };

  it('accepts a claim_handle input with a handle', () => {
    expect(
      claimHandleSchema.safeParse({ ...draftRef, handle: ' radiohead ' })
        .success
    ).toBe(true);
    expect(claimHandleSchema.safeParse({ ...draftRef }).success).toBe(false);
  });

  it('accepts both Mom Test answer shapes and rejects junk', () => {
    expect(
      answerQuestionSchema.safeParse({
        ...draftRef,
        question: 'lastGrowthAttempt',
        answer: 'Ran a pre-save. 40 signups.',
      }).success
    ).toBe(true);
    expect(
      answerQuestionSchema.safeParse({
        ...draftRef,
        question: 'promoSpend',
        answer: 'under_50',
      }).success
    ).toBe(true);
    expect(
      answerQuestionSchema.safeParse({
        ...draftRef,
        question: 'promoSpend',
        answer: 'all the money',
      }).success
    ).toBe(false);
    expect(
      answerQuestionSchema.safeParse({
        ...draftRef,
        question: 'lastGrowthAttempt',
        answer: '',
      }).success
    ).toBe(false);
  });

  it('keeps share_profile read-only shaped', () => {
    expect(
      shareProfileSchema.safeParse({ username: 'radiohead' }).success
    ).toBe(true);
    expect(shareProfileSchema.safeParse({}).success).toBe(false);
  });
});

describe('shareTextFor', () => {
  it('returns a factual share line without invented claims', () => {
    expect(shareTextFor('Signal Artist', 'https://jov.ie/signalartist')).toBe(
      'Signal Artist on Jovie: https://jov.ie/signalartist'
    );
  });

  it('falls back to a neutral subject when the name is blank', () => {
    expect(shareTextFor('  ', 'https://jov.ie/x')).toBe(
      'This artist on Jovie: https://jov.ie/x'
    );
  });
});
