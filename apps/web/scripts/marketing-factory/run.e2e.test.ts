import { existsSync, mkdtempSync, rmSync } from 'node:fs';
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
import { fixtureCaptures, sha256Digest } from './render-measurer';
import { FACTORY_MAX_REWORKS, runFactory } from './run';

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
        variantId: 'split-screenshot-right',
      },
      {
        renderer: 'factory-feature-split',
        instanceId: 'capture-1',
        sectionId: 'feature-split',
        variantId: 'phone-right',
      },
      {
        renderer: 'factory-cta',
        instanceId: 'cta-1',
        sectionId: 'cta',
        variantId: 'final-single-claim',
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

const REJECTION = 'mobile@390: the subhead line breaks strand one word';
/** The finding as the harness hands it back: tagged with its dimension. */
const TAGGED = `[copy] ${REJECTION}`;
const dryCopy = brief.dry?.copy as { slots: { slot: string; text: string }[] };

/**
 * Dry providers whose render depends on the previewed record, like a real
 * render, and whose vision judge rejects the first page it sees.
 */
function reworkProviders(input: {
  readonly copyHearsFindings: boolean;
  readonly judgeRejects: (review: number) => boolean;
  readonly finding?: string;
}) {
  const reviewed: string[][] = [];
  const providers = dryProviders(brief, {
    async generate(request) {
      if (request.stage !== 'copy') {
        return { status: 'ok', value: brief.dry?.[request.stage] };
      }
      const shorten =
        input.copyHearsFindings && request.feedback.includes(TAGGED);
      const slots = dryCopy.slots.map(slot =>
        shorten && slot.slot === 'subhead'
          ? {
              ...slot,
              text: 'Jovie gives founders one public page that turns each visitor into a subscriber you can reach again.',
            }
          : slot
      );
      return { status: 'ok', value: { slots } };
    },
    async measureRender(route, at) {
      const preview = at?.preview;
      const recordDigest = preview
        ? sha256Digest(
            JSON.stringify(
              readJson(
                join(
                  preview.runsDir,
                  preview.recordId.replace('.', '-'),
                  'page-record.json'
                )
              )
            )
          )
        : 'no-preview';
      const metrics = { cls: 0.01, lcpMs: 900 };
      return {
        status: 'ok',
        ...metrics,
        captures: fixtureCaptures(route, metrics).map(capture => ({
          ...capture,
          screenshot: {
            path: capture.screenshot.path,
            digest: sha256Digest(`${capture.screenshot.path}#${recordDigest}`),
          },
        })),
      };
    },
    async reviewVisual(request) {
      reviewed.push(request.captures.map(c => c.screenshot.digest));
      const reject = input.judgeRejects(reviewed.length);
      return {
        status: 'reviewed',
        judgeModel: 'fixture:google/gemini-3-pro',
        verdict: reject ? 'fail' : 'pass',
        score: reject ? 0.3 : 0.9,
        findings: reject ? [input.finding ?? REJECTION] : [],
        judges: [],
      };
    },
  });
  return { providers, reviewed };
}

describe('factory:run generated assets', () => {
  // cta-1 as an abstract section resolves to a generation recipe.
  const media = brief.media.map(entry =>
    entry.sectionInstanceId === 'cta-1'
      ? { ...entry, input: { ...entry.input, sectionJob: 'abstract' as const } }
      : entry
  );

  it('refuses corrupt image bytes even when provenance and the art verdict pass', async () => {
    const manifest = await run({ brief: { ...brief, media } });

    const asset = record('12-asset.attempt-1.json');
    expect(asset.receipt.passed).toBe(true);
    expect(asset.receipt.invariantsPassed).toContain(
      'asset-art:generate:cta-1'
    );
    expect(asset.artifact).toMatchObject({
      assets: expect.arrayContaining([
        expect.objectContaining({
          id: 'generate:cta-1',
          path: expect.stringMatching(
            /^assets\/iteration-0-attempt-1-[\w-]+\/generate-cta-1\.[a-f0-9]{64}\.png$/u
          ),
        }),
      ]),
    });
    const sidecar = readJson<{
      aiGenerated: boolean;
      artEvaluation: { ok: boolean };
    }>(
      join(
        runDir(),
        (asset.notes.provenance as Record<string, string>)['generate:cta-1'] ??
          ''
      )
    );
    expect(sidecar).toMatchObject({
      aiGenerated: true,
      artEvaluation: { ok: true },
    });
    // The default dry provider's single-byte image is not renderable media.
    expect(manifest).toMatchObject({ status: 'failed', stoppedAt: 'render' });
    expect(
      record('13-render.attempt-1.json').receipt.invariantsFailed
    ).toContain('render-generated-media');
  });

  it('retries an art rejection with the judge notes and never ships the rejected asset', async () => {
    const prompts: string[] = [];
    let verdicts = 0;
    const manifest = await run({
      brief: { ...brief, media },
      providers: dryProviders(brief, {
        async generateAsset(request) {
          prompts.push(request.prompt);
          return dryProviders(brief).generateAsset(request);
        },
        artGate: async () => ({
          ok: ++verdicts > 1,
          modes: ['focal'],
          judgeModel: 'fixture:openai/gpt-5.5',
          notes: ['focal: two competing focal points'],
        }),
      }),
    });

    const first = record('12-asset.attempt-1.json');
    expect(first.receipt.invariantsFailed).toEqual([
      'asset-art:generate:cta-1',
    ]);
    expect(
      (first.artifact as { assets: { id: string }[] }).assets.map(a => a.id)
    ).not.toContain('generate:cta-1');
    expect(prompts[1]).toContain('two competing focal points');
    const second = record('12-asset.attempt-2.json');
    expect(second.receipt.passed).toBe(true);
    const priorSidecar = (first.notes.provenance as Record<string, string>)[
      'generate:cta-1'
    ];
    const nextSidecar = (second.notes.provenance as Record<string, string>)[
      'generate:cta-1'
    ];
    expect(priorSidecar).not.toBe(nextSidecar);
    expect(readJson(join(runDir(), priorSidecar ?? ''))).toMatchObject({
      artEvaluation: { ok: false },
    });
    expect(readJson(join(runDir(), nextSidecar ?? ''))).toMatchObject({
      artEvaluation: { ok: true },
    });
    expect(manifest.stoppedAt).toBe('render');
  });
});

describe('factory:run proof-landed rework', () => {
  const CLAIM = 'capability.artist-profiles.audience-capture';
  // No metric proof exists for this claim, so the proof stage files a request.
  const needsMetric = {
    ...brief,
    proof: [
      {
        sectionInstanceId: 'capture-1',
        kind: 'metric' as const,
        claimId: CLAIM,
      },
    ],
  };
  const landedMetric = {
    recordType: 'proof' as const,
    id: 'metric-audience-capture',
    kind: 'metric' as const,
    claimId: CLAIM,
    evidence: 'dogfood' as const,
    value: 3,
    unit: 'subscribers',
    reproducingQuery: 'select 3',
    measuredAt: brief.asOf,
    sample: { size: 3, population: 'fixture' },
    source: 'fixture',
  };

  it('reruns from proof when a requested proof lands, recorded as a proof-landed rework', async () => {
    const first = await run({
      brief: needsMetric,
      providers: dryProviders(needsMetric),
    });
    expect(first.status).toBe('complete');
    expect(first.reworks ?? []).toEqual([]);
    expect(record('07-proof.attempt-1.json').notes.proofRequests).toMatchObject(
      [{ claimId: CLAIM, kind: 'metric', pagesBlocked: [PAGE_ID] }]
    );
    const firstRender = first.chain.find(
      link => link.stage === 'render'
    )?.outputDigest;

    const second = await run({
      brief: needsMetric,
      providers: dryProviders(needsMetric),
      proofRegistry: [landedMetric],
    });

    expect(second.reworks).toEqual([
      {
        iteration: 1,
        trigger: 'proof-landed',
        rejectedAt: 'proof',
        reworkFrom: 'proof',
        rejectedRenderDigest: firstRender,
        findings: [`proof landed for ${CLAIM}`],
      },
    ]);
    // Truth through gap-detection were kept; proof onward reran.
    expect(existsSync(join(runDir(), '07-proof.rework-1.attempt-1.json'))).toBe(
      true
    );
    expect(
      existsSync(join(runDir(), '13-render.rework-1.attempt-1.json'))
    ).toBe(true);
    // The proof stage reads the shipped registry, which still lacks the
    // metric, so the page is unchanged and the run refuses to re-judge it.
    expect(second).toMatchObject({ status: 'failed', stoppedAt: 'render' });
    expect(second.reason).toMatch(/no new render/);
  });

  it('starts fresh when no requested proof has landed', async () => {
    await run({ brief: needsMetric, providers: dryProviders(needsMetric) });
    const again = await run({
      brief: needsMetric,
      providers: dryProviders(needsMetric),
      proofRegistry: [],
    });

    expect(again.status).toBe('complete');
    expect(again.reworks ?? []).toEqual([]);
  });
});

describe('factory:run copy directions', () => {
  it('judges every copy direction and records the winner with its rationale', async () => {
    const seen: number[] = [];
    const manifest = await run({
      providers: dryProviders(brief, {
        async generate(request) {
          if (request.stage !== 'copy') {
            return { status: 'ok', value: brief.dry?.[request.stage] };
          }
          const index = request.direction?.index ?? 0;
          seen.push(index);
          // Direction 1 breaks a hard check; 2 and 3 are distinct and valid.
          const slots = dryCopy.slots.map((slot, i) =>
            i !== 0
              ? slot
              : index === 1
                ? { ...slot, text: `${slot.text} — now` }
                : index === 3
                  ? { ...slot, text: 'Claim your public profile page' }
                  : slot
          );
          return { status: 'ok', value: { slots } };
        },
      }),
    });

    expect(manifest.status).toBe('complete');
    expect(seen).toEqual([1, 2, 3]);
    const copy = record('09-copy.attempt-1.json');
    const directions = copy.notes.directions as {
      direction: number;
      passed: boolean;
      outputDigest: string;
      invariantsFailed: string[];
    }[];
    expect(directions.map(d => [d.direction, d.passed])).toEqual([
      [1, false],
      [2, true],
      [3, true],
    ]);
    expect(directions[0]?.invariantsFailed).toContain('copy-no-em-dash');
    expect(new Set(directions.map(d => d.outputDigest)).size).toBe(3);
    const winner = copy.notes.winner as {
      direction: number;
      rationale: string;
    };
    expect(winner.direction).toBe(2);
    expect(winner.rationale).toMatch(/highest of 2 passing/);
    // The chain carries the winning direction's artifact.
    expect(copy.receipt.outputDigest).toBe(directions[1]?.outputDigest);
    expect(copy.receipt.passed).toBe(true);
  });
});

describe('factory:run visual rework', () => {
  it('routes a visual rejection back to copy, re-renders and re-judges a new page', async () => {
    const { providers, reviewed } = reworkProviders({
      copyHearsFindings: true,
      judgeRejects: review => review === 1,
    });
    const manifest = await run({ providers });

    expect(manifest).toMatchObject({ status: 'complete', stoppedAt: null });
    expect(verifyFactoryRun(runDir())).toEqual([]);
    expect(manifest.reworks).toEqual([
      {
        iteration: 1,
        trigger: 'visual-rejection',
        rejectedAt: 'adversarial-trust',
        reworkFrom: 'copy',
        rejectedRenderDigest: expect.stringMatching(/^sha256:/),
        findings: [TAGGED],
      },
    ]);
    // The owning stage reran with the judge's findings as its feedback.
    expect(record('09-copy.rework-1.attempt-1.json').feedbackIn).toContain(
      TAGGED
    );
    const first = record('13-render.attempt-1.json').receipt.outputDigest;
    const second = record('13-render.rework-1.attempt-1.json').receipt
      .outputDigest;
    expect(second).not.toBe(first);
    expect(manifest.reworks?.[0]?.rejectedRenderDigest).toBe(first);
    expect(
      manifest.chain.find(link => link.stage === 'render')?.outputDigest
    ).toBe(second);
    // The judge saw new screenshots, not the rejected ones again.
    expect(reviewed).toHaveLength(2);
    expect(reviewed[1]).not.toEqual(reviewed[0]);
    // The rejection was not retried in place on the same screenshots.
    expect(
      existsSync(join(runDir(), '15-adversarial-trust.attempt-2.json'))
    ).toBe(false);
  });

  it('routes an imagery finding to the asset stage, not copy', async () => {
    const { providers } = reworkProviders({
      copyHearsFindings: true,
      judgeRejects: () => true,
      finding: 'desktop@1440: the hero image reads as generic stock',
    });
    const manifest = await run({ providers });

    expect(manifest.reworks?.[0]).toMatchObject({
      reworkFrom: 'asset',
      findings: [
        '[imagery] desktop@1440: the hero image reads as generic stock',
      ],
    });
    // Copy did not rerun; the asset stage did, and the unchanged page failed.
    expect(existsSync(join(runDir(), '09-copy.rework-1.attempt-1.json'))).toBe(
      false
    );
    expect(existsSync(join(runDir(), '12-asset.rework-1.attempt-1.json'))).toBe(
      true
    );
    expect(manifest.reason).toMatch(/no new render/);
  });

  it('fails when a rework renders the rejected page again', async () => {
    const { providers, reviewed } = reworkProviders({
      copyHearsFindings: false,
      judgeRejects: () => true,
    });
    const manifest = await run({ providers });

    expect(manifest).toMatchObject({ status: 'failed', stoppedAt: 'render' });
    expect(manifest.reason).toMatch(/no new render/);
    expect(reviewed).toHaveLength(1);
  });

  it('stops after the rework limit when every new render is rejected', async () => {
    let edits = 0;
    const { providers } = reworkProviders({
      copyHearsFindings: false,
      judgeRejects: () => true,
    });
    const manifest = await run({
      providers: {
        ...providers,
        async generate(request) {
          if (request.stage !== 'copy') return providers.generate(request);
          // Each rework changes the page, but never enough for the judge.
          const tail = request.feedback.length > 0 ? ` (v${++edits})` : '';
          return {
            status: 'ok',
            value: {
              slots: dryCopy.slots.map(slot =>
                slot.slot === 'subhead'
                  ? { ...slot, text: `${slot.text}${tail}` }
                  : slot
              ),
            },
          };
        },
      },
    });

    expect(manifest).toMatchObject({
      status: 'failed',
      stoppedAt: 'adversarial-trust',
    });
    expect(manifest.reworks).toHaveLength(FACTORY_MAX_REWORKS);
    expect(manifest.reason).toMatch(/still rejected after 2 rework/);
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

    const outDir = (seen[0] as { outDir: string }).outDir;
    expect(outDir).toMatch(/render\/iteration-0-attempt-1-/u);
    const runsDir = join(outDir, 'preview-records');
    expect(seen).toEqual([
      {
        outDir,
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
