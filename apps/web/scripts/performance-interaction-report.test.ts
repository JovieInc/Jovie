import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  normalizeSamples,
  parseInteractionAuditCliArgs,
  resolveInteractionAuditEnvironment,
  selectInteractionAuditScenarios,
} from './performance-interaction-audit';
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
    expect(
      getInteractionHotPathById('chat-message-round-trip')?.budget
    ).toEqual(
      expect.objectContaining({
        firstFeedbackP50Ms: 100,
        usableStateP95Ms: 300,
        renderToInteractiveP95Ms: 50,
        maxDroppedFrames: 0,
        minimumSampleCount: 5,
      })
    );
    expect(
      getInteractionHotPathById('lyrics-cue-seek')?.budget.firstFeedbackP95Ms
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

  it('rejects malformed sample envelopes with a clear error', () => {
    expect(() => normalizeSamples({ samples: { scenarioId: 'bad' } })).toThrow(
      'Sample file must be an array or an object with a samples array'
    );
  });

  it('applies first-slice, scenario, and tier filters consistently', () => {
    const scenarios = selectInteractionAuditScenarios({
      firstSliceOnly: true,
      scenarioIds: ['command-palette-open', 'release-table-row-move'],
      tiers: ['P0'],
    });

    expect(scenarios.map(scenario => scenario.id)).toEqual([
      'command-palette-open',
    ]);
  });

  it('resolves interaction audit metadata from a typed script env snapshot', () => {
    expect(
      resolveInteractionAuditEnvironment({
        BASE_URL: 'https://preview.jov.ie',
        INTERACTION_AUDIT_AUTH_PERSONA: 'artist-manager',
        INTERACTION_AUDIT_BROWSER: 'chromium',
        INTERACTION_AUDIT_CPU_PROFILE: '4x',
        INTERACTION_AUDIT_DATASET_SIZE: 'large',
        INTERACTION_AUDIT_NETWORK_PROFILE: 'fast-4g',
        INTERACTION_AUDIT_VIEWPORT: '1440x900',
        NODE_ENV: 'preview',
      })
    ).toEqual({
      authPersona: 'artist-manager',
      baseUrl: 'https://preview.jov.ie',
      browser: 'chromium',
      buildMode: 'preview',
      cpuProfile: '4x',
      datasetSize: 'large',
      networkProfile: 'fast-4g',
      viewport: '1440x900',
    });
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

  it('fails closed when samples reference an unknown scenario id', () => {
    expect(() =>
      buildInteractionLatencyReport({
        samples: [
          {
            firstFeedbackMs: 80,
            runIndex: 0,
            scenarioId: 'unknown-hot-path',
          },
        ],
      })
    ).toThrow('Unknown scenarioId in samples: unknown-hot-path');
  });

  it('rejects malformed next-paint timing samples', () => {
    expect(() =>
      buildInteractionLatencyReport({
        samples: [
          {
            firstFeedbackMs: 80,
            nextPaintMs: -1,
            runIndex: 0,
            scenarioId: 'command-palette-open',
          },
        ],
      })
    ).toThrow('Expected non-negative finite nextPaintMs');
  });

  it('passes the complete chat responsiveness contract', () => {
    const samples: InteractionLatencySample[] = Array.from(
      { length: 5 },
      (_, runIndex) => ({
        droppedFrameCount: 0,
        firstFeedbackMs: 70 + runIndex,
        renderToInteractiveMs: 20 + runIndex,
        runIndex,
        scenarioId: 'chat-message-round-trip',
        usableStateMs: 180 + runIndex * 10,
      })
    );

    const report = buildInteractionLatencyReport({ samples });
    const summary = report.summaries[0];

    expect(report.status).toBe('pass');
    expect(summary?.p50FirstFeedbackMs).toBe(72);
    expect(summary?.p95UsableStateMs).toBe(220);
    expect(summary?.p95RenderToInteractiveMs).toBe(24);
    expect(summary?.maxDroppedFrameCount).toBe(0);
  });

  it.each([
    {
      name: 'too few samples',
      mutate: (samples: InteractionLatencySample[]) => samples.slice(0, 4),
    },
    {
      name: 'slow median feedback',
      mutate: (samples: InteractionLatencySample[]) =>
        samples.map(sample => ({ ...sample, firstFeedbackMs: 101 })),
    },
    {
      name: 'missing usable-state timing',
      mutate: (samples: InteractionLatencySample[]) =>
        samples.map(({ usableStateMs: _timing, ...sample }) => sample),
    },
    {
      name: 'slow usable-state p95',
      mutate: (samples: InteractionLatencySample[]) =>
        samples.map((sample, index) => ({
          ...sample,
          usableStateMs: index === 4 ? 301 : 180,
        })),
    },
    {
      name: 'missing render timing',
      mutate: (samples: InteractionLatencySample[]) =>
        samples.map(({ renderToInteractiveMs: _timing, ...sample }) => sample),
    },
    {
      name: 'slow render-to-interactive p95',
      mutate: (samples: InteractionLatencySample[]) =>
        samples.map((sample, index) => ({
          ...sample,
          renderToInteractiveMs: index === 4 ? 51 : 20,
        })),
    },
    {
      name: 'missing dropped-frame count',
      mutate: (samples: InteractionLatencySample[]) =>
        samples.map(({ droppedFrameCount: _count, ...sample }) => sample),
    },
    {
      name: 'a dropped scroll frame',
      mutate: (samples: InteractionLatencySample[]) =>
        samples.map((sample, index) => ({
          ...sample,
          droppedFrameCount: index === 4 ? 1 : 0,
        })),
    },
  ])('fails closed for chat samples with $name', ({ mutate }) => {
    const completeSamples: InteractionLatencySample[] = Array.from(
      { length: 5 },
      (_, runIndex) => ({
        droppedFrameCount: 0,
        firstFeedbackMs: 70,
        renderToInteractiveMs: 20,
        runIndex,
        scenarioId: 'chat-message-round-trip',
        usableStateMs: 180,
      })
    );

    expect(
      buildInteractionLatencyReport({ samples: mutate(completeSamples) }).status
    ).toBe('fail');
  });
});
