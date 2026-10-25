import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { OvieShipRow } from '@/lib/ovie/home/shipping-home';
import {
  type DeliverySummary,
  emptyDeliverySummary,
} from '@/lib/ovie/shipping-state/contract';
import { OvieInFlightColumn, summarizeInFlight } from './OvieInFlightColumn';

const count = (value: number) =>
  value === 0
    ? ({ state: 'measured-zero', value: 0 } as const)
    : ({ state: 'measured-nonzero', value } as const);

const delivery = (over: Partial<DeliverySummary> = {}): DeliverySummary => ({
  ...emptyDeliverySummary(),
  ...over,
});
const row = (n: number): OvieShipRow =>
  ({
    id: `t${n}`,
    identifier: `JOV-${n}`,
    title: `Work item ${n}`,
    url: null,
    stage: 'building',
    stageIndex: 1,
    complete: false,
    attention: null,
    updatedAt: null,
    pullRequestNumber: n,
  }) as unknown as OvieShipRow;

describe('summarizeInFlight', () => {
  it('says Unknown for everything not measured, and never claims an empty pipeline', () => {
    const summary = summarizeInFlight(delivery(), []);
    expect(summary.lines.map(line => line.value)).toEqual([
      'Unknown',
      'Unknown',
      'Unknown',
    ]);
    expect(summary.note).toBe('Unknown: in-flight work was not measured.');
    expect(summarizeInFlight(null, null).note).toContain('Unknown');
  });
  it('claims "No work in flight" only from a measured zero', () => {
    expect(summarizeInFlight(delivery({ inFlight: count(0) }), []).note).toBe(
      'No work in flight.'
    );
  });
  it('admits an unavailable list when the count is nonzero', () => {
    expect(summarizeInFlight(delivery({ inFlight: count(41) }), []).note).toBe(
      '41 in flight; the list is not available.'
    );
  });
  it('reads lanes, queue and PRs from the measurements', () => {
    const d = delivery({
      inFlight: count(14),
      mergeQueueDepth: count(5),
      lanes: {
        ...emptyDeliverySummary().lanes,
        running: count(3),
        slots: count(4),
      },
    });
    expect(summarizeInFlight(d, [row(1)]).lines).toEqual([
      { label: 'Lanes', value: '3 of 4 running' },
      { label: 'Merge Queue', value: '5' },
      { label: 'Open Pull Requests', value: '14' },
    ]);
  });
  it('caps the list and reports +N more instead of overflowing', () => {
    const rows = Array.from({ length: 20 }, (_, index) => row(index + 1));
    const summary = summarizeInFlight(delivery({ inFlight: count(20) }), rows);
    expect(summary.shown).toHaveLength(12);
    expect(summary.more).toBe(8);
  });
});

describe('OvieInFlightColumn', () => {
  it('renders the +N more line and the unknown note', () => {
    const rows = Array.from({ length: 14 }, (_, index) => row(index + 1));
    const { unmount } = render(
      <OvieInFlightColumn
        delivery={delivery({ inFlight: count(14) })}
        rows={rows}
        status='ready'
      />
    );
    expect(screen.getByTestId('ovie-inflight-more')).toHaveTextContent(
      '+2 more'
    );
    unmount();
    render(<OvieInFlightColumn delivery={null} rows={null} status='ready' />);
    expect(screen.getByTestId('ovie-inflight-note')).toHaveTextContent(
      'Unknown'
    );
    expect(screen.queryByText('No work in flight.')).toBeNull();
  });
});
