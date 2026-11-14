import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  resolvePmfSurveyUserId: vi.fn(),
  recordPmfSurveyAnswer: vi.fn(),
  recordPmfSurveyDismissal: vi.fn(),
  captureError: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/pmf/prompt.server', () => ({
  resolvePmfSurveyUserId: mocks.resolvePmfSurveyUserId,
}));
vi.mock('@/lib/pmf/store.server', () => ({
  PMF_MAIN_BENEFIT_MAX_LENGTH: 1000,
  recordPmfSurveyAnswer: mocks.recordPmfSurveyAnswer,
  recordPmfSurveyDismissal: mocks.recordPmfSurveyDismissal,
}));
vi.mock('@/lib/error-tracking', () => ({ captureError: mocks.captureError }));

import { dismissPmfSurvey, submitPmfSurveyAnswer } from './pmf-survey-actions';

const USER_ID = '00000000-0000-4000-8000-000000000001';

describe('pmf survey actions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.resolvePmfSurveyUserId.mockResolvedValue(USER_ID);
    mocks.recordPmfSurveyAnswer.mockResolvedValue({ stored: true });
    mocks.recordPmfSurveyDismissal.mockResolvedValue({ stored: true });
  });

  it('stores a valid answer for the eligible signed-in user', async () => {
    await expect(
      submitPmfSurveyAnswer({
        response: 'somewhat_disappointed',
        mainBenefit: 'Fans find my releases',
      })
    ).resolves.toEqual({ ok: true });
    expect(mocks.recordPmfSurveyAnswer).toHaveBeenCalledWith({
      userId: USER_ID,
      response: 'somewhat_disappointed',
      mainBenefit: 'Fans find my releases',
      now: expect.any(Date),
    });
  });

  it('rejects an unknown answer without touching storage', async () => {
    await expect(
      submitPmfSurveyAnswer({ response: 'thrilled', mainBenefit: null })
    ).resolves.toEqual({ ok: false, error: 'invalid' });
    expect(mocks.resolvePmfSurveyUserId).not.toHaveBeenCalled();
    expect(mocks.recordPmfSurveyAnswer).not.toHaveBeenCalled();
  });

  it('writes nothing when the prompt is not due, the flag is off or an admin impersonates', async () => {
    mocks.resolvePmfSurveyUserId.mockResolvedValue(null);
    await expect(
      submitPmfSurveyAnswer({
        response: 'very_disappointed',
        mainBenefit: null,
      })
    ).resolves.toEqual({ ok: false, error: 'unavailable' });
    await expect(dismissPmfSurvey()).resolves.toEqual({
      ok: false,
      error: 'unavailable',
    });
    expect(mocks.recordPmfSurveyAnswer).not.toHaveBeenCalled();
    expect(mocks.recordPmfSurveyDismissal).not.toHaveBeenCalled();
  });

  it('records a dismissal', async () => {
    await expect(dismissPmfSurvey()).resolves.toEqual({ ok: true });
    expect(mocks.recordPmfSurveyDismissal).toHaveBeenCalledWith({
      userId: USER_ID,
      now: expect.any(Date),
    });
  });

  it('reports a failed write instead of throwing', async () => {
    mocks.recordPmfSurveyAnswer.mockRejectedValue(new Error('db down'));
    await expect(
      submitPmfSurveyAnswer({ response: 'not_disappointed', mainBenefit: null })
    ).resolves.toEqual({ ok: false, error: 'unavailable' });
    expect(mocks.captureError).toHaveBeenCalledOnce();
  });
});
