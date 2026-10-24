import { describe, expect, it } from 'vitest';
import {
  classifyFeedbackMessage,
  feedbackFingerprint,
  isTasteBearing,
} from '@/lib/feedback-classification';

describe('classifyFeedbackMessage', () => {
  it('classifies defect reports as bug_verifiable', () => {
    expect(
      classifyFeedbackMessage('The publish button crashes every time')
    ).toBe('bug_verifiable');
    expect(
      classifyFeedbackMessage('Getting a 500 error on the settings page')
    ).toBe('bug_verifiable');
    expect(
      classifyFeedbackMessage('Profile image upload fails with an exception')
    ).toBe('bug_verifiable');
    expect(classifyFeedbackMessage("The save flow doesn't work")).toBe(
      'bug_verifiable'
    );
  });

  it('classifies agent context with a non-zero exit code as bug_verifiable', () => {
    expect(
      classifyFeedbackMessage('vague report', {
        source: 'agent_cli',
        context: { exitCode: 1 },
      })
    ).toBe('bug_verifiable');
  });

  it('does not match bug signals inside other words', () => {
    // 'debug' must not match the 'bug' signal; 'failsafe' must not match 'fail'
    expect(classifyFeedbackMessage('Please add a debug console toggle')).toBe(
      'feature_or_change'
    );
  });

  it('classifies requests and suggestions as feature_or_change', () => {
    expect(
      classifyFeedbackMessage('Please add dark mode to the dashboard')
    ).toBe('feature_or_change');
    expect(
      classifyFeedbackMessage('Feature request: export analytics to CSV')
    ).toBe('feature_or_change');
    expect(classifyFeedbackMessage('Could you support custom domains?')).toBe(
      'feature_or_change'
    );
  });

  it('classifies low-signal text as noise', () => {
    expect(classifyFeedbackMessage('ok')).toBe('noise');
    expect(classifyFeedbackMessage('👍')).toBe('noise');
    expect(classifyFeedbackMessage('   ')).toBe('noise');
  });

  it('routes ambiguous text to feature_or_change, never auto-ship', () => {
    expect(classifyFeedbackMessage('Thoughts on the onboarding flow?')).toBe(
      'feature_or_change'
    );
  });
});

describe('isTasteBearing', () => {
  it('flags design/copy changes as taste-bearing', () => {
    expect(isTasteBearing('Please change the font on profiles')).toBe(true);
    expect(isTasteBearing('The hero copy feels off')).toBe(true);
  });

  it('does not flag functional changes', () => {
    expect(isTasteBearing('Add CSV export')).toBe(false);
  });
});

describe('feedbackFingerprint', () => {
  it('is stable across casing and punctuation', () => {
    expect(feedbackFingerprint('The Publish button FAILS!')).toBe(
      feedbackFingerprint('the publish button fails')
    );
  });

  it('differs for different messages', () => {
    expect(feedbackFingerprint('a first report')).not.toBe(
      feedbackFingerprint('a second report')
    );
  });
});
