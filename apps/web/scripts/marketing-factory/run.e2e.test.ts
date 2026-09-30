import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { FACTORY_STAGES } from '../../data/marketing/factory/spine';
import { loadFactoryBrief } from './brief';
import { dryProviders, fixtureTransport, liveProviders } from './providers';
import {
  readJson,
  type StageAttemptRecord,
  verifyFactoryRun,
  writeJson,
} from './receipts';
import { runFactory } from './run';

const PAGE_ID = 'solutions-founders';
const brief = loadFactoryBrief('solutions', 'founders');

let runsDir: string;
const runDir = () => join(runsDir, PAGE_ID);
const record = (file: string) =>
  readJson<StageAttemptRecord>(join(runDir(), file));

function run(options: Partial<Parameters<typeof runFactory>[0]> = {}) {
  return runFactory({
    family: 'solutions',
    slug: 'founders',
    dry: true,
    runsDir,
    ...options,
  });
}

beforeEach(() => {
  runsDir = mkdtempSync(join(tmpdir(), 'factory-e2e-'));
});

afterEach(() => {
  rmSync(runsDir, { recursive: true, force: true });
});

describe('factory:run --dry end to end', () => {
  it('writes a complete, verifiable receipt chain for the fixture solutions page', async () => {
    const manifest = await run();

    expect(manifest).toMatchObject({ status: 'complete', stoppedAt: null });
    expect(manifest.chain.map(link => link.stage)).toEqual([...FACTORY_STAGES]);
    expect(verifyFactoryRun(runDir())).toEqual([]);
    expect(record('11-asset.attempt-1.json').artifact).toMatchObject({
      assets: [
        { id: 'capture:public-profile-desktop', mime: 'image/png' },
        { id: 'capture:tim-white-profile-subscribe-mobile' },
      ],
    });
    expect(record('13-seo-agent.attempt-1.json').notes).toEqual({
      deferredToRamp: ['geo:geo-orphan'],
    });
    const trust = record('14-adversarial-trust.attempt-1.json').receipt;
    expect(new Set(trust.evaluators.map(e => e.family)).size).toBe(2);
    expect(record('15-publish.attempt-1.json').artifact).toMatchObject({
      rampState: 'shadow',
    });
    expect(
      readJson<{ status: string }>(join(runDir(), 'page-record.json')).status
    ).toBe('shadow');
  });

  it('resumes from a later stage on top of verified receipts', async () => {
    await run();
    const resumed = await run({ fromStage: 'render' });

    expect(resumed.status).toBe('complete');
    expect(verifyFactoryRun(runDir())).toEqual([]);
  });

  it('catches a tampered artifact in a real run', async () => {
    await run();
    const path = join(runDir(), '04-copy.attempt-1.json');
    const tampered = readJson<StageAttemptRecord>(path);
    writeJson(path, {
      ...tampered,
      artifact: { pageId: PAGE_ID, slots: [] },
    });

    expect(verifyFactoryRun(runDir())).toEqual(
      expect.arrayContaining([
        'copy#1: artifact fails the copy schema',
        'copy#1: artifact digest does not match the receipt',
      ])
    );
  });
});

describe('page stage gates', () => {
  it('fails the red team when a judge finds an unsupported claim', async () => {
    const manifest = await run({
      providers: dryProviders(brief, {
        transport: fixtureTransport(({ prompt }) =>
          JSON.stringify({
            scores: Object.fromEntries(
              [
                'outcome',
                'specificity',
                'economy',
                'voice',
                'truth',
                'safety',
                'human',
              ].map(dimension => [dimension, 9])
            ),
            confidence: 0.9,
            score: 0.9,
            verdict: 'pass',
            unsupportedClaims: prompt.includes('"proof"')
              ? ['Start free. It costs $0.']
              : [],
          })
        ),
      }),
    });

    expect(manifest).toMatchObject({
      status: 'failed',
      stoppedAt: 'adversarial-trust',
    });
    expect(record('14-adversarial-trust.attempt-2.json').feedbackIn).toContain(
      'no-unsupported-claims'
    );
  });

  it('fails render when CLS or LCP is over budget', async () => {
    const manifest = await run({
      providers: dryProviders(brief, {
        measureRender: async () => ({ status: 'ok', cls: 0.2, lcpMs: 3100 }),
      }),
    });

    expect(manifest).toMatchObject({ status: 'failed', stoppedAt: 'render' });
    expect(record('12-render.attempt-1.json').receipt.invariantsFailed).toEqual(
      ['render-cls', 'render-lcp']
    );
  });

  it('stops live runs at render until a render measurer is wired', async () => {
    const live = liveProviders(fixtureTransport(), {
      generate: dryProviders(brief).generate,
    });
    const manifest = await run({ providers: live });

    expect(manifest).toMatchObject({
      status: 'credentials-unavailable',
      stoppedAt: 'render',
      mode: 'live',
    });
  });
});
