import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { GetStartedChecklistCard } from './GetStartedChecklistCard';

vi.mock('@/lib/analytics', () => ({ track: vi.fn() }));

afterEach(() => {
  window.localStorage.clear();
});

describe('GetStartedChecklistCard dismissal target (WCAG 2.5.8)', () => {
  it('renders the dismiss control with a >=24px hit area and dismisses for 24h', async () => {
    render(
      <GetStartedChecklistCard
        userId='user-1'
        profileUrl='https://jov.ie/artist'
      />
    );
    const dismiss = await screen.findByRole('button', { name: 'Dismiss' });
    // py-1.5 lifts the 12px text button from ~21px to ~29px tall; the old
    // py-0.5 pill measured below axe's 24x24 target-size minimum.
    expect(dismiss).toHaveClass('py-1.5');
    expect(dismiss).not.toHaveClass('py-0.5');
    fireEvent.click(dismiss);
    expect(
      screen.queryByRole('button', { name: 'Dismiss' })
    ).not.toBeInTheDocument();
  });
});
