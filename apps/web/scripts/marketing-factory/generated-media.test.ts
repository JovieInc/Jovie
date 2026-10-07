import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import sharp from 'sharp';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PageRecordSchema } from '../../data/marketing/factory/pageRecord';
import { sidecarPathFor } from '../marketing-media/provenance';
import { loadFactoryBrief } from './brief';
import * as generatedMedia from './generated-media';
import {
  generatedFactoryMedia,
  materializeGeneratedFactoryMedia,
} from './generated-media';
import { dryProviders } from './providers';
import { readJson, type StageAttemptRecord } from './receipts';
import { runFactory } from './run';
import { artifactOf, type StageContext } from './stage-kit';
import { PAGE_STAGE_RUNNERS } from './stages-page';

const { render: runRenderStage } = PAGE_STAGE_RUNNERS;

const dirs: string[] = [];
const realMaterialize = materializeGeneratedFactoryMedia;
let fixturePublicDir: string;
beforeEach(() => {
  fixturePublicDir = mkdtempSync(join(tmpdir(), 'factory-generated-public-'));
  dirs.push(fixturePublicDir);
  vi.spyOn(
    generatedMedia,
    'materializeGeneratedFactoryMedia'
  ).mockImplementation((ctx, publicDir) =>
    realMaterialize(ctx, publicDir ?? fixturePublicDir)
  );
});
afterEach(() => {
  vi.restoreAllMocks();
  for (const dir of dirs.splice(0))
    rmSync(dir, { recursive: true, force: true });
});
const brief = loadFactoryBrief('solutions', 'founders');
const media = brief.media.map(entry =>
  entry.sectionInstanceId === 'cta-1'
    ? { ...entry, input: { ...entry.input, sectionJob: 'abstract' as const } }
    : entry
);

describe('factory generated image carry', () => {
  it('carries art-admitted bytes into the canonical page and same-origin preview', async () => {
    const runsDir = mkdtempSync(join(tmpdir(), 'factory-generated-carry-'));
    dirs.push(runsDir);
    const bytes = await sharp({
      create: { width: 1600, height: 1000, channels: 3, background: '#191919' },
    })
      .png()
      .toBuffer();
    const manifest = await runFactory({
      family: 'solutions',
      slug: 'founders',
      dry: true,
      runsDir,
      brief: { ...brief, media },
      providers: dryProviders(brief, {
        async generateAsset() {
          return {
            status: 'generated',
            provider: 'fixture',
            model: 'fixture/image',
            bytes,
            mime: 'image/png',
            width: 1600,
            height: 1000,
          };
        },
      }),
    });
    expect(manifest).toMatchObject({ status: 'complete', stoppedAt: null });
    const page = PageRecordSchema.parse(
      JSON.parse(
        readFileSync(
          join(runsDir, 'solutions-founders/page-record.json'),
          'utf8'
        )
      )
    );
    expect(page.media['cta-1']).toMatchObject({
      kind: 'generated',
      mime: 'image/png',
      width: 1600,
      height: 1000,
    });
    const image = page.media['cta-1'];
    expect(image?.id).toMatch(
      /^\/marketing\/factory\/generated\/[a-f0-9]{64}\.png$/u
    );
    const file = join(fixturePublicDir, image?.id ?? '');
    expect(existsSync(file)).toBe(true);
    expect(readFileSync(file)).toEqual(bytes);
  });
});

