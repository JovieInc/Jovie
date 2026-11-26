import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { IdentityCell } from './IdentityCell';
import { MeterCell } from './MeterCell';
import { RelativeTimeCell } from './RelativeTimeCell';
import { StatusCell } from './StatusCell';

describe('data grid cell kit', () => {
  it('StatusCell is a dot plus text with no fill or ring', () => {
    render(<StatusCell tone='positive'>High</StatusCell>);
    const el = screen.getByText('High');
    expect(el.className).not.toMatch(/(^|\s)(bg-|ring-|border)/);
    expect(el.querySelector('span')?.className).toContain('size-1.5');
  });

  it('MeterCell lights bars proportionally with distinct inactive bars', () => {
    const { container } = render(<MeterCell value={60} label='Engagement' />);
    expect(screen.getByRole('img')).toHaveAttribute(
      'aria-label',
      'Engagement 3 of 5'
    );
    expect(container.querySelectorAll('.bg-success-text')).toHaveLength(3);
    expect(
      container.querySelectorAll('[class*="bg-quaternary-token"]')
    ).toHaveLength(2);
  });

  it('MeterCell lights nothing at zero', () => {
    const { container } = render(<MeterCell value={0} />);
    expect(container.querySelectorAll('.bg-success-text')).toHaveLength(0);
  });

  it('RelativeTimeCell formats compactly and dashes without a clock', () => {
    const now = Date.parse('2026-11-20T12:00:00Z');
    const { rerender } = render(
      <RelativeTimeCell value='2026-11-17T12:00:00Z' nowMs={now} />
    );
    expect(screen.getByText('3d')).toBeInTheDocument();
    rerender(<RelativeTimeCell value={null} nowMs={now} />);
    expect(screen.getByText('—')).toBeInTheDocument();
    rerender(<RelativeTimeCell value='2026-11-17T12:00:00Z' nowMs={null} />);
    expect(screen.getByText('—')).toBeInTheDocument();
  });

  it('IdentityCell shows the label and a tertiary descriptor', () => {
    render(<IdentityCell name='Sasha' secondary='Los Angeles' />);
    expect(screen.getByText('Sasha').className).toContain('font-medium');
    expect(screen.getByText('Los Angeles').className).toContain(
      'text-tertiary-token'
    );
  });
});
