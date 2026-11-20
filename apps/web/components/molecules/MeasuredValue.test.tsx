import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { formatMeasuredAge, MeasuredValue } from './MeasuredValue';

describe('MeasuredValue', () => {
  it('renders a measured reading as-is', () => {
    render(<MeasuredValue state='measured' value='92' source='GitHub' />);
    expect(screen.getByText('92')).toHaveAttribute('data-measured', 'measured');
  });

  it('keeps a stale reading visible and states its age', () => {
    const { container } = render(
      <MeasuredValue
        state='stale'
        value='4/5'
        source='Lanes feed'
        ageMs={12 * 60_000}
      />
    );
    const node = container.querySelector('[data-measured="stale"]');
    expect(node).toHaveTextContent('4/5');
    expect(node).toHaveTextContent('12m old');
    expect(node).toHaveAttribute('title', 'Stale: Lanes feed · seen 12m ago');
  });

  it('names the source, reason and age when there is no reading', () => {
    const { container } = render(
      <MeasuredValue
        state='unknown'
        value='ignored'
        source='GitHub'
        reason='timeout'
        ageMs={3 * 3_600_000}
      />
    );
    const node = container.querySelector('[data-measured="unknown"]');
    expect(node).toHaveTextContent(/Unknown\s*GitHub · 3h/);
    expect(node).not.toHaveTextContent('ignored');
    expect(node).toHaveAttribute(
      'title',
      'Unknown: GitHub · timeout · seen 3h ago'
    );
  });

  it('says never seen instead of inventing an age', () => {
    const { container } = render(
      <MeasuredValue state='unknown' source='Client telemetry' />
    );
    expect(
      container.querySelector('[data-measured="unknown"]')
    ).toHaveAttribute('title', 'Unknown: Client telemetry · never seen');
  });

  it.each([
    [0, 'now'],
    [30_000, '30s'],
    [59 * 60_000, '59m'],
    [5 * 3_600_000, '5h'],
    [72 * 3_600_000, '3d'],
  ])('formats %ims as %s', (ms, expected) => {
    expect(formatMeasuredAge(ms)).toBe(expected);
  });
});
