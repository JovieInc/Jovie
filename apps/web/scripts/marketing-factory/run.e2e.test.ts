import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  isRoutedPageRecord,
  PageRecordSchema,
} from '../../data/marketing/factory/pageRecord';
import { FACTORY_STAGES } from '../../data/marketing/factory/spine';
import { loadFactoryBrief } from './brief';
import { dryProviders, fixtureTransport, liveProviders } from './providers';
import {
  readJson,
  type StageAttemptRecord,
  verifyFactoryRun,
  writeJson,
} from './receipts';
import { fixtureCaptures } from './render-measurer';
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
    expect(record('12-asset.attempt-1.json').artifact).toMatchObject({
      assets: [
        { id: 'capture:public-profile-desktop', mime: 'image/png' },
        { id: 'capture:tim-white-profile-subscribe-mobile' },
      ],
    });
    expect(record('14-seo-agent.attempt-1.json').notes).toEqual({
      deferredToRamp: ['geo:geo-orphan'],
    });
    const trust = record('15-adversarial-trust.attempt-1.json').receipt;
    expect(new Set(trust.evaluators.map(e => e.family)).size).toBe(2);
    expect(record('16-publish.attempt-1.json').artifact).toMatchObject({
      rampState: 'shadow',
    });
    const pageRecord = PageRecordSchema.parse(
      readJson(join(runDir(), 'page-record.json'))
    );
    expect(pageRecord).toMatchObject({
      id: 'solutions.founders',
      status: 'shadow',
      heroVariant: 'f-layout-desktop-screenshot',
      proof: ['product-profile-subscribe-capture'],
      seo: { title: 'Claim your public profile', hub: null },
    });
    expect(pageRecord.composition.sections).toEqual([
      {
        renderer: 'factory-hero',
        instanceId: 'hero-1',
        sectionId: 'hero',
      },
      {
        renderer: 'factory-feature-split',
        instanceId: 'capture-1',
        sectionId: 'feature-split',
      },
      {
        renderer: 'factory-cta',
        instanceId: 'cta-1',
        sectionId: 'cta',
      },
    ]);
    expect(isRoutedPageRecord(pageRecord)).toBe(false);
    expect(pageRecord.trust).toBe(0.9);
    expect(pageRecord.receipts.map(r => r.stage)).toEqual(
      FACTORY_STAGES.slice(0, -1)
    );
    expect(pageRecord.media['hero-1']).toMatchObject({
      kind: 'screenshot-registry',
      id: 'public-profile-desktop',
    });
  });

  it('rejects an unknown story section before copy or render', async () => {
    const narrative = brief.dry?.narrative as {
      sections: { sectionId: string }[];
    };
    const manifest = await run({
      providers: dryProviders(brief, {
        async generate(request) {
          const value =
            request.stage === 'narrative'
              ? {
                  sections: narrative.sections.map((section, index) =>
                    index === 1
                      ? { ...section, sectionId: 'not-a-section' }
                      : section
                  ),
                }
              : brief.dry?.[request.stage];
          return { status: 'ok', value };
        },
      }),
    });

    expect(manifest).toMatchObject({ status: 'failed', stoppedAt: 'layout' });
    expect(manifest.chain.map(link => link.stage)).not.toContain('copy');
    expect(manifest.chain.map(link => link.stage)).not.toContain('render');
  });

  it('fails render when the run cannot form a valid page record', async () => {
    const manifest = await run({
      brief: {
        ...brief,
        seo: { ...brief.seo, jsonLdTypes: ['WebPage'] },
      },
    });

    expect(manifest).toMatchObject({ status: 'failed', stoppedAt: 'render' });
    expect(
      record('13-render.attempt-1.json').receipt.invariantsFailed
    ).toContain('page-record-schema');
  });

  it('resumes from a later stage on top of verified receipts', async () => {
    await run();
    const resumed = await run({ fromStage: 'render' });

    expect(resumed.status).toBe('complete');
    expect(verifyFactoryRun(runDir())).toEqual([]);
  });

  it('catches a tampered artifact in a real run', async () => {
    await run();
    const path = join(runDir(), '09-copy.attempt-1.json');
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
  it('fails rights-cleared photos without calling the image generator', async () => {
    let generated = 0;
    const media = brief.media.map(entry =>
      entry.sectionInstanceId === 'cta-1'
        ? {
            ...entry,
            input: {
              ...entry.input,
              sectionJob: 'person' as const,
              evidence: {
                realPhoto: {
                  id: 'founder-portrait',
                  rights: 'owned' as const,
                  credit: 'Jovie',
                },
              },
            },
          }
        : entry
    );
    const manifest = await run({
      allowPartial: true,
      brief: { ...brief, media },
      providers: liveProviders(fixtureTransport(), {
        generate: dryProviders(brief).generate,
        generateAsset: async () => {
          generated += 1;
          return {
            status: 'credentials-unavailable',
            provider: 'x',
            reason: 'x',
          };
        },
      }),
    });

    expect(manifest).toMatchObject({ status: 'failed', stoppedAt: 'asset' });
    expect(generated).toBe(0);
    expect(record('12-asset.attempt-1.json').receipt.invariantsFailed).toEqual([
      'asset-provenance:photo:founder-portrait',
    ]);
  });

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
    expect(record('15-adversarial-trust.attempt-2.json').feedbackIn).toContain(
      'no-unsupported-claims'
    );
  });

  it('hands the render measurer the candidate record to preview', async () => {
    const seen: unknown[] = [];
    const dry = dryProviders(brief);
    await run({
      providers: dryProviders(brief, {
        measureRender: async (route, at) => {
          seen.push(at);
          return dry.measureRender(route, at);
        },
      }),
    });

    const runsDir = join(runDir(), 'render', 'preview-records');
    expect(seen).toEqual([
      {
        outDir: join(runDir(), 'render'),
        preview: { recordId: 'solutions.founders', runsDir },
      },
    ]);
    expect(
      readJson<{ id: string; status: string }>(
        join(runsDir, 'solutions-founders', 'page-record.json')
      )
    ).toMatchObject({ id: 'solutions.founders', status: 'shadow' });
  });

  it('fails render when CLS or LCP is over budget', async () => {
    const manifest = await run({
      providers: dryProviders(brief, {
        measureRender: async route => ({
          status: 'ok',
          cls: 0.2,
          lcpMs: 3100,
          captures: fixtureCaptures(route, { cls: 0.2, lcpMs: 3100 }),
        }),
      }),
    });

    expect(manifest).toMatchObject({ status: 'failed', stoppedAt: 'render' });
    expect(record('13-render.attempt-1.json').receipt.invariantsFailed).toEqual(
      [
        'render-cls:mobile',
        'render-lcp:mobile',
        'render-cls:desktop',
        'render-lcp:desktop',
      ]
    );
  });

  it('blocks trust when no visual-review receipt can be produced', async () => {
    const manifest = await run({
      providers: dryProviders(brief, {
        reviewVisual: async () => ({
          status: 'credentials-unavailable',
          reason: 'no cross-family vision judge is reachable from this machine',
        }),
      }),
    });

    expect(manifest).toMatchObject({
      status: 'credentials-unavailable',
      stoppedAt: 'adversarial-trust',
    });
    expect(
      record('15-adversarial-trust.attempt-1.json').notes.tasteReceipts
    ).toMatchObject([{ gateId: 'responsive-accessibility', verdict: 'pass' }]);
  });

  it('reports both reasons when the red team and visual review are unavailable', async () => {
    await run();
    const resumed = await run({
      fromStage: 'adversarial-trust',
      allowPartial: true,
      providers: dryProviders(brief, {
        transport: null,
        reviewVisual: async () => ({
          status: 'credentials-unavailable',
          reason: 'no vision judge',
        }),
      }),
    });

    expect(resumed.status).toBe('credentials-unavailable');
    expect(resumed.reason).toMatch(/red-team needs .*; no vision judge/);
  });

  it('fails trust when the visual reviewer shares the producer family', async () => {
    const manifest = await run({
      providers: dryProviders(brief, {
        reviewVisual: async () => ({
          status: 'reviewed',
          judgeModel: 'fixture:anthropic/claude-sonnet-5',
          verdict: 'pass',
          score: 1,
          findings: [],
          judges: [],
        }),
      }),
    });

    expect(manifest).toMatchObject({
      status: 'failed',
      stoppedAt: 'adversarial-trust',
    });
    expect(
      record('15-adversarial-trust.attempt-1.json').receipt.invariantsFailed
    ).toContain('visual-taste-admission');
    expect(
      record('15-adversarial-trust.attempt-2.json').feedbackIn.join(' ')
    ).toMatch(/same-family-judge/);
  });

  it('with --allow-partial, live runs still stop at render without a measurer', async () => {
    const live = liveProviders(fixtureTransport(), {
      generate: dryProviders(brief).generate,
    });
    const manifest = await run({ providers: live, allowPartial: true });

    expect(manifest).toMatchObject({
      status: 'credentials-unavailable',
      stoppedAt: 'render',
      mode: 'live',
    });
  });
});
