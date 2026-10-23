import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { AudienceEngagementBars } from './AudienceEngagementBars';

describe('AudienceEngagementBars', () => {
  it('renders lit bars with the success token, never a raw color', () => {
    render(<AudienceEngagementBars score={80} />);

    const bars = screen.getByRole('img', { name: 'Engagement 4 of 5' });
    const lit = bars.querySelectorAll('span[aria-hidden="true"]');
    let litCount = 0;
    for (const bar of lit) {
      expect(bar.className).not.toMatch(/emerald|amber|orange|cyan/);
      if (bar.className.includes('bg-success/70')) litCount += 1;
    }
    expect(litCount).toBe(4);
  });

  it('renders a zero score with no lit bars', () => {
    render(<AudienceEngagementBars score={0} />);

    expect(
      screen.getByRole('img', { name: 'Engagement 0 of 5' })
    ).toBeInTheDocument();
    for (const bar of screen
      .getByRole('img', { name: 'Engagement 0 of 5' })
      .querySelectorAll('span[aria-hidden="true"]')) {
      expect(bar.className).not.toContain('bg-success');
    }
  });
});
