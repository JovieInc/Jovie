import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { loadFactoryBrief } from './brief';
import { preflightFactoryRun } from './preflight';
import {
  dryProviders,
  FIXTURE_PASS_VERDICT,
  fixtureTransport,
  liveProviders,
} from './providers';
import { runFactory } from './run';
import { FACTORY_STAGE_RUNNERS } from './stages';
import { CONTENT_STAGE_RUNNERS } from './stages-content';

const brief = loadFactoryBrief('solutions', 'founders');

let runsDir: string;

/** A transport that counts every model call. */
function countingTransport() {
  const counter = { calls: 0 };
  const transport = fixtureTransport(() => {
    counter.calls += 1;
    return FIXTURE_PASS_VERDICT;
  });
  return { counter, transport };
}

beforeEach(() => {
  runsDir = mkdtempSync(join(tmpdir(), 'factory-preflight-'));
});

afterEach(() => {
  rmSync(runsDir, { recursive: true, force: true });
});

describe('factory:run preflight', () => {
  it('refuses a live run with no render measurer before any model call', async () => {
    const { counter, transport } = countingTransport();
    const manifest = await runFactory({
      family: 'solutions',
      slug: 'founders',
      runsDir,
      providers: liveProviders(transport),
    });

    expect(manifest).toMatchObject({
      status: 'credentials-unavailable',
      stoppedAt: 'render',
      chain: [],
      preflight: [
        {
          stage: 'render',
          code: 'credentials-unavailable',
          reason: 'no render measurer (CLS/LCP) is wired',
        },
      ],
    });
    expect(counter.calls).toBe(0);
    expect(existsSync(join(runsDir, 'solutions-founders'))).toBe(false);
  });

  it('lists every unreachable model and judge panel at once', () => {
    const issues = preflightFactoryRun({
      brief,
      providers: liveProviders(null),
      runners: FACTORY_STAGE_RUNNERS,
      fromStage: 'truth',
    });

    expect(issues.map(issue => `${issue.stage}: ${issue.reason}`)).toEqual([
      'outcomes: anthropic/claude-opus-5.5 is not reachable from this machine',
      'outcomes: outcomes needs 2 cross-family judge(s); seated 0',
      'narrative: anthropic/claude-opus-5.5 is not reachable from this machine',
      'narrative: narrative needs 2 cross-family judge(s); seated 0',
      'proof: proof needs 1 cross-family judge(s); seated 0',
      'copy: anthropic/claude-opus-5.5 is not reachable from this machine',
      'copy: copy needs 2 cross-family judge(s); seated 0',
      'render: no render measurer (CLS/LCP) is wired',
      'adversarial-trust: adversarial-trust needs 2 cross-family judge(s); seated 0',
    ]);
  });

  it('reports missing runners as incomplete with zero model calls', async () => {
    const { counter, transport } = countingTransport();
    const manifest = await runFactory({
      family: 'solutions',
      slug: 'founders',
      runsDir,
      providers: dryProviders(brief, { transport }),
      runners: CONTENT_STAGE_RUNNERS,
    });

    expect(manifest.status).toBe('incomplete');
    expect(manifest.preflight?.map(issue => issue.stage)).toEqual([
      'media-decision',
      'ref-sourcing',
      'asset',
      'render',
      'seo-agent',
      'adversarial-trust',
      'publish',
    ]);
    expect(manifest.preflight?.every(i => i.code === 'no-runner')).toBe(true);
    expect(counter.calls).toBe(0);
  });

  it('only checks stages from --from-stage onward', () => {
    const issues = preflightFactoryRun({
      brief,
      providers: liveProviders(null),
      runners: FACTORY_STAGE_RUNNERS,
      fromStage: 'render',
    });

    expect(issues.map(issue => issue.stage)).toEqual([
      'render',
      'adversarial-trust',
    ]);
  });

  it('flags image generation a brief needs but the providers lack', () => {
    const media = brief.media.map(entry =>
      entry.sectionInstanceId === 'cta-1'
        ? {
            ...entry,
            input: {
              ...entry.input,
              sectionJob: 'abstract' as const,
              evidence: {},
            },
          }
        : entry
    );
    const issues = preflightFactoryRun({
      brief: { ...brief, media },
      providers: dryProviders(brief, {
        capabilities: { renderMeasurer: true, imageGeneration: false },
      }),
      runners: FACTORY_STAGE_RUNNERS,
      fromStage: 'truth',
    });

    expect(issues).toEqual([
      {
        stage: 'asset',
        code: 'credentials-unavailable',
        reason: 'the brief needs image generation and none is wired',
      },
    ]);
  });

  it('passes a fully wired dry run and refuses a brief with no dry fixture', () => {
    const base = {
      runners: FACTORY_STAGE_RUNNERS,
      fromStage: 'truth' as const,
    };
    expect(
      preflightFactoryRun({ ...base, brief, providers: dryProviders(brief) })
    ).toEqual([]);

    const bare = { ...brief, dry: undefined };
    const issues = preflightFactoryRun({
      ...base,
      brief: bare,
      providers: dryProviders(bare),
    });
    expect(issues.map(issue => issue.stage)).toEqual([
      'outcomes',
      'narrative',
      'copy',
      'render',
    ]);
  });
});
