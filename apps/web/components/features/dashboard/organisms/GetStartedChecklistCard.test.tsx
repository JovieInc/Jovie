import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { GetStartedChecklistCard } from './GetStartedChecklistCard';

vi.mock('@/lib/analytics', () => ({ track: vi.fn() }));

afterEach(() => {
  window.localStorage.clear();
});

describe('GetStartedChecklistCard dismissal target (WCAG 2.5.8)', () => {
  it('renders the dismiss control on the canonical >=24px sm button and dismisses for 24h', async () => {
    render(
      <GetStartedChecklistCard
        userId='user-1'
        profileUrl='https://jov.ie/artist'
      />
    );
    const dismiss = await screen.findByRole('button', { name: 'Dismiss' });
    // Canonical sm text button: min-h-7 (28px) face plus the invisible 44px
    // hit target — the old raw pill measured below axe's 24x24 minimum.
    expect(dismiss).toHaveClass('min-h-7');
    expect(dismiss).not.toHaveClass('py-0.5');
    fireEvent.click(dismiss);
    expect(
      screen.queryByRole('button', { name: 'Dismiss' })
    ).not.toBeInTheDocument();
  });
});
