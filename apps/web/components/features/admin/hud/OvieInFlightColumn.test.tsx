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
const row = (n: number, over: Partial<OvieShipRow> = {}): OvieShipRow =>
  ({
    id: `t${n}`,
    identifier: `JOV-${n}`,
    title: `fix(lanes): work item ${n}`,
    url: null,
    stage: 'building',
    stageIndex: 1,
    complete: false,
    attention: null,
    updatedAt: null,
    pullRequestNumber: n,
    ...over,
  }) as unknown as OvieShipRow;

describe('summarizeInFlight', () => {
  it('says Unknown for everything not measured, and never claims an empty pipeline', () => {
    const summary = summarizeInFlight(delivery(), []);
    expect(summary.headline).toBe('Unknown');
    expect(summary.facts).toBe('Lanes unknown · Merge queue unknown');
    expect(summary.note).toBe('Unknown: in-flight work was not measured.');
    expect(summarizeInFlight(null, null).note).toContain('Unknown');
  });
  it('claims "No work in flight" only from a measured zero', () => {
    expect(summarizeInFlight(delivery({ inFlight: count(0) }), []).note).toBe(
      'No work in flight.'
    );
  });
  it('admits an unavailable list when the count is nonzero', () => {
    const summary = summarizeInFlight(delivery({ inFlight: count(41) }), []);
    expect(summary.headline).toBe('41 open PRs');
    expect(summary.note).toBe('The list is not available.');
  });
  it('groups by meaning: open PRs, then failing and ready to merge, not raw titles', () => {
    const rows = [
      row(1, { attention: 'failing' }),
      row(2, { attention: 'failing' }),
      row(3, { stage: 'tested', stageIndex: 2 }),
      row(4, { stage: 'tested', stageIndex: 2 }),
      row(5, { stage: 'tested', stageIndex: 2 }),
      row(6),
    ];
    const summary = summarizeInFlight(
      delivery({
        inFlight: count(6),
        mergeQueueDepth: count(5),
        lanes: {
          ...emptyDeliverySummary().lanes,
          running: count(3),
          slots: count(4),
        },
      }),
      rows
    );
    expect(summary.headline).toBe('6 open PRs · 2 failing · 3 ready to merge');
    expect(summary.facts).toBe('3 of 4 lanes running · Merge queue 5');
  });
  it('shows only the top 3 that matter, failing first, as plain outcomes with a quiet secondary', () => {
    const rows = [
      row(10),
      row(11, { stage: 'tested', stageIndex: 2 }),
      row(12, { attention: 'failing' }),
      row(13),
      row(14),
    ];
    const summary = summarizeInFlight(delivery({ inFlight: count(5) }), rows);
    expect(summary.top.map(item => item.primary)).toEqual([
      'Work item 12',
      'Work item 11',
      'Work item 10',
    ]);
    expect(summary.top.map(item => item.secondary)).toEqual([
      '#12 · failing checks',
      '#11 · ready to merge',
      '#10 · building',
    ]);
    expect(summary.top[0]?.attention).toBe(true);
    expect(summary.more).toBe(2);
  });
  it('admits a partial list instead of implying it is complete', () => {
    const summary = summarizeInFlight(delivery({ inFlight: count(14) }), [
      row(1),
      row(2),
    ]);
    expect(summary.headline).toBe('14 open PRs · 2 tracked');
  });
  it('limits the headline to three groups', () => {
    const rows = [
      row(1, { attention: 'failing' }),
      row(2, { attention: 'blocked' }),
      row(3, { attention: 'retrying' }),
      row(4, { stage: 'tested', stageIndex: 2 }),
    ];
    expect(
      summarizeInFlight(delivery({ inFlight: count(4) }), rows).headline
    ).toBe('4 open PRs · 1 failing · 1 blocked · 1 retrying');
  });
});

describe('OvieInFlightColumn', () => {
  it('renders the headline, the quiet +N more, and never claims empty when unknown', () => {
    const rows = Array.from({ length: 6 }, (_, index) => row(index + 1));
    const { unmount } = render(
      <OvieInFlightColumn
        delivery={delivery({ inFlight: count(6) })}
        rows={rows}
        status='ready'
      />
    );
    expect(screen.getByTestId('ovie-inflight-headline')).toHaveTextContent(
      '6 open PRs'
    );
    expect(screen.getAllByRole('listitem')).toHaveLength(3);
    expect(screen.getByTestId('ovie-quiet-more')).toHaveTextContent('+3 more');
    unmount();
    render(<OvieInFlightColumn delivery={null} rows={null} status='ready' />);
    expect(screen.getByTestId('ovie-inflight-note')).toHaveTextContent(
      'Unknown'
    );
    expect(screen.queryByText('No work in flight.')).toBeNull();
  });
});
