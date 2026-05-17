import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { parseInteractionAuditCliArgs } from './performance-interaction-audit';
import {
  getFirstSliceInteractionHotPaths,
  getInteractionHotPathById,
} from './performance-interaction-manifest';
import {
  buildInteractionLatencyReport,
  type InteractionLatencySample,
  percentile,
  renderInteractionLatencyMarkdown,
} from './performance-interaction-report';

const webRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

describe('performance interaction manifest', () => {
  it('keeps the first slice bounded to the approved P0/P1 audit size', () => {
    const firstSlice = getFirstSliceInteractionHotPaths();

    expect(firstSlice.length).toBeGreaterThanOrEqual(3);
    expect(firstSlice.length).toBeLessThanOrEqual(5);
    expect(firstSlice.every(scenario => scenario.tier !== 'P2')).toBe(true);
    expect(firstSlice.every(scenario => scenario.ia.trigger)).toBe(true);
    expect(firstSlice.every(scenario => scenario.ia.usableState)).toBe(true);
  });

  it('stores concrete product budgets from the hot-path audit', () => {
    expect(
      getInteractionHotPathById('command-palette-open')?.budget
        .firstFeedbackP95Ms
    ).toBe(100);
    expect(
      getInteractionHotPathById('command-palette-filter')?.budget
        .firstFeedbackP95Ms
    ).toBe(50);
  });
});

describe('performance interaction audit cli', () => {
  it('accepts repo-root style apps/web output paths from package scripts', () => {
    const options = parseInteractionAuditCliArgs([
      '--out-dir',
      'apps/web/test-results/interaction-latency-smoke',
      '--sample-file',
      'apps/web/test-results/interaction-latency-smoke/samples.json',
    ]);

    expect(options.outDir).toBe(
      resolve(webRoot, 'test-results', 'interaction-latency-smoke')
    );
    expect(options.sampleFile).toBe(
      resolve(
        webRoot,
        'test-results',
        'interaction-latency-smoke',
        'samples.json'
      )
    );
  });
});

describe('performance interaction report', () => {
  it('uses nearest-rank percentiles for small audit samples', () => {
    expect(percentile([10, 20, 30, 40, 50], 50)).toBe(30);
    expect(percentile([10, 20, 30, 40, 50], 95)).toBe(50);
    expect(percentile([], 95)).toBeNull();
  });

  it('ranks failing manager-loop interactions ahead of passing lower risk ones', () => {
    const samples: InteractionLatencySample[] = [
      {
        firstFeedbackMs: 140,
        nextPaintMs: 18,
        rootCauseBucket: 'react-render-cascade',
        runIndex: 0,
        scenarioId: 'command-palette-open',
        usableStateMs: 160,
      },
      {
        firstFeedbackMs: 28,
        nextPaintMs: 16,
        rootCauseBucket: 'main-thread-blocking',
        runIndex: 0,
        scenarioId: 'audio-play-pause-visual',
        usableStateMs: 32,
      },
    ];

    const report = buildInteractionLatencyReport({
      generatedAt: '2026-05-17T00:00:00.000Z',
      samples,
    });

    expect(report.status).toBe('fail');
    expect(report.summaries[0]?.scenario.id).toBe('command-palette-open');
    expect(report.summaries[0]?.p95NextPaintMs).toBe(18);
    expect(report.summaries[0]?.passed).toBe(false);
    expect(report.summaries[1]?.passed).toBe(true);
  });

  it('renders the requested ranked markdown table shape', () => {
    const report = buildInteractionLatencyReport({
      generatedAt: '2026-05-17T00:00:00.000Z',
      samples: [
        {
          cacheStatus: 'hit',
          firstFeedbackMs: 80,
          rootCauseBucket: 'unknown',
          runIndex: 0,
          scenarioId: 'command-palette-open',
          usableStateMs: 90,
        },
      ],
    });

    const markdown = renderInteractionLatencyMarkdown(report);

    expect(markdown).toContain('| Rank | Hot path | Current p95 |');
    expect(markdown).toContain('Command palette opens from keyboard');
    expect(markdown).toContain(
      '| 1 | Command palette opens from keyboard | 90ms |'
    );
    expect(markdown).toContain('90ms');
  });
});
