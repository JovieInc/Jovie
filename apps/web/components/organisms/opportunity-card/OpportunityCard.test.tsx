import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { OpportunityCard } from './OpportunityCard';

describe('OpportunityCard formats', () => {
  it('opens a compact suggestion by keyboard with the full description available', async () => {
    const onSelect = vi.fn();
    render(
      <OpportunityCard
        format='compact'
        title='Review release'
        description='Check credits and links.'
        icon={<span />}
        onSelect={onSelect}
      />
    );
    const button = screen.getByRole('button', { name: 'Review release' });
    expect(button).toHaveAccessibleDescription('Check credits and links.');
    await userEvent.tab();
    await userEvent.keyboard('{Enter}');
    expect(onSelect).toHaveBeenCalledOnce();
    expect(screen.queryByRole('article')).not.toBeInTheDocument();
  });
  it('renders full editorial content and keeps its action independently operable', async () => {
    const onReview = vi.fn();
    render(
      <OpportunityCard
        format='editorial'
        title='Release review'
        description='Complete review context.'
        icon={<span />}
        metadata={<span>Release</span>}
      >
        <button type='button' onClick={onReview}>
          Review
        </button>
      </OpportunityCard>
    );
    expect(screen.getByRole('article')).toHaveAttribute(
      'data-opportunity-format',
      'editorial'
    );
    expect(
      screen.getByRole('heading', { name: 'Release review' })
    ).toBeVisible();
    await userEvent.click(screen.getByRole('button', { name: 'Review' }));
    expect(onReview).toHaveBeenCalledOnce();
  });
});
