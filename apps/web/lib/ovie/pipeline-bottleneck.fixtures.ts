import type {
  MergedPipelineBottleneck,
  PipelineBottleneckContribution,
} from './pipeline-bottleneck';

export function bottleneckFixture(
  overrides: Partial<MergedPipelineBottleneck> = {}
): MergedPipelineBottleneck {
  return {
    schema: 'pipeline-bottleneck/v1',
    observedAt: new Date(Date.now()).toISOString(),
    status: 'agentic',
    rank1: {
      id: 'runner-capacity',
      title: 'Runner capacity',
      oneLine: 'Qualified repairs are waiting for runner capacity.',
    },
    owner: 'Summer',
    dispatchRef: 'repair:runner-capacity',
    cost: null,
    impact: null,
    statusLink: 'https://github.com/JovieInc/Jovie/pull/17005',
    metric: 'Queued work 2 with capacity 1',
    sourceDigest: 'a'.repeat(64),
    metrics: {},
    ...overrides,
  };
}

export function contributionFixture(
  overrides: Partial<PipelineBottleneckContribution> = {}
): PipelineBottleneckContribution {
  return {
    schema: 'pipeline-bottleneck-contribution/v1',
    observedAt: new Date(Date.now()).toISOString(),
    metrics: { symphonyCpu: { value: 94, unit: '%', label: 'Symphony CPU' } },
    status: 'needs-you',
    rank1Override: {
      id: 'runner-memory',
      title: 'Runner memory',
      oneLine: 'Runner memory is limiting concurrent repairs.',
    },
    cost: { item: 'Runner memory', monthlyUsd: 24 },
    impact: 'Adds capacity for two concurrent repairs.',
    statusLink: 'https://linear.app/jovie/issue/JOV-5974/raise-runner-memory',
    metric: 'Runner memory 94% sustained',
    ...overrides,
  };
}
