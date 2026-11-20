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
  INTERACTION_HOT_PATHS,
  type InteractionLatencyBudget,
} from './performance-interaction-manifest';
import {
  buildInteractionLatencyReport,
  type InteractionLatencySample,
  percentile,
  renderInteractionLatencyMarkdown,
} from './performance-interaction-report';

function scenario(id: string) {
  const definition = getInteractionHotPathById(id);
  if (!definition) throw new Error(`Missing test scenario: ${id}`);
  return definition;
}

const chatScenario = scenario('chat-message-round-trip');
const chatSamples = (): InteractionLatencySample[] =>
  Array.from({ length: 5 }, (_, runIndex) => ({
    scenarioId: chatScenario.id,
    runIndex,
    firstFeedbackMs: 70,
    usableStateMs: 180,
    renderToInteractiveMs: 20,
    droppedFrameCount: 0,
  }));

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
        firstFeedbackP95Ms: 100,
        usableStateP95Ms: 300,
        renderToInteractiveP95Ms: 50,
        maxDroppedFrames: 0,
        minimumSampleCount: 5,
      })
    );
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

  it('keeps the chat ratchet failed on cold mounts and passing once warm', () => {
    // Oct 2 Extended Smoke, job 110919347908. n=5 makes p95 the worst sample.
    const coldMounts = [
      [180.1, 580.4, 29.6],
      [148.1, 314.3, 37.2],
      [119.6, 273, 9],
      [50, 141.9, 17.8],
      [47.9, 147.5, 10.4],
    ] as const;
    const warmTail = [
      [50, 141.9, 17.8],
      [47.9, 147.5, 10.4],
      [48, 145, 12],
      [46, 140, 11],
      [49, 143, 10],
    ] as const;

    const reportFor = (rows: readonly (readonly number[])[]) =>
      buildInteractionLatencyReport({
        scenarios: [chatScenario],
        samples: rows.map(
          (
            [firstFeedbackMs, usableStateMs, renderToInteractiveMs],
            runIndex
          ) => ({
            droppedFrameCount: 0,
            firstFeedbackMs,
            renderToInteractiveMs,
            runIndex,
            scenarioId: 'chat-message-round-trip',
            usableStateMs,
          })
        ),
      });

    const cold = reportFor(coldMounts);
    const warm = reportFor(warmTail);
    const chat = (report: ReturnType<typeof buildInteractionLatencyReport>) =>
      report.summaries.find(
        summary => summary.scenario.id === 'chat-message-round-trip'
      );

    expect(cold.status).toBe('fail');
    expect(chat(cold)?.passed).toBe(false);
    expect(chat(cold)?.p95UsableStateMs).toBe(580.4);
    expect(warm.status).toBe('pass');
    expect(chat(warm)?.passed).toBe(true);
    const chatBudget: InteractionLatencyBudget | undefined =
      getInteractionHotPathById('chat-message-round-trip')?.budget;
    expect(chatBudget?.usableStateP95Ms).toBe(300);
    expect(chatBudget?.firstFeedbackP50Ms).toBe(100);
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
      scenarios: [
        scenario('command-palette-open'),
        scenario('audio-play-pause-visual'),
      ],
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
      scenarios: [scenario('command-palette-open')],
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

    const report = buildInteractionLatencyReport({
      samples,
      scenarios: [chatScenario],
    });
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
      buildInteractionLatencyReport({
        samples: mutate(completeSamples),
        scenarios: [chatScenario],
      }).status
    ).toBe('fail');
  });
});

