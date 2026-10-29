import { describe, expect, it } from 'vitest';
import {
  type DogfoodVerdict,
  evaluateDogfoodGate,
  evaluateOnboardingGate,
} from './dogfood-gate';

const NOW = new Date('2026-10-29T12:00:00Z');
const verdict = (
  subject: DogfoodVerdict['subject'],
  overrides: Partial<DogfoodVerdict> = {}
): DogfoodVerdict => ({
  subject,
  subjectId: subject === 'artifact' ? 'profile-1' : 'onboarding@rev',
  pass: true,
  judgedAt: new Date('2026-10-28T12:00:00Z'),
  rubricVersion: 'taste/v1',
  ...overrides,
});

describe('evaluateDogfoodGate', () => {
  it('opens only when both the artifact and onboarding passed', () => {
    expect(
      evaluateDogfoodGate({
        artifact: verdict('artifact'),
        onboarding: verdict('onboarding'),
        now: NOW,
      })
    ).toEqual({ passed: true, blocks: [] });
  });

  it('is closed with no verdicts (the judge is not bound yet)', () => {
    expect(
      evaluateDogfoodGate({ artifact: null, onboarding: null, now: NOW })
    ).toEqual({
      passed: false,
      blocks: ['onboarding_not_judged', 'artifact_not_judged'],
    });
  });

  it('blocks on a failing onboarding flow even when the page passed', () => {
    const result = evaluateDogfoodGate({
      artifact: verdict('artifact'),
      onboarding: verdict('onboarding', { pass: false }),
      now: NOW,
    });
    expect(result).toEqual({ passed: false, blocks: ['onboarding_failed'] });
  });

  it('blocks a failing or stale artifact verdict, and a verdict for the wrong subject', () => {
    expect(
      evaluateDogfoodGate({
        artifact: verdict('artifact', { pass: false }),
        onboarding: verdict('onboarding'),
        now: NOW,
      }).blocks
    ).toEqual(['artifact_failed']);
    expect(
      evaluateDogfoodGate({
        artifact: verdict('artifact', {
          judgedAt: new Date('2026-09-01T00:00:00Z'),
        }),
        onboarding: verdict('onboarding'),
        now: NOW,
      }).blocks
    ).toEqual(['artifact_stale']);
    expect(
      evaluateDogfoodGate({
        artifact: verdict('onboarding'),
        onboarding: verdict('onboarding'),
        now: NOW,
      }).blocks
    ).toEqual(['artifact_not_judged']);
  });

  it('treats a verdict from the future as stale', () => {
    expect(
      evaluateOnboardingGate(
        verdict('onboarding', { judgedAt: new Date('2026-11-01T00:00:00Z') }),
        NOW
      ).blocks
    ).toEqual(['onboarding_stale']);
  });
});
