import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { DueChip } from './DueChip';

describe('DueChip', () => {
  const NOW = new Date('2026-04-25T12:00:00Z');

  it('renders "Due today" when the due date is the same day', () => {
    render(<DueChip dueIso='2026-04-25T12:00:00Z' now={NOW} />);
    expect(screen.getByText('Due today')).toBeInTheDocument();
  });

  it('renders "Due tomorrow" for 1 day out', () => {
    render(<DueChip dueIso='2026-04-26T12:00:00Z' now={NOW} />);
    expect(screen.getByText('Due tomorrow')).toBeInTheDocument();
  });

  it('renders "Due yesterday" for 1 day past', () => {
    render(<DueChip dueIso='2026-04-24T12:00:00Z' now={NOW} />);
    expect(screen.getByText('Due yesterday')).toBeInTheDocument();
  });

  it('renders day count for 2-6 days out', () => {
    render(<DueChip dueIso='2026-04-28T12:00:00Z' now={NOW} />);
    expect(screen.getByText('Due in 3d')).toBeInTheDocument();
  });

  it('renders week count for 7+ days out', () => {
    render(<DueChip dueIso='2026-05-09T12:00:00Z' now={NOW} />);
    expect(screen.getByText('Due in 2w')).toBeInTheDocument();
  });

  it('hides multi-year historical overdues instead of "12y ago" chips', () => {
    const { container } = render(
      <DueChip dueIso='2020-04-25T12:00:00Z' now={NOW} />
    );
    // Outside the actionable overdue window — no absurd relative chip.
    expect(container.firstChild).toBeNull();
    expect(screen.queryByText(/y ago/i)).not.toBeInTheDocument();
  });

  it('tints amber for soon-due (<= 2 days)', () => {
    const { container } = render(
      <DueChip dueIso='2026-04-26T12:00:00Z' now={NOW} />
    );
    expect((container.firstElementChild as HTMLElement).className).toContain(
      'amber-300'
    );
  });

  it('respects muted prop', () => {
    const { container } = render(
      <DueChip dueIso='2026-04-26T12:00:00Z' now={NOW} muted />
    );
    expect(
      (container.firstElementChild as HTMLElement).className
    ).not.toContain('amber-300');
  });

  it('tints danger only for recently overdue tasks', () => {
    const { container: recent } = render(
      <DueChip dueIso='2026-04-20T12:00:00Z' now={NOW} />
    );
    expect((recent.firstElementChild as HTMLElement).className).toContain(
      'red-300'
    );

    const { container: stale } = render(
      <DueChip dueIso='2026-03-01T12:00:00Z' now={NOW} />
    );
    expect((stale.firstElementChild as HTMLElement).className).not.toContain(
      'red-300'
    );
    expect((stale.firstElementChild as HTMLElement).className).toContain(
      'quaternary-token'
    );
  });

  it('returns null on a non-finite due date', () => {
    const { container } = render(<DueChip dueIso='not-a-date' now={NOW} />);
    expect(container.firstChild).toBeNull();
  });
});