describe('interaction report qualification boundaries', () => {
  it('fails a slow feedback tail while feedback median and usable state pass', () => {
    const samples = chatSamples().map((sample, index) => ({
      ...sample,
      firstFeedbackMs: index === 4 ? 231.8 : 56.3,
    }));
    const report = buildInteractionLatencyReport({
      samples,
      scenarios: [chatScenario],
    });
    expect(report.summaries[0]).toMatchObject({
      p50FirstFeedbackMs: 56.3,
      p95FirstFeedbackMs: 231.8,
      p95UsableStateMs: 180,
      passed: false,
    });
    expect(report.status).toBe('fail');
  });

  it.each([
    ['firstFeedbackP50Ms', 'firstFeedbackMs', 100],
    ['firstFeedbackP95Ms', 'firstFeedbackMs', 100],
    ['usableStateP95Ms', 'usableStateMs', 300],
    ['renderToInteractiveP95Ms', 'renderToInteractiveMs', 50],
  ] as const)(
    'enforces strict chat %s at and around its limit',
    (budget, metric, limit) => {
      // Relax the tail only to exercise p50 independently of the stricter p95.
      const required =
        budget === 'firstFeedbackP50Ms'
          ? {
              ...chatScenario,
              budget: { ...chatScenario.budget, firstFeedbackP95Ms: 150 },
            }
          : chatScenario;
      for (const [value, expected] of [
        [limit - 0.01, 'pass'],
        [limit, 'fail'],
        [limit + 0.01, 'fail'],
      ] as const) {
        const samples = chatSamples().map(sample => ({
          ...sample,
          [metric]: value,
        }));
        expect(
          buildInteractionLatencyReport({ samples, scenarios: [required] })
            .status,
          `${budget} measured at ${value}ms`
        ).toBe(expected);
      }
    }
  );

  it('retains inclusive boundaries for non-chat budgets and enforces feedback independently', () => {
    const required = scenario('command-palette-open');
    const sample = {
      scenarioId: required.id,
      runIndex: 0,
      firstFeedbackMs: 100,
      usableStateMs: 100,
    };
    expect(
      buildInteractionLatencyReport({
        samples: [sample],
        scenarios: [required],
      }).status
    ).toBe('pass');
    for (const metric of ['firstFeedbackMs', 'usableStateMs'] as const) {
      expect(
        buildInteractionLatencyReport({
          samples: [{ ...sample, [metric]: 100.01 }],
          scenarios: [required],
        }).status
      ).toBe('fail');
    }
  });

  it('enforces a declared data-ready budget, including per-sample presence', () => {
    const required = {
      ...scenario('command-palette-open'),
      budget: {
        ...scenario('command-palette-open').budget,
        dataReadyP95Ms: 100,
      },
    };
    for (const [dataReadyMs, expected] of [
      [99.99, 'pass'],
      [100, 'pass'],
      [100.01, 'fail'],
      [undefined, 'fail'],
    ] as const) {
      expect(
        buildInteractionLatencyReport({
          scenarios: [required],
          samples: [
            {
              scenarioId: required.id,
              runIndex: 0,
              firstFeedbackMs: 50,
              usableStateMs: 70,
              dataReadyMs,
            },
          ],
        }).status
      ).toBe(expected);
    }
  });

  it('requires five distinct scored samples and no dropped frames', () => {
    for (const [sampleCount, expected] of [
      [4, 'fail'],
      [5, 'pass'],
      [6, 'pass'],
    ] as const) {
      const samples = Array.from({ length: sampleCount }, (_, runIndex) => ({
        ...chatSamples()[0],
        runIndex,
      }));
      expect(
        buildInteractionLatencyReport({ samples, scenarios: [chatScenario] })
          .status
      ).toBe(expected);
    }
    for (const droppedFrameCount of [0, 1]) {
      const samples = chatSamples().map(sample => ({
        ...sample,
        droppedFrameCount,
      }));
      expect(
        buildInteractionLatencyReport({ samples, scenarios: [chatScenario] })
          .status
      ).toBe(droppedFrameCount === 0 ? 'pass' : 'fail');
    }
  });

  it.each([
    'usableStateMs',
    'renderToInteractiveMs',
    'droppedFrameCount',
  ] as const)(
    'fails when even one scored sample is missing required %s',
    metric => {
      const samples = chatSamples().map((sample, index) =>
        index === 4 ? { ...sample, [metric]: undefined } : sample
      );
      expect(
        buildInteractionLatencyReport({ samples, scenarios: [chatScenario] })
          .status
      ).toBe('fail');
    }
  );

  it('cannot certify only the scenarios that happened to emit samples', () => {
    const report = buildInteractionLatencyReport({ samples: chatSamples() });
    expect(report.summaries).toHaveLength(INTERACTION_HOT_PATHS.length);
    expect(report.status).toBe('fail');
  });

  it('cannot pass when a required scenario is omitted or skipped', () => {
    const required = [chatScenario, scenario('audio-play-pause-visual')];
    const report = buildInteractionLatencyReport({
      samples: chatSamples(),
      scenarios: required,
    });
    expect(report.status).toBe('fail');
    expect(
      report.summaries.find(
        row => row.scenario.id === 'audio-play-pause-visual'
      )?.passed
    ).toBeNull();
    expect(
      buildInteractionLatencyReport({ samples: [], scenarios: required }).status
    ).toBe('pending');
    expect(
      buildInteractionLatencyReport({ samples: [], scenarios: [] }).status
    ).toBe('pending');
  });

  it('rejects duplicate scored identities instead of counting them toward n=5', () => {
    const samples = chatSamples();
    samples[4] = samples[0];
    expect(() =>
      buildInteractionLatencyReport({ samples, scenarios: [chatScenario] })
    ).toThrow('Duplicate sample identity');
  });

  it('rejects duplicate required scenario declarations', () => {
    expect(() =>
      buildInteractionLatencyReport({
        samples: chatSamples(),
        scenarios: [chatScenario, chatScenario],
      })
    ).toThrow('Duplicate required scenario id');
  });

  it.each([
    -1,
    0.5,
    Number.NaN,
    Number.POSITIVE_INFINITY,
    Number.MAX_SAFE_INTEGER + 1,
    '0',
    null,
  ])('rejects malformed run index %s', runIndex => {
    expect(() =>
      buildInteractionLatencyReport({
        samples: [{ ...chatSamples()[0], runIndex: runIndex as number }],
      })
    ).toThrow('Expected non-negative safe integer runIndex');
  });

  it.each([
    'firstFeedbackMs',
    'nextPaintMs',
    'usableStateMs',
    'dataReadyMs',
    'renderToInteractiveMs',
    'reactCommitMs',
  ] as const)(
    'rejects malformed %s even outside the selected scope',
    metric => {
      for (const value of [
        -1,
        Number.NaN,
        Number.POSITIVE_INFINITY,
        '10',
        null,
      ]) {
        expect(() =>
          buildInteractionLatencyReport({
            samples: [
              {
                ...chatSamples()[0],
                [metric]: value,
              } as InteractionLatencySample,
            ],
            scenarios: [scenario('command-palette-open')],
          })
        ).toThrow(`Expected non-negative finite ${metric}`);
      }
    }
  );

  it.each([
    'droppedFrameCount',
    'longTaskCount',
    'networkRequestCount',
    'requestWaterfallCount',
  ] as const)('rejects malformed %s counts', metric => {
    for (const value of [
      -1,
      Number.NaN,
      Number.POSITIVE_INFINITY,
      '1',
      null,
      0.5,
      Number.MAX_SAFE_INTEGER + 1,
    ]) {
      expect(() =>
        buildInteractionLatencyReport({
          samples: [
            {
              ...chatSamples()[0],
              [metric]: value,
            } as InteractionLatencySample,
          ],
        })
      ).toThrow(metric);
    }
  });

  it('rejects a missing mandatory feedback timing', () => {
    const { firstFeedbackMs: _timing, ...sample } = chatSamples()[0];
    expect(() =>
      buildInteractionLatencyReport({
        samples: [sample as InteractionLatencySample],
      })
    ).toThrow('Expected non-negative finite firstFeedbackMs');
  });

  it('rejects unknown samples even with an explicit required scope', () => {
    expect(() =>
      buildInteractionLatencyReport({
        samples: [{ ...chatSamples()[0], scenarioId: 'unknown-hot-path' }],
        scenarios: [chatScenario],
      })
    ).toThrow('Unknown scenarioId in samples: unknown-hot-path');
  });
});
