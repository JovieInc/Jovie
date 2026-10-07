import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PageRecordSchema } from '../../data/marketing/factory/pageRecord';
import { loadFactoryBrief } from './brief';
import * as generatedMedia from './generated-media';
import { dryProviders } from './providers';
import {
  digestOf,
  readJson,
  type StageAttemptRecord,
  verifyFactoryRun,
} from './receipts';
import { fixtureCaptures, sha256Digest } from './render-measurer';
import { runFactory } from './run';
import { visualFeedbackStage } from './stages-page';

const IMAGERY = '[imagery] mobile@390: simplify the background artwork';
const COPY = '[copy] mobile@390: shorten the subhead line breaks';
const ART = 'focal: remove the competing focal point';
const brief = loadFactoryBrief('solutions', 'founders');
const media = brief.media.map(entry =>
  entry.sectionInstanceId === 'cta-1'
    ? { ...entry, input: { ...entry.input, sectionJob: 'abstract' as const } }
    : entry
);
const realMaterialize = generatedMedia.materializeGeneratedFactoryMedia;
let runsDir: string;
let publicDir: string;
const runDir = () => join(runsDir, 'solutions-founders');

beforeEach(() => {
  runsDir = mkdtempSync(join(tmpdir(), 'factory-visual-feedback-'));
  publicDir = mkdtempSync(join(tmpdir(), 'factory-visual-feedback-public-'));
  vi.spyOn(
    generatedMedia,
    'materializeGeneratedFactoryMedia'
  ).mockImplementation((ctx, target) =>
    realMaterialize(ctx, target ?? publicDir)
  );
});
afterEach(() => {
  vi.restoreAllMocks();
  rmSync(runsDir, { recursive: true, force: true });
  rmSync(publicDir, { recursive: true, force: true });
});

async function fixture(
  options: {
    mixed?: boolean;
    retryArt?: boolean;
    ignoreVisual?: boolean;
    secondCopyRejection?: boolean;
    resumeAsset?: boolean;
  } = {}
) {
  const bytes = await Promise.all(
    ['#191919', '#252525'].map(background =>
      sharp({ create: { width: 1600, height: 1000, channels: 3, background } })
        .png()
        .toBuffer()
    )
  );
  const prompts: string[] = [];
  const copyFeedback: (readonly string[])[] = [];
  const reviewed: string[][] = [];
  let artReviews = 0;
  const base = dryProviders(brief);
  const runOptions: Parameters<typeof runFactory>[0] = {
    family: 'solutions',
    slug: 'founders',
    dry: true,
    runsDir,
    brief: { ...brief, media },
    providers: dryProviders(brief, {
      async generate(request) {
        if (request.stage !== 'copy') return base.generate(request);
        copyFeedback.push(request.feedback);
        const value = await base.generate(request);
        if (value.status !== 'ok' || !request.feedback.includes(COPY))
          return value;
        const copy = value.value as { slots: { slot: string; text: string }[] };
        return {
          status: 'ok',
          value: {
            slots: copy.slots.map(slot =>
              slot.slot === 'subhead'
                ? {
                    ...slot,
                    text: 'Jovie gives founders one public page that turns each visitor into a subscriber you can reach again.',
                  }
                : slot
            ),
          },
        };
      },
      async generateAsset(request) {
        prompts.push(request.prompt);
        if (options.resumeAsset && prompts.length === 2) {
          return {
            status: 'credentials-unavailable',
            provider: 'fixture',
            reason: 'fixture provider outage',
          };
        }
        return {
          status: 'generated',
          provider: 'fixture',
          model: 'fixture/image',
          bytes:
            bytes[
              !options.ignoreVisual && request.prompt.includes(IMAGERY) ? 1 : 0
            ]!,
          mime: 'image/png',
          width: 1600,
          height: 1000,
        };
      },
      artGate: async () => ({
        ok: ++artReviews !== (options.retryArt ? 2 : -1),
        modes: ['focal'],
        judgeModel: 'fixture:openai/gpt-5.5',
        notes: [ART],
      }),
      async measureRender(route, at) {
        const preview = at?.preview;
        if (!preview) throw new Error('fixture requires the candidate preview');
        const page = PageRecordSchema.parse(
          readJson(
            join(
              preview.runsDir,
              preview.recordId.replace('.', '-'),
              'page-record.json'
            )
          )
        );
        // Candidate pixels depend on visible content, not attempt paths/receipts.
        const content = digestOf({ copy: page.copy, media: page.media });
        const metrics = { cls: 0.01, lcpMs: 900 };
        return {
          status: 'ok',
          ...metrics,
          captures: fixtureCaptures(route, metrics).map(capture => ({
            ...capture,
            screenshot: {
              path: capture.screenshot.path,
              digest: sha256Digest(`${capture.screenshot.path}#${content}`),
            },
          })),
        };
      },
      async reviewVisual(request) {
        reviewed.push(
          request.captures.map(capture => capture.screenshot.digest)
        );
        const reject =
          reviewed.length === 1 ||
          (options.secondCopyRejection && reviewed.length === 2);
        return {
          status: 'reviewed',
          judgeModel: 'fixture:google/gemini-3-pro',
          verdict: reject ? 'fail' : 'pass',
          score: reject ? 0.3 : 0.9,
          findings: !reject
            ? []
            : reviewed.length === 2
              ? [COPY]
              : options.mixed
                ? [COPY, IMAGERY]
                : [IMAGERY],
          judges: [],
        };
      },
    }),
  };
  const interrupted = await runFactory(runOptions);
  const manifest = options.resumeAsset
    ? await runFactory({ ...runOptions, fromStage: 'asset' })
    : interrupted;
  return {
    manifest,
    interrupted,
    prompts,
    copyFeedback,
    reviewed,
    correctedDigest: sha256Digest(bytes[1]!),
  };
}

