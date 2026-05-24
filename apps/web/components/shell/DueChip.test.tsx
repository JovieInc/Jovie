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

  it('renders year counts instead of raw multi-year day counts', () => {
    render(<DueChip dueIso='2020-04-25T12:00:00Z' now={NOW} />);
    expect(screen.getByText('Due 6y ago')).toBeInTheDocument();
    expect(screen.queryByText(/2192d/i)).not.toBeInTheDocument();
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

  it('returns null on a non-finite due date', () => {
    const { container } = render(<DueChip dueIso='not-a-date' now={NOW} />);
    expect(container.firstChild).toBeNull();
  });
});
