import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ReleaseDueBadge } from './ReleaseDueBadge';

describe('ReleaseDueBadge', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('collapses overdue tasks to a simple overdue label', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-02T12:00:00.000Z'));

    render(
      <ReleaseDueBadge
        dueDate={new Date('2014-04-02T12:00:00.000Z')}
        dueDaysOffset={null}
      />
    );

    expect(screen.getByText('Overdue')).toBeInTheDocument();
  });

  it('renders the overdue (<=90d) variant with the error token, not raw red-* (JOV-6773)', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-02T12:00:00.000Z'));

    render(
      <ReleaseDueBadge
        dueDate={new Date('2026-03-20T12:00:00.000Z')}
        dueDaysOffset={null}
      />
    );

    const badge = screen.getByText('Overdue').closest('span');
    expect(badge?.className).toContain('bg-error');
    expect(badge?.className).not.toMatch(/\bred-\d/);
  });
});