function expectChangedMedia(result: Awaited<ReturnType<typeof fixture>>) {
  expect(result.manifest).toMatchObject({
    status: 'complete',
    stoppedAt: null,
  });
  expect(result.reviewed).toHaveLength(2);
  expect(result.reviewed[1]).not.toEqual(result.reviewed[0]);
  const assets = result.manifest.attempts
    .map(file => readJson<StageAttemptRecord>(join(runDir(), file)))
    .filter(record => record.receipt.stage === 'asset' && record.receipt.passed)
    .map(
      record => record.artifact as { assets: { id: string; path: string }[] }
    );
  const paths = assets.map(
    asset => asset.assets.find(entry => entry.id === 'generate:cta-1')?.path
  );
  expect(paths).toHaveLength(2);
  expect(paths[1]).not.toBe(paths[0]);
  const hashes = paths.map(path => {
    if (!path) throw new Error('generated asset is missing from the receipt');
    return sha256Digest(readFileSync(join(runDir(), path)));
  });
  expect(hashes[1]).not.toBe(hashes[0]);
  const page = PageRecordSchema.parse(
    readJson(join(runDir(), 'page-record.json'))
  );
  const image = page.media['cta-1'];
  expect(image).toMatchObject({ kind: 'generated', digest: hashes[1] });
  if (!image) throw new Error('generated asset is missing from the page');
  expect(sha256Digest(readFileSync(join(publicDir, image.id)))).toBe(hashes[1]);
  expect(verifyFactoryRun(runDir())).toEqual([]);
}

describe('visual feedback reaches generation across rewinds and retries', () => {
  it.each([
    ['[copy] shorten the headline', 'copy'],
    ['[imagery] simplify the artwork', 'asset'],
    ['[layout] reduce spacing', 'layout'],
    ['[IMAGERY] simplify the artwork', 'asset'],
    ['generic stage feedback', undefined],
    ['asset-art:generate:cta-1: remove focal point', undefined],
    ['[unknown] preserve local feedback', undefined],
  ])(
    'routes explicit findings while preserving generic feedback: %s',
    (finding, owner) => {
      expect(visualFeedbackStage(finding!)).toBe(owner);
    }
  );

  it('regenerates imagery with the visual correction before judging new pixels', async () => {
    const result = await fixture();
    expect(result.prompts[1]).toContain(IMAGERY);
    expectChangedMedia(result);
    expect(result.manifest.reworks?.[0]?.reworkFrom).toBe('asset');
  });

  it('delivers mixed findings to copy and asset through one upstream rewind', async () => {
    const result = await fixture({ mixed: true });
    const correctedCopy = result.copyFeedback.filter(feedback =>
      feedback.includes(COPY)
    );
    expect(correctedCopy.length).toBeGreaterThan(0);
    for (const feedback of correctedCopy)
      expect(feedback).not.toContain(IMAGERY);
    expect(result.prompts[1]).toContain(IMAGERY);
    expect(result.prompts[1]).not.toContain(COPY);
    expectChangedMedia(result);
    expect(result.manifest.reworks?.[0]?.reworkFrom).toBe('copy');
    expect(result.manifest.reworks?.[0]?.findings).toEqual([COPY, IMAGERY]);
  });

  it('retains the visual correction when the new asset needs an art retry', async () => {
    const result = await fixture({ retryArt: true });
    expect(result.prompts).toHaveLength(3);
    expect(result.prompts[2]).toContain(IMAGERY);
    expect(result.prompts[2]).toContain(ART);
    expectChangedMedia(result);
    const rejected = readJson<StageAttemptRecord>(
      join(runDir(), '12-asset.rework-1.attempt-1.json')
    );
    expect(rejected.receipt.invariantsFailed).toContain(
      'asset-art:generate:cta-1'
    );
  });

  it('vetoes unchanged pixels even when the image generator receives the correction', async () => {
    const result = await fixture({ ignoreVisual: true });
    expect(result.prompts[1]).toContain(IMAGERY);
    expect(result.manifest).toMatchObject({
      status: 'failed',
      stoppedAt: 'render',
      reason:
        'rework produced no new render: the rejected screenshots would be re-judged',
    });
    expect(result.reviewed).toHaveLength(1);
  });

  it('preserves an image correction when a later copy rejection regenerates downstream stages', async () => {
    const result = await fixture({ secondCopyRejection: true });
    expect(result.prompts).toHaveLength(3);
    expect(result.prompts[2]).toContain(IMAGERY);
    expect(result.manifest).toMatchObject({
      status: 'complete',
      stoppedAt: null,
    });
    expect(result.manifest.reworks).toHaveLength(2);
    expect(result.reviewed).toHaveLength(3);
    const page = PageRecordSchema.parse(
      readJson(join(runDir(), 'page-record.json'))
    );
    expect(page.media['cta-1']).toMatchObject({
      kind: 'generated',
      digest: result.correctedDigest,
    });
    expect(verifyFactoryRun(runDir())).toEqual([]);
  });

  it('restores the correction from retained history when resuming after an asset provider outage', async () => {
    const result = await fixture({ resumeAsset: true });
    expect(result.interrupted).toMatchObject({
      status: 'credentials-unavailable',
      stoppedAt: 'asset',
    });
    expect(result.prompts).toHaveLength(3);
    expect(result.prompts[2]).toContain(IMAGERY);
    expectChangedMedia(result);
  });
});
