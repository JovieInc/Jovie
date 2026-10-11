import { describe, expect, it } from 'vitest';
import {
  getChatEmptyStateFirstName,
  getChatEmptyStateGreetingText,
  getTimeOfDayGreeting,
  resolveChatEmptyStateInsight,
} from './chat-empty-greeting';

describe('getTimeOfDayGreeting', () => {
  it('returns Good morning before noon', () => {
    expect(getTimeOfDayGreeting(new Date('2026-01-01T00:00:00'))).toBe(
      'Good morning'
    );
    expect(getTimeOfDayGreeting(new Date('2026-01-01T11:59:00'))).toBe(
      'Good morning'
    );
  });

  it('returns Good afternoon from noon to before 6pm', () => {
    expect(getTimeOfDayGreeting(new Date('2026-01-01T12:00:00'))).toBe(
      'Good afternoon'
    );
    expect(getTimeOfDayGreeting(new Date('2026-01-01T17:59:00'))).toBe(
      'Good afternoon'
    );
  });

  it('returns Good evening from 6pm onward', () => {
    expect(getTimeOfDayGreeting(new Date('2026-01-01T18:00:00'))).toBe(
      'Good evening'
    );
    expect(getTimeOfDayGreeting(new Date('2026-01-01T23:59:00'))).toBe(
      'Good evening'
    );
  });
});

describe('getChatEmptyStateFirstName', () => {
  it('takes the first token of a real display name', () => {
    expect(getChatEmptyStateFirstName('Tim White')).toBe('Tim');
    expect(getChatEmptyStateFirstName('  Tim   White  ')).toBe('Tim');
    expect(getChatEmptyStateFirstName('Cher')).toBe('Cher');
  });

  it('never fabricates a name when none is real', () => {
    expect(getChatEmptyStateFirstName(undefined)).toBeNull();
    expect(getChatEmptyStateFirstName(null)).toBeNull();
    expect(getChatEmptyStateFirstName('')).toBeNull();
    expect(getChatEmptyStateFirstName('   ')).toBeNull();
  });
});

describe('getChatEmptyStateGreetingText', () => {
  it('joins the time-of-day greeting and first name into one sentence', () => {
    expect(
      getChatEmptyStateGreetingText('Tim', new Date('2026-01-01T09:00:00'))
    ).toBe('Good morning, Tim.');
  });

  it('degrades to a plain time-of-day sentence with no name', () => {
    expect(
      getChatEmptyStateGreetingText(null, new Date('2026-01-01T09:00:00'))
    ).toBe('Good morning.');
  });
});

describe('resolveChatEmptyStateInsight', () => {
  it('prefers a real active insight title', () => {
    expect(
      resolveChatEmptyStateInsight({
        topInsightTitle: 'Your streams are up 320% today.',
        isProfileComplete: false,
        isFirstSession: false,
      })
    ).toBe('Your streams are up 320% today.');
  });

  it('trims the insight title', () => {
    expect(
      resolveChatEmptyStateInsight({
        topInsightTitle: '  Your streams are up 320% today.  ',
        isProfileComplete: false,
        isFirstSession: false,
      })
    ).toBe('Your streams are up 320% today.');
  });

  it('falls back to the profile-ready sentence when there is no active insight', () => {
    expect(
      resolveChatEmptyStateInsight({
        topInsightTitle: null,
        isProfileComplete: true,
        isFirstSession: true,
      })
    ).toBe('Your profile is ready to share.');
  });

  it('does not use the profile-ready fallback outside first session', () => {
    expect(
      resolveChatEmptyStateInsight({
        topInsightTitle: null,
        isProfileComplete: true,
        isFirstSession: false,
      })
    ).toBeNull();
  });

  it('never fabricates an insight when the source is empty', () => {
    expect(
      resolveChatEmptyStateInsight({
        topInsightTitle: null,
        isProfileComplete: false,
        isFirstSession: false,
      })
    ).toBeNull();
    expect(
      resolveChatEmptyStateInsight({
        topInsightTitle: '   ',
        isProfileComplete: false,
        isFirstSession: false,
      })
    ).toBeNull();
    expect(
      resolveChatEmptyStateInsight({
        isProfileComplete: false,
        isFirstSession: false,
      })
    ).toBeNull();
  });
});
