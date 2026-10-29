import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  GOLDEN_PATH_SENTRY_WEIGHT,
  goldenPathSentryBottleneck,
  PIPELINE_BOTTLENECK_SCHEMA,
  parsePipelineBottleneck,
  pipelineBottleneckSchema,
  rankPipelineBottlenecks,
} from '@jovie/agent-transport-contracts/pipeline-bottleneck';
import { readPipelineBottleneck } from '@jovie/agent-transport-contracts/pipeline-bottleneck.node';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  goldenPathSentry,
  legacyBottleneckState,
} from '@/tests/fixtures/pipeline-bottleneck';
import { runPipelineBottleneckLoop } from '../../../../../../scripts/pipeline-bottleneck-loop.mts';

const snapshot = {
  ...legacyBottleneckState,
  golden_path_sentry: goldenPathSentry,
};

describe('pipeline-bottleneck/v1', () => {
  it('accepts legacy state without manufacturing a Sentry measurement', () => {
    const parsed = parsePipelineBottleneck(
      JSON.stringify(legacyBottleneckState)
    );
    expect(parsed).toEqual({
      schema: PIPELINE_BOTTLENECK_SCHEMA,
      ...legacyBottleneckState,
    });
    expect(parsed).not.toHaveProperty('golden_path_sentry');
    expect(
      parsePipelineBottleneck({ ...legacyBottleneckState, ts: 1792756800 })
    ).not.toBeNull();
  });

  it('preserves metrics, legacy fields, watcher health and Sentry observation time', () => {
    const state = {
      ...snapshot,
      watcher_health: { gem: { status: 'ok' } },
      producer: 'box',
    };
    expect(parsePipelineBottleneck(state)).toEqual({
      schema: PIPELINE_BOTTLENECK_SCHEMA,
      ...state,
    });
  });

  it.each([
    { score: -1 },
    { score: 101 },
    { score: Number.NaN },
    { score: Number.POSITIVE_INFINITY },
    { unresolved_issues: -1 },
    { unresolved_issues: 0.5 },
    { unresolved_issues: '3' },
    { users_affected_24h: -1 },
    { users_affected_24h: 1.5 },
    { top_issue: { title: '', flow: 'sign-in', users: 1 } },
    { top_issue: { title: 'Failed', flow: '', users: 1 } },
    { top_issue: { title: 'Failed', flow: 'sign-in', users: -1 } },
    { checked_at: 'yesterday' },
  ])('rejects malformed Sentry evidence: %j', invalid => {
    expect(
      parsePipelineBottleneck({
        ...snapshot,
        golden_path_sentry: { ...goldenPathSentry, ...invalid },
      })
    ).toBeNull();
  });

  it.each([
    null,
    {},
    '{broken',
    { ...snapshot, schema: 'pipeline-bottleneck/v2' },
    { ...snapshot, metrics: [] },
    { ...snapshot, ranking: 'queue' },
    { ...snapshot, watcher_health: false },
  ])('rejects corrupt or incompatible snapshots', input => {
    expect(parsePipelineBottleneck(input)).toBeNull();
  });

  it('ranks regressions ahead of every legacy weight without mutating the snapshot', () => {
    const state = pipelineBottleneckSchema.parse(snapshot);
    const ranking = rankPipelineBottlenecks(state);
    expect(ranking[0]).toMatchObject({
      id: 'golden_path_sentry',
      score: 72,
      checked_at: goldenPathSentry.checked_at,
    });
    expect(ranking[0]?.weight).toBeGreaterThan(
      legacyBottleneckState.ranking[0].weight
    );
    expect(ranking[0]?.weight).toBeGreaterThanOrEqual(
      GOLDEN_PATH_SENTRY_WEIGHT
    );
    expect(ranking.slice(1)).toEqual(legacyBottleneckState.ranking);
    expect(state.ranking).toEqual(legacyBottleneckState.ranking);
    expect(rankPipelineBottlenecks({ ...state, ranking })).toEqual(ranking);
  });

  it('uses the Sentry weight floor for legacy rows without finite weights', () => {
    const state = pipelineBottleneckSchema.parse({
      ...snapshot,
      ranking: [
        { title: 'Waiting' },
        { weight: Number.NaN },
        { weight: Number.POSITIVE_INFINITY },
      ],
    });
    expect(rankPipelineBottlenecks(state)[0]?.weight).toBe(
      GOLDEN_PATH_SENTRY_WEIGHT
    );
  });

  it('prioritizes unresolved issues even when affected users are unknown or zero', () => {
    expect(
      goldenPathSentryBottleneck({
        ...goldenPathSentry,
        users_affected_24h: 0,
        top_issue: null,
      })?.detail
    ).toContain('0 users affected');
  });

  it('prioritizes affected users even when the unresolved issue count is zero', () => {
    expect(
      goldenPathSentryBottleneck({ ...goldenPathSentry, unresolved_issues: 0 })
    ).not.toBeNull();
  });

  it('removes old generated rows after recovery or when Sentry is absent', () => {
    const state = pipelineBottleneckSchema.parse(snapshot);
    const ranking = rankPipelineBottlenecks(state);
    const healthy = {
      ...goldenPathSentry,
      score: 100,
      unresolved_issues: 0,
      users_affected_24h: 0,
      top_issue: null,
    };
    for (const sentry of [healthy, undefined]) {
      expect(
        rankPipelineBottlenecks({
          ...state,
          ranking,
          golden_path_sentry: sentry,
        })
      ).toEqual(legacyBottleneckState.ranking);
    }
  });
});

describe('shared snapshot reader and hourly iteration', () => {
  let directory: string;
  let path: string;
  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'pipeline-bottleneck-'));
    path = join(directory, 'bottleneck-state.json');
  });
  afterEach(async () => {
    await rm(directory, { recursive: true, force: true });
  });

  it('treats unconfigured, unreadable, missing and invalid files as unavailable', async () => {
    expect(await readPipelineBottleneck(undefined)).toBeNull();
    expect(await runPipelineBottleneckLoop(path)).toBeNull();
    expect(await readPipelineBottleneck(directory)).toBeNull();
    await writeFile(path, '{broken');
    expect(await readPipelineBottleneck(path)).toBeNull();
  });

  it('uses the same parser for the HUD and hourly loop without overwriting the producer', async () => {
    const original = JSON.stringify(snapshot);
    await writeFile(path, original);
    const hudState = await readPipelineBottleneck(path);
    const loopState = await runPipelineBottleneckLoop(path);
    expect(hudState?.golden_path_sentry).toEqual(goldenPathSentry);
    expect(loopState?.ranking[0]?.id).toBe('golden_path_sentry');
    expect(loopState?.unmeasured).toEqual(legacyBottleneckState.unmeasured);
    expect(await readFile(path, 'utf8')).toBe(original);
  });
});
