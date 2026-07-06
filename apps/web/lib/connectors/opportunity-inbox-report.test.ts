import { describe, expect, it } from 'vitest';
import {
  buildOpportunityInboxData,
  mapSuggestedActionToInboxCard,
} from './opportunity-inbox-mapper';
import {
  formatReportDelta,
  isReportKind,
  parseReportMeasurement,
} from './opportunity-inbox-report';

const MEASUREMENT_PAYLOAD = {
  title: 'Thumbnail experiment finished',
  experimentId: 'exp-42',
  measurement: {
    metricLabel: 'views',
    deltaPercent: 5.4,
    series: [120, 132, 128, 150, 171],
    items: [
      { label: 'Challenger A', deltaPercent: 5.4, detail: 'promoted' },
      { label: 'Baseline', deltaPercent: 0 },
    ],
  },
  nextStep: {
    label: 'Run on 3 more videos',
    kind: 'experiment.start',
    payload: { videoCount: 3 },
    rationale: 'The winning frame style should generalize.',
  },
};

describe('isReportKind', () => {
  it('matches experiment report kinds and measurement family kinds', () => {
    expect(isReportKind('experiment.report')).toBe(true);
    expect(isReportKind('measurement.youtube_thumbnail')).toBe(true);
    expect(isReportKind('calendar.create_event')).toBe(false);
  });
});

describe('formatReportDelta', () => {
  it('formats signed percent deltas', () => {
    expect(formatReportDelta(5.4)).toBe('+5.4%');
    expect(formatReportDelta(-2.13)).toBe('−2.1%');
    expect(formatReportDelta(0)).toBe('0%');
    expect(formatReportDelta(12)).toBe('+12%');
  });
});

describe('parseReportMeasurement', () => {
  it('parses a full measurement payload', () => {
    const report = parseReportMeasurement(MEASUREMENT_PAYLOAD);

    expect(report).toMatchObject({
      metricLabel: 'views',
      deltaPercent: 5.4,
      deltaDisplay: '+5.4%',
      direction: 'up',
      experimentId: 'exp-42',
    });
    expect(report?.series).toEqual([120, 132, 128, 150, 171]);
    expect(report?.items).toHaveLength(2);
    expect(report?.items[0]).toEqual({
      label: 'Challenger A',
      deltaPercent: 5.4,
      detail: 'promoted',
    });
    expect(report?.nextStep).toMatchObject({
      label: 'Run on 3 more videos',
      kind: 'experiment.start',
    });
  });

  it('supports flat payloads without a measurement wrapper', () => {
    const report = parseReportMeasurement({
      metricLabel: 'streams',
      deltaPercent: -3.2,
    });

    expect(report).toMatchObject({
      metricLabel: 'streams',
      deltaDisplay: '−3.2%',
      direction: 'down',
      nextStep: null,
      experimentId: null,
    });
    expect(report?.series).toEqual([]);
  });

  it('rejects payloads without the minimum viable shape', () => {
    expect(parseReportMeasurement(null)).toBeNull();
    expect(parseReportMeasurement('nope')).toBeNull();
    expect(parseReportMeasurement({})).toBeNull();
    expect(
      parseReportMeasurement({ measurement: { metricLabel: 'x' } })
    ).toBeNull();
    expect(
      parseReportMeasurement({ measurement: { deltaPercent: 1 } })
    ).toBeNull();
  });

  it('drops malformed series and breakdown entries', () => {
    const report = parseReportMeasurement({
      measurement: {
        metricLabel: 'views',
        deltaPercent: 1,
        series: [1, 'x', Number.NaN, 2],
        items: [{ label: '' }, { nope: true }, { label: 'ok' }],
      },
    });

    // 'x'/NaN filtered leaves [1, 2] which is still drawable.
    expect(report?.series).toEqual([1, 2]);
    expect(report?.items).toEqual([{ label: 'ok' }]);
  });

  it('drops a next step missing label or kind', () => {
    const report = parseReportMeasurement({
      measurement: { metricLabel: 'views', deltaPercent: 1 },
      nextStep: { label: 'Only a label' },
    });

    expect(report?.nextStep).toBeNull();
  });
});

describe('mapSuggestedActionToInboxCard (report variant)', () => {
  const ROW = {
    id: 'report-1',
    kind: 'experiment.report',
    payload: MEASUREMENT_PAYLOAD,
    rationale: null,
    createdAt: new Date('2026-07-04T10:00:00.000Z'),
  };

  it('maps a measurement payload to a report card', () => {
    const card = mapSuggestedActionToInboxCard(ROW);

    expect(card).toMatchObject({
      id: 'report-1',
      category: 'report',
      typeLabel: 'Report',
      title: 'Thumbnail experiment finished',
      primaryActionLabel: 'Run on 3 more videos',
      status: 'pending',
    });
    expect(card.report?.deltaDisplay).toBe('+5.4%');
    expect(card.report?.series).toHaveLength(5);
  });

  it('degrades malformed measurement payloads to a plain suggestion card', () => {
    const card = mapSuggestedActionToInboxCard({
      ...ROW,
      payload: { title: 'Broken report' },
    });

    expect(card.category).toBe('suggestion');
    expect(card.report).toBeUndefined();
  });

  it('sorts report cards to the top of the inbox feed', () => {
    const data = buildOpportunityInboxData([
      {
        id: 'suggestion-1',
        kind: 'calendar.create_event',
        payload: { title: 'Book a show' },
        rationale: null,
        createdAt: new Date('2026-07-05T10:00:00.000Z'),
      },
      ROW,
    ]);

    expect(data.cards.map(card => card.id)).toEqual([
      'report-1',
      'suggestion-1',
    ]);
  });
});
