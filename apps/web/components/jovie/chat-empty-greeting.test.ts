import { describe, expect, it } from 'vitest';
import {
  type ChatEmptyStateResult,
  chatEmptyStateResultActionLabel,
  chatEmptyStateResultProblem,
  findChoreWording,
  getChatEmptyStateFirstName,
  getChatEmptyStateGreetingText,
  getTimeOfDayGreeting,
  selectChatEmptyStateResult,
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
  });

  it('greets a band or artist by the whole name, never its first word', () => {
    expect(getChatEmptyStateFirstName('Good Dropouts')).toBe('Good Dropouts');
    expect(getChatEmptyStateFirstName('The Weeknd')).toBe('The Weeknd');
    expect(getChatEmptyStateFirstName('Cher')).toBe('Cher');
    expect(getChatEmptyStateFirstName('DJ Snake')).toBe('DJ Snake');
    // Golden path (tests/e2e/golden-path.spec.ts) asserts the artist name.
    expect(getChatEmptyStateFirstName('UNMARKED')).toBe('UNMARKED');
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

const draftForRelease: ChatEmptyStateResult = {
  id: 'draft-1',
  item: { kind: 'release', id: 'release-9', label: 'Wheels Up' },
  result: {
    kind: 'draft',
    summary: 'Your playlist pitch for Wheels Up is ready.',
    href: '/app/chat/thread-1',
  },
};

describe('findChoreWording (Nov 14: "Review your tip flow with Jovie")', () => {
  it('flags the suggestion Tim saw, which asked him to do our job', () => {
    expect(findChoreWording('Review your tip flow with Jovie')).not.toBeNull();
    expect(findChoreWording('Draft This With Jovie')).not.toBeNull();
  });

  it('flags vague asks that hand work back to the artist', () => {
    for (const text of [
      'Check your signup flow',
      'Consider your next step',
      'Optimize your traffic sources',
      'Think about your audience',
    ]) {
      expect(findChoreWording(text), text).not.toBeNull();
    }
  });

  it('passes a sentence that reports finished work on a named item', () => {
    expect(findChoreWording(draftForRelease.result.summary)).toBeNull();
    expect(
      findChoreWording('Spotify shows Wheels Up on 3 new playlists this week.')
    ).toBeNull();
  });
});

describe('chatEmptyStateResultProblem', () => {
  it('accepts a finished draft for a real item that opens in the app', () => {
    expect(chatEmptyStateResultProblem(draftForRelease)).toBeNull();
    expect(chatEmptyStateResultActionLabel(draftForRelease)).toBe(
      'Review Draft'
    );
  });

  it('rejects the old canned suggestion even when it is attached to an item', () => {
    const problem = chatEmptyStateResultProblem({
      ...draftForRelease,
      result: {
        ...draftForRelease.result,
        summary: 'Review your tip flow with Jovie',
      },
    });
    expect(problem).toMatch(/chore wording|does not name its item/);
  });

  it('rejects a suggestion with no backing item', () => {
    expect(
      chatEmptyStateResultProblem({
        ...draftForRelease,
        item: { ...draftForRelease.item, id: '' },
      })
    ).toBe('no backing item');
  });

  it('rejects a suggestion with no finished result', () => {
    expect(
      chatEmptyStateResultProblem({
        ...draftForRelease,
        result: { ...draftForRelease.result, summary: '' },
      })
    ).toBe('no finished result');
  });

  it('rejects a result that does not open inside the app', () => {
    expect(
      chatEmptyStateResultProblem({
        ...draftForRelease,
        result: { ...draftForRelease.result, href: 'https://example.com' },
      })
    ).toBe('result does not open');
    expect(
      chatEmptyStateResultProblem({
        ...draftForRelease,
        result: { ...draftForRelease.result, href: '//example.com/x' },
      })
    ).toBe('result does not open');
  });

  it('rejects a summary that never names its item', () => {
    expect(
      chatEmptyStateResultProblem({
        ...draftForRelease,
        result: {
          ...draftForRelease.result,
          summary: 'Your playlist pitch is ready.',
        },
      })
    ).toBe('summary does not name its item');
  });
});

describe('selectChatEmptyStateResult', () => {
  it('returns null when Jovie has nothing finished, so only the composer shows', () => {
    expect(selectChatEmptyStateResult([])).toBeNull();
    expect(selectChatEmptyStateResult(undefined)).toBeNull();
  });

  it('skips results that fail the contract and returns the first valid one', () => {
    const chore = {
      ...draftForRelease,
      id: 'chore',
      result: {
        ...draftForRelease.result,
        summary: 'Review your tip flow with Jovie',
      },
    };
    expect(selectChatEmptyStateResult([chore, draftForRelease])?.id).toBe(
      'draft-1'
    );
  });
});
