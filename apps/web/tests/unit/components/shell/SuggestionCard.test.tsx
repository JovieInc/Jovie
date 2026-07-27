import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { SuggestionCard } from '@/components/shell/SuggestionCard';

describe('SuggestionCard', () => {
  it('annotates its primary proof copy for screenshot contrast auditing', () => {
    const { container } = render(
      <SuggestionCard
        actionLabel='Review'
        body='A deterministic recommendation based on the artist workspace.'
        title='Your next move is ready'
      />
    );

    expect(
      container.querySelector('[data-screenshot-contrast-surface]')
    ).toBeInTheDocument();
    expect(
      screen
        .getByRole('heading', { name: 'Your next move is ready' })
        .hasAttribute('data-screenshot-contrast-text')
    ).toBe(true);
  });
});
