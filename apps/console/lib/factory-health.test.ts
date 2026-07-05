import { describe, expect, it } from 'vitest';
import {
  fetchFactoryHealthMetrics,
  renderFactoryHealthStrip,
  renderSparklineSvg,
} from './factory-health';

describe('fetchFactoryHealthMetrics', () => {
  it('degrades gracefully when GitHub token is missing', async () => {
    const snapshot = await fetchFactoryHealthMetrics({});

    expect(snapshot.metrics).toHaveLength(5);
    expect(snapshot.metrics[0]?.id).toBe('cycle-time');
    expect(snapshot.metrics[0]?.value).toBe('—');
    expect(snapshot.metrics[0]?.availability).toBe('not_configured');
    expect(snapshot.metrics[2]?.id).toBe('incident-mttr');
    expect(snapshot.metrics[2]?.availability).toBe('not_instrumented');
    expect(snapshot.metrics[4]?.id).toBe('cost-per-pr');
    expect(snapshot.metrics[4]?.subtitle).toContain('Not instrumented');
  });
});

describe('renderSparklineSvg', () => {
  it('renders a polyline for multi-point trends', () => {
    const svg = renderSparklineSvg([1, 3, 2, 5, 4]);
    expect(svg).toContain('<path d="M');
    expect(svg).toContain('stroke="#4d7dff"');
  });

  it('renders a flat fallback line for single-point trends', () => {
    const svg = renderSparklineSvg([42]);
    expect(svg).toContain('<line');
  });
});

describe('renderFactoryHealthStrip', () => {
  it('renders five metrics with sparklines and graceful placeholders', () => {
    const html = renderFactoryHealthStrip({
      computedAt: '2026-06-20T12:00:00.000Z',
      metrics: [
        {
          id: 'cycle-time',
          label: 'Cycle time',
          value: '18.5h',
          subtitle: 'Median signal to production (7d)',
          availability: 'available',
          trend7d: [10, 12, 11, 15, 14, 16, 18.5],
        },
        {
          id: 'autonomy-ratio',
          label: 'Autonomy ratio',
          value: '72%',
          subtitle: 'Merged agent PRs with zero human commits (7d)',
          availability: 'available',
          trend7d: [0.5, 0.6, 0.7, 0.8, 0.7, 0.75, 0.72],
        },
        {
          id: 'incident-mttr',
          label: 'Incident MTTR',
          value: '—',
          subtitle: 'Not instrumented — observability pipeline (#10936)',
          availability: 'not_instrumented',
          trend7d: [0, 0, 0, 0, 0, 0, 0],
        },
        {
          id: 'code-shelf-life',
          label: 'Code shelf life',
          value: '—',
          subtitle: 'Not instrumented — git churn telemetry pending',
          availability: 'not_instrumented',
          trend7d: [0, 0, 0, 0, 0, 0, 0],
        },
        {
          id: 'cost-per-pr',
          label: 'Cost / merged PR',
          value: '—',
          subtitle: 'Not instrumented — model + CI spend ledger pending',
          availability: 'not_instrumented',
          trend7d: [0, 0, 0, 0, 0, 0, 0],
        },
      ],
    });

    expect(html).toContain('data-testid="factory-health-strip"');
    expect(html).toContain('Factory health');
    expect(html).toContain('18.5h');
    expect(html).toContain('72%');
    expect(html).toContain(
      'Not instrumented — observability pipeline (#10936)'
    );
    expect((html.match(/<path d="M/g) ?? []).length).toBeGreaterThanOrEqual(2);
  });
});
