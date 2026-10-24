import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { buildPulse } from '@/lib/ovie/home/shipping-home';
import { emptyDeliverySummary } from '@/lib/ovie/shipping-state/contract';
import { OvieHomeHero, type OvieHomeHeroProps } from './OvieHomeHero';

const copy: OvieHomeHeroProps['copy'] = {
  constraintClear: 'Nothing is blocking shipping',
  asksTitle: 'Blocked On You',
  asksEmpty: 'No decisions',
  asksError: 'Unavailable',
  inFlightTitle: 'In Flight',
  inFlightEmpty: 'No work',
  inFlightError: 'Shipping data could not load.',
  doneTitle: 'Done Today',
  doneEmpty: 'Nothing landed',
};
const pulse = buildPulse(emptyDeliverySummary());
function props(overrides: Partial<OvieHomeHeroProps> = {}): OvieHomeHeroProps {
  return {
    copy,
    constraint: null,
    tiles: pulse,
    status: 'ready',
    strip: [],
    coverage: null,
    ...overrides,
  };
}

describe('OvieHomeHero', () => {
  it('reserves the canonical unmeasured slots before first data without inventing zero', () => {
    const { container, rerender } = render(
      <OvieHomeHero {...props({ tiles: [], status: 'loading' })} />
    );
    const frames = Array.from(
      container.querySelectorAll('[data-slot="cinematic-metric"]')
    );
    expect(frames).toHaveLength(pulse.length);
    expect(frames[0]).toHaveAttribute('data-density', 'glance');
    expect(frames[1]).toHaveAttribute('data-density', 'summary');
    rerender(<OvieHomeHero {...props()} />);
    const updated = container.querySelectorAll(
      '[data-slot="cinematic-metric"]'
    );
    frames.forEach((frame, index) => expect(updated[index]).toBe(frame));
    expect(screen.getAllByText('Not measured')).toHaveLength(pulse.length + 1);
    expect(screen.queryByText('0')).not.toBeInTheDocument();
  });

  it('keeps source values, order, history and named status while treating zero as measured', () => {
    const tiles = pulse.map((tile, index) =>
      index === 1
        ? {
            ...tile,
            measured: true,
            value: '0',
            was: '2',
            tone: 'warn' as const,
          }
        : tile
    );
    render(<OvieHomeHero {...props({ tiles })} />);
    const metric = screen.getByTestId('home-loop-tile-merges-hour');
    expect(within(metric).getByText('0')).toBeVisible();
    expect(within(metric).getByText('Was 2 · Needs attention')).toBeVisible();
    expect(
      screen.getAllByTestId(/^home-loop-tile-/).map(node => node.dataset.testid)
    ).toEqual(pulse.map(tile => `home-loop-tile-${tile.key}`));
  });

  it('reports a failed read without claiming a healthy shipping state', () => {
    render(<OvieHomeHero {...props({ status: 'error', tiles: [] })} />);
    expect(screen.getByTestId('home-loop-constraint')).toHaveTextContent(
      copy.inFlightError
    );
    expect(screen.queryByText(copy.constraintClear)).not.toBeInTheDocument();
  });

  it('preserves source warnings as text in the quiet timing strip', () => {
    render(
      <OvieHomeHero
        {...props({
          strip: [
            { id: 'test', label: 'Test', value: '8m', tone: 'warn' },
            { id: 'deploy', label: 'Deploy', value: '12m', tone: 'bad' },
          ],
          coverage: '2 stages measured',
        })}
      />
    );
    expect(screen.getByTestId('home-loop-stage-strip')).toHaveTextContent(
      '8m · Needs attention'
    );
    expect(screen.getByTestId('home-loop-stage-strip')).toHaveTextContent(
      '12m · Problem'
    );
    expect(screen.getByText('2 stages measured')).toBeVisible();
  });
});
