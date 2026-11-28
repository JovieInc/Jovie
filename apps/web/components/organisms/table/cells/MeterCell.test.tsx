import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { EngagementBarCell, MeterCell } from './MeterCell';

const active = (c: HTMLElement) => c.querySelectorAll('.bg-success-text');
const inactive = (c: HTMLElement) =>
  c.querySelectorAll('[class*="bg-quaternary-token"]');

describe('MeterCell', () => {
  it('lights bars proportionally and leaves the rest inactive', () => {
    const { container } = render(<MeterCell value={40} />);
    expect(active(container)).toHaveLength(2);
    expect(inactive(container)).toHaveLength(3);
    expect(screen.getByRole('img')).toHaveAttribute(
      'aria-label',
      'Level 2 of 5'
    );
  });

  it('lights every bar at max and none at zero', () => {
    const full = render(<MeterCell value={100} />);
    expect(active(full.container)).toHaveLength(5);
    expect(inactive(full.container)).toHaveLength(0);
    full.unmount();

    const empty = render(<MeterCell value={0} />);
    expect(active(empty.container)).toHaveLength(0);
    expect(inactive(empty.container)).toHaveLength(5);
  });

  it('lights at least one bar for any positive value', () => {
    const { container } = render(<MeterCell value={1} />);
    expect(active(container)).toHaveLength(1);
  });

  it('clamps out-of-range values', () => {
    const over = render(<MeterCell value={500} />);
    expect(active(over.container)).toHaveLength(5);
    over.unmount();
    const under = render(<MeterCell value={-20} />);
    expect(active(under.container)).toHaveLength(0);
  });

  it('honors a custom max, bar count and label', () => {
    const { container } = render(
      <MeterCell value={3} max={4} bars={4} label='Engagement' />
    );
    expect(active(container)).toHaveLength(3);
    expect(inactive(container)).toHaveLength(1);
    expect(screen.getByRole('img')).toHaveAttribute(
      'aria-label',
      'Engagement 3 of 4'
    );
  });

  it('caps the bar count at the available heights', () => {
    const { container } = render(<MeterCell value={100} bars={20} />);
    expect(active(container)).toHaveLength(6);
  });

  it('exposes the engagement bar alias', () => {
    expect(EngagementBarCell).toBe(MeterCell);
  });
});
