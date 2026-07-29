import { describe, expect, it } from 'vitest';
import { resolveChatEmptyStateAffordance } from './chat-empty-state-contract';

const emptyState = {
  conversationExists: false,
  conversationInProgress: false,
  composerHasIntent: false,
  opportunityCardCount: 0,
  starterActionCount: 0,
} as const;

describe('resolveChatEmptyStateAffordance', () => {
  it('prioritizes opportunities, then starter actions, then suggestion pills', () => {
    expect(
      resolveChatEmptyStateAffordance({
        ...emptyState,
        opportunityCardCount: 1,
        starterActionCount: 3,
      })
    ).toBe('opportunity-cards');
    expect(
      resolveChatEmptyStateAffordance({ ...emptyState, starterActionCount: 3 })
    ).toBe('starter-actions');
    expect(resolveChatEmptyStateAffordance(emptyState)).toBe(
      'suggestion-pills'
    );
  });

  it.each([
    { conversationExists: true },
    { conversationInProgress: true },
    { composerHasIntent: true },
  ])('shows no empty affordance for $s', override => {
    expect(
      resolveChatEmptyStateAffordance({
        ...emptyState,
        starterActionCount: 3,
        ...override,
      })
    ).toBe('none');
  });
});
