import { render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DemoReleaseTasksSurface } from './DemoReleaseTasksSurface';

describe('release task demo accuracy', () => {
  afterEach(() => vi.useRealTimers());

  it('labels the total and completed counts consistently with its six task rows', () => {
    render(<DemoReleaseTasksSurface />);

    expect(screen.getAllByRole('checkbox')).toHaveLength(6);
    expect(screen.getAllByRole('checkbox', { checked: true })).toHaveLength(2);
    expect(screen.getByText('Total tasks').parentElement).toHaveTextContent(
      '6'
    );
    expect(screen.getByText('Done').parentElement).toHaveTextContent('2');
    expect(screen.getByRole('progressbar')).toHaveAccessibleName(
      '2 of 6 tasks done'
    );
  });

  it('renders one label per group with accurate group completion', () => {
    render(<DemoReleaseTasksSurface />);

    for (const [category, done] of [
      ['Creative', 0],
      ['Outreach', 1],
      ['Distribution', 1],
    ] as const) {
      expect(screen.getAllByText(category)).toHaveLength(1);
      const group = screen.getByRole('region', {
        name: `${category} — ${done} of 2 complete`,
      });
      expect(within(group).getAllByRole('checkbox')).toHaveLength(2);
    }
  });

  it.each(['2026-11-13T12:00:00Z', '2030-01-01T12:00:00Z'])(
    'keeps demo dates and status consistent when viewed on %s',
    date => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date(date));
      render(<DemoReleaseTasksSurface />);

      expect(screen.getByText('Demo · Apr 2, 2026')).toBeVisible();
      expect(screen.getByText('Apr 4, 2026 release')).toBeVisible();
      expect(screen.getByText('Apr 2 at 4:00 PM UTC')).toBeVisible();
      expect(screen.queryByText(/overdue/i)).not.toBeInTheDocument();
      expect(screen.getAllByText('Today')).toHaveLength(2);
      expect(screen.getByText('1d')).toBeVisible();
      expect(screen.getByText('2d')).toBeVisible();
    }
  );
});
