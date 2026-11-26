import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { formatRelativeCompact, RelativeTimeCell } from './RelativeTimeCell';

const NOW = Date.parse('2026-11-20T12:00:00Z');
const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

describe('formatRelativeCompact', () => {
  it.each([
    [0, 'now'],
    [MIN - 1, 'now'],
    [MIN, '1m'],
    [59 * MIN, '59m'],
    [HOUR, '1h'],
    [23 * HOUR, '23h'],
    [DAY, '1d'],
    [45 * DAY, '45d'],
  ])('formats %ims as %s', (ms, expected) => {
    expect(formatRelativeCompact(ms)).toBe(expected);
  });
});

describe('RelativeTimeCell', () => {
  it.each([
    ['2026-11-20T11:59:50Z', 'now'],
    ['2026-11-20T11:55:00Z', '5m'],
    ['2026-11-20T09:00:00Z', '3h'],
    ['2026-11-13T12:00:00Z', '7d'],
  ])('shows %s as %s against the injected clock', (value, expected) => {
    render(<RelativeTimeCell value={value} nowMs={NOW} />);
    expect(screen.getByText(expected)).toBeInTheDocument();
  });

  it('shows a dash when never seen, unparsable, or without a clock', () => {
    const never = render(<RelativeTimeCell value={null} nowMs={NOW} />);
    expect(never.container).toHaveTextContent('—');
    never.unmount();
    const bad = render(<RelativeTimeCell value='not-a-date' nowMs={NOW} />);
    expect(bad.container).toHaveTextContent('—');
    bad.unmount();
    const ssr = render(
      <RelativeTimeCell value='2026-11-20T11:55:00Z' nowMs={null} />
    );
    expect(ssr.container).toHaveTextContent('—');
  });

  it('never goes negative for a future timestamp', () => {
    render(<RelativeTimeCell value='2026-11-21T12:00:00Z' nowMs={NOW} />);
    expect(screen.getByText('now')).toBeInTheDocument();
  });

  it('is tabular tertiary text and merges className', () => {
    render(
      <RelativeTimeCell
        value='2026-11-20T11:55:00Z'
        nowMs={NOW}
        className='extra'
      />
    );
    expect(screen.getByText('5m')).toHaveClass(
      'tabular-nums',
      'text-tertiary-token',
      'extra'
    );
  });
});
