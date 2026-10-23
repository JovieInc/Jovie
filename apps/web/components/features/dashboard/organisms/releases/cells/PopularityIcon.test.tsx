import { TooltipProvider } from '@jovie/ui';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { PopularityIcon } from './PopularityIcon';

describe('PopularityIcon', () => {
  it('lights one bar at low popularity on the muted token', () => {
    render(
      <TooltipProvider>
        <PopularityIcon popularity={20} />
      </TooltipProvider>
    );

    const control = screen.getByRole('button', {
      name: 'Popularity 20 out of 100',
    });
    const bars = control.querySelectorAll('div');
    expect(bars).toHaveLength(3);
    expect(bars[0].className).toContain('bg-tertiary-token');
    for (const bar of Array.from(bars).slice(1)) {
      expect(bar.className).toContain('bg-subtle');
    }
  });

  it('lights every tier on the Ion accent token, never raw amber or emerald', () => {
    for (const popularity of [50, 90]) {
      const { unmount } = render(
        <TooltipProvider>
          <PopularityIcon popularity={popularity} />
        </TooltipProvider>
      );

      const control = screen.getByRole('button', {
        name: `Popularity ${popularity} out of 100`,
      });
      expect(control.className).not.toMatch(/amber|emerald|orange/);
      for (const bar of control.querySelectorAll('div')) {
        expect(bar.className).not.toMatch(/amber|emerald/);
      }
      unmount();
    }
  });
});