describe('factory generated image admission', () => {
  let ctx: StageContext;
  let publicDir: string;
  beforeEach(async () => {
    const runsDir = mkdtempSync(join(tmpdir(), 'factory-generated-admission-'));
    dirs.push(runsDir);
    publicDir = mkdtempSync(join(tmpdir(), 'factory-generated-export-'));
    dirs.push(publicDir);
    const bytes = await sharp({
      create: { width: 1600, height: 1000, channels: 3, background: '#191919' },
    })
      .png()
      .toBuffer();
    const providers = dryProviders(brief, {
      async generateAsset() {
        return {
          status: 'generated',
          provider: 'fixture',
          model: 'fixture/image',
          bytes,
          mime: 'image/png',
          width: 1600,
          height: 1000,
        };
      },
    });
    const input = { ...brief, media };
    const manifest = await runFactory({
      family: 'solutions',
      slug: 'founders',
      dry: true,
      runsDir,
      brief: input,
      providers,
    });
    expect(manifest.status).toBe('complete');
    const runDir = join(runsDir, 'solutions-founders');
    const artifacts: StageContext['artifacts'] = {};
    const receipts: StageContext['receipts'] = {};
    for (const link of manifest.chain) {
      const attempt = readJson<StageAttemptRecord>(join(runDir, link.file));
      artifacts[link.stage] = attempt.artifact;
      receipts[link.stage] = attempt.receipt;
    }
    ctx = {
      pageId: 'solutions-founders',
      brief: input,
      providers,
      artifacts,
      receipts,
      attempt: 1,
      feedback: [],
      runDir,
    };
  });

  function generatedAsset() {
    const asset = artifactOf(ctx, 'asset').assets.find(asset =>
      asset.id.startsWith('generate:')
    );
    if (!asset) throw new Error('fixture has no generated asset');
    return asset;
  }

  it.each([
    '../escape.png',
    '/tmp/escape.png',
    'https://example.com/image.png',
    'assets/../escape.png',
    'assets/image.png?x=1',
  ])('rejects unsafe run path %s', async path => {
    generatedAsset().path = path;
    expect(generatedFactoryMedia(ctx).issues.join('; ')).toContain(
      'unsafe generated asset path'
    );
    expect(await materializeGeneratedFactoryMedia(ctx, publicDir)).not.toEqual(
      []
    );
  });

  it('rejects symlinks outside the admitted asset directory', () => {
    const asset = generatedAsset();
    const outside = join(publicDir, 'outside.png');
    writeFileSync(outside, 'not an admitted asset');
    const path = join(ctx.runDir, 'assets/escape.png');
    symlinkSync(outside, path);
    asset.path = 'assets/escape.png';
    expect(generatedFactoryMedia(ctx).issues.join('; ')).toContain(
      'inside the run assets directory'
    );
  });

  it.each([
    'missing',
    'replaced',
    'wrong-digest',
    'wrong-size',
    'rejected-art',
    'wrong-identity',
  ])('rejects %s image evidence before measurement', async mutation => {
    const asset = generatedAsset();
    const file = join(ctx.runDir, asset.path);
    const sidecarPath = sidecarPathFor(file);
    const sidecar = readJson<Record<string, unknown>>(sidecarPath);
    if (mutation === 'missing') rmSync(file);
    if (mutation === 'replaced') writeFileSync(file, 'changed');
    if (mutation === 'wrong-digest') sidecar.sha256 = 'a'.repeat(64);
    if (mutation === 'wrong-size') asset.bytes++;
    if (mutation === 'rejected-art') sidecar.artEvaluation = { ok: false };
    if (mutation === 'wrong-identity') sidecar.assetId = 'another-image';
    writeFileSync(sidecarPath, JSON.stringify(sidecar));
    const measureRender = vi.fn(ctx.providers.measureRender);
    const outcome = await runRenderStage({
      ...ctx,
      providers: { ...ctx.providers, measureRender },
    });
    expect(outcome.invariantsFailed).toContain('page-record-schema');
    expect(measureRender).not.toHaveBeenCalled();
  });

  it.each(['dimensions', 'mime', 'video'])(
    'rejects unsupported or mismatched %s before measurement',
    async mutation => {
      const asset = generatedAsset();
      if (mutation === 'dimensions') asset.width++;
      if (mutation === 'mime') asset.mime = 'image/jpeg';
      if (mutation === 'video') asset.mime = 'video/mp4';
      const measureRender = vi.fn(ctx.providers.measureRender);
      const outcome = await runRenderStage({
        ...ctx,
        providers: { ...ctx.providers, measureRender },
      });
      expect(outcome.invariantsFailed.length).toBeGreaterThan(0);
      expect(measureRender).not.toHaveBeenCalled();
    }
  );

  it('fails closed when the selected canonical section does not mount generated media', () => {
    const ref = artifactOf(ctx, 'ref-sourcing').refs.find(ref =>
      ref.id.startsWith('generate:')
    );
    if (!ref) throw new Error('missing generation ref');
    ref.sectionInstanceId = 'capture-1';
    expect(generatedFactoryMedia(ctx).issues.join('; ')).toContain(
      'cannot mount generated media'
    );
  });

  it('refuses generated artwork in the capture-only split hero', () => {
    const ref = artifactOf(ctx, 'ref-sourcing').refs.find(ref =>
      ref.id.startsWith('generate:')
    );
    const hero = artifactOf(ctx, 'layout').sections.find(
      section => section.sectionId === 'hero'
    );
    if (!ref || !hero || !hero.sectionInstanceId)
      throw new Error('missing fixture reference or hero');
    ref.sectionInstanceId = hero.sectionInstanceId;
    hero.variantId = 'split-screenshot-right';
    expect(generatedFactoryMedia(ctx).issues.join('; ')).toContain(
      'cannot mount generated media'
    );
  });

  async function resumePublication() {
    return runFactory({
      family: 'solutions',
      slug: 'founders',
      dry: true,
      fromStage: 'publish',
      runsDir: dirname(ctx.runDir),
      brief: ctx.brief,
      providers: ctx.providers,
    });
  }

  it('restores a missing public image when resuming publication', async () => {
    const media = generatedFactoryMedia(ctx).media['cta-1'];
    if (!media) throw new Error('missing generated media');
    const publicFile = join(fixturePublicDir, media.id);
    rmSync(publicFile);
    expect(await resumePublication()).toMatchObject({ status: 'complete' });
    expect(readFileSync(publicFile)).toEqual(
      readFileSync(join(ctx.runDir, generatedAsset().path))
    );
  });

  it('refuses a replaced public image when resuming publication', async () => {
    const media = generatedFactoryMedia(ctx).media['cta-1'];
    if (!media) throw new Error('missing generated media');
    const publicFile = join(fixturePublicDir, media.id);
    writeFileSync(publicFile, 'replaced');
    expect(await resumePublication()).toMatchObject({
      status: 'failed',
      stoppedAt: 'publish',
    });
    expect(readFileSync(publicFile, 'utf8')).toBe('replaced');
  });

  it('exports only the verified byte hash and refuses a replaced public asset', async () => {
    expect(await materializeGeneratedFactoryMedia(ctx, publicDir)).toEqual([]);
    const media = generatedFactoryMedia(ctx).media['cta-1'];
    if (!media) throw new Error('missing generated media');
    const publicFile = join(publicDir, media.id);
    expect(readFileSync(publicFile)).toEqual(
      readFileSync(join(ctx.runDir, generatedAsset().path))
    );
    writeFileSync(publicFile, 'replaced');
    expect(
      (await materializeGeneratedFactoryMedia(ctx, publicDir)).join('; ')
    ).toContain('preview asset was replaced');
    expect(readFileSync(publicFile, 'utf8')).toBe('replaced');
  });

  it('refuses a public-directory symlink before exporting outside the public root', async () => {
    const outside = mkdtempSync(join(tmpdir(), 'factory-public-escape-'));
    dirs.push(outside);
    mkdirSync(join(publicDir, 'marketing'));
    symlinkSync(outside, join(publicDir, 'marketing/factory'));
    expect(
      (await materializeGeneratedFactoryMedia(ctx, publicDir)).join('; ')
    ).toContain('inside the run assets directory');
    expect(existsSync(join(outside, 'generated'))).toBe(false);
  });

  it.each(['jpeg', 'webp', 'avif'] as const)(
    'exports real %s bytes with the matching public image type',
    async format => {
      const bytes = await sharp({
        create: { width: 20, height: 10, channels: 3, background: '#191919' },
      })
        .toFormat(format)
        .toBuffer();
      const next = await PAGE_STAGE_RUNNERS.asset({
        ...ctx,
        attempt: 2,
        providers: {
          ...ctx.providers,
          async generateAsset() {
            return {
              status: 'generated',
              provider: 'fixture',
              model: 'fixture/image',
              bytes,
              mime: `image/${format}`,
              width: 20,
              height: 10,
            };
          },
        },
      });
      const nextCtx = {
        ...ctx,
        artifacts: { ...ctx.artifacts, asset: next.artifact },
      };
      expect(
        await materializeGeneratedFactoryMedia(nextCtx, publicDir)
      ).toEqual([]);
      const slot = generatedFactoryMedia(nextCtx).media['cta-1'];
      if (!slot) throw new Error('missing generated slot');
      expect(slot.id).toMatch(
        new RegExp(`\\.${format === 'jpeg' ? 'jpg' : format}$`, 'u')
      );
      expect(readFileSync(join(publicDir, slot.id))).toEqual(bytes);
    }
  );

  it('retains consecutive generations in separate immutable attempt paths', async () => {
    const before = generatedAsset();
    const prior = readFileSync(join(ctx.runDir, before.path));
    const nextBytes = await sharp({
      create: { width: 1600, height: 1000, channels: 3, background: '#252525' },
    })
      .png()
      .toBuffer();
    const next = await PAGE_STAGE_RUNNERS.asset({
      ...ctx,
      attempt: 2,
      providers: {
        ...ctx.providers,
        async generateAsset() {
          return {
            status: 'generated',
            provider: 'fixture',
            model: 'fixture/image',
            bytes: nextBytes,
            mime: 'image/png',
            width: 1600,
            height: 1000,
          };
        },
      },
    });
    expect(next.invariantsFailed).toEqual([]);
    const nextCtx = {
      ...ctx,
      artifacts: { ...ctx.artifacts, asset: next.artifact },
    };
    const nextAsset = artifactOf(nextCtx, 'asset').assets.find(
      asset => asset.id === before.id
    );
    expect(nextAsset?.path).not.toBe(before.path);
    expect(readFileSync(join(ctx.runDir, before.path))).toEqual(prior);
    expect(generatedFactoryMedia(nextCtx).media['cta-1']?.digest).not.toBe(
      generatedFactoryMedia(ctx).media['cta-1']?.digest
    );
    expect(await materializeGeneratedFactoryMedia(nextCtx, publicDir)).toEqual(
      []
    );
  });
});
