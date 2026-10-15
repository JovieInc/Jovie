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

const now = Date.parse('2026-10-14T20:00:00Z');
const actionableInsight = {
  id: 'insight-1',
  insightType: 'release_momentum',
  category: 'content',
  priority: 'high',
  title: 'Your release is getting attention',
  description: '',
  actionSuggestion: 'Draft an update about your release.',
  confidence: '0.90',
  status: 'active',
  periodStart: '2026-10-01T00:00:00Z',
  periodEnd: '2026-10-14T00:00:00Z',
  createdAt: '2026-10-14T00:00:00Z',
  expiresAt: '2026-10-15T00:00:00Z',
} satisfies import('@/types/insights').InsightResponse;

describe('resolveChatEmptyStateInsight', () => {
  it('uses the first eligible entry in server priority order, retaining its context', () => {
    const action = resolveChatEmptyStateInsight(
      [actionableInsight, { ...actionableInsight, id: 'second' }],
      now
    );
    expect(action?.insightId).toBe('insight-1');
    expect(action?.suggestion).toBe('Draft a release update');
    expect(action?.prompt).toContain(
      'Insight insight-1: Your release is getting attention'
    );
  });

  it.each(['dismissed', 'acted_on', 'expired'] as const)(
    'skips %s entries',
    status => {
      expect(
        resolveChatEmptyStateInsight(
          [
            { ...actionableInsight, status },
            { ...actionableInsight, id: 'eligible' },
          ],
          now
        )?.insightId
      ).toBe('eligible');
    }
  );

  it.each([
    { expiresAt: '2026-10-14T20:00:00Z' },
    { expiresAt: 'invalid' },
    { actionSuggestion: null },
    { actionSuggestion: '  ' },
    { actionSuggestion: 'x'.repeat(241) },
    { id: '' },
    { title: '  ' },
  ])('skips stale or unusable content: %s', invalid => {
    expect(
      resolveChatEmptyStateInsight(
        [
          { ...actionableInsight, ...invalid },
          { ...actionableInsight, id: 'eligible' },
        ],
        now
      )?.insightId
    ).toBe('eligible');
  });

  it('does not infer verified success or readiness from model prose', () => {
    expect(
      resolveChatEmptyStateInsight(
        [
          {
            ...actionableInsight,
            title: 'Conversion improved 500%',
            actionSuggestion: null,
          },
        ],
        now
      )
    ).toBeNull();
    expect(resolveChatEmptyStateInsight([], now)).toBeNull();
    const unverifiedProse = resolveChatEmptyStateInsight(
      [
        {
          ...actionableInsight,
          actionSuggestion: 'Your streams are up 320% today.',
        },
      ],
      now
    );
    expect(unverifiedProse?.suggestion).toBe('Draft a release update');
    expect(unverifiedProse?.suggestion).not.toMatch(/320|streams|\bup\b/);
    expect(unverifiedProse?.prompt).toContain('do not invent results');
  });

  it.each([
    ['tip_hotspot', 'tip'],
    ['capture_rate_change', 'signup'],
  ] as const)('keeps %s conversion work with Jovie', (insightType, flow) => {
    const action = resolveChatEmptyStateInsight(
      [
        {
          ...actionableInsight,
          insightType,
          title: '27 clicks, zero completions',
          actionSuggestion: 'Fix your conversion gap.',
        },
      ],
      now
    );
    expect(action?.suggestion).toBe(`Review your ${flow} flow with Jovie`);
    expect(action?.prompt).toContain('concrete improvement Jovie can make');
    expect(action?.prompt).toContain('27 clicks, zero completions');
    expect(action?.suggestion).not.toContain('gap');
  });
});
