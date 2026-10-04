// @vitest-environment node
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { JOVIE_MARKETING_CHARACTER_SYSTEM } from '@/data/marketing/characterSystem';
import {
  executeMarketingMediaExportRequest,
  MARKETING_MEDIA_EXPORT_FIXTURES,
} from '@/data/marketing/mediaExport';
import {
  getMarketingExportScenarios,
  SCREENSHOT_SCENARIOS,
} from '@/lib/screenshots/registry';
import {
  type CaptureRegistry,
  isRegisteredMarketingCapture,
  resolveCapture,
} from './capture-adapter';
import { readDopplerSecret, type SpawnSyncLike } from './credentials';
import { createFalImageAdapter, FAL_DEFAULT_MODEL } from './fal-image-adapter';
import {
  type ArtGate,
  createArtEvaluatorGate,
  generateMarketingImage,
  type MarketingImageResult,
} from './generate-image';
import type {
  ImageGenerationAdapter,
  ImageGenerationRequest,
} from './image-adapter';
import {
  createGeneratedProduceOutput,
  toMediaExportOutputResult,
} from './media-export-seam';
import { embedC2paManifest } from './provenance';

const eligible = String(
  JOVIE_MARKETING_CHARACTER_SYSTEM.boardDecisions.find(
    decision => decision.campaignEligibility === 'eligible'
  )?.id
);

const request: ImageGenerationRequest = {
  prompt: 'soft off-center light well over dark negative space',
  recipeId: 'soft-editorial-background',
  characterId: null,
  width: 1600,
  height: 900,
  brief: 'editorial background behind a headline',
};

const spawnReturning =
  (
    byCommand: Record<
      string,
      { status: number | null; stdout?: string; error?: Error }
    >
  ): SpawnSyncLike =>
  command => {
    const hit = byCommand[command] ?? { status: 1 };
    return { stdout: '', ...hit };
  };

const memoryFs = () => {
  const files = new Map<string, Uint8Array | string>();
  return {
    files,
    mkdir: async () => undefined,
    writeFile: async (path: string, data: Uint8Array | string) => {
      files.set(path, data);
    },
  };
};

const fakeAdapter = (
  outcome: Awaited<ReturnType<ImageGenerationAdapter['generate']>>
): ImageGenerationAdapter => ({
  provider: 'fal',
  model: FAL_DEFAULT_MODEL,
  family: 'bfl',
  generate: vi.fn(async () => outcome),
});

const generated = {
  status: 'generated' as const,
  provider: 'fal',
  model: FAL_DEFAULT_MODEL,
  bytes: new Uint8Array([137, 80, 78, 71]),
  mime: 'image/png',
  width: 1600,
  height: 900,
};

const passGate: ArtGate = async () => ({
  ok: true,
  modes: ['focal'],
  judgeModel: 'openai/gpt-5.5',
  notes: ['focal: clean'],
});

describe('doppler credentials', () => {
  it('uses a key injected by doppler run', () => {
    const spawnImpl = vi.fn();
    expect(
      readDopplerSecret('FAL_KEY', {
        env: { FAL_KEY: 'k', DOPPLER_PROJECT: 'jovie-web' },
        spawnImpl,
      })
    ).toEqual({ ok: true, value: 'k', source: 'doppler-run' });
    expect(spawnImpl).not.toHaveBeenCalled();
  });

  it('ignores a plain env key outside doppler and asks the CLI', () => {
    const secret = readDopplerSecret('FAL_KEY', {
      env: { FAL_KEY: 'plain' },
      spawnImpl: spawnReturning({
        doppler: { status: 0, stdout: 'from-cli\n' },
      }),
    });
    expect(secret).toEqual({
      ok: true,
      value: 'from-cli',
      source: 'doppler-cli',
    });
  });

  it('reports a missing key or missing CLI without throwing', () => {
    expect(
      readDopplerSecret('FAL_KEY', {
        env: {},
        spawnImpl: spawnReturning({ doppler: { status: 1 } }),
      })
    ).toEqual({
      ok: false,
      reason: 'FAL_KEY is not set in Doppler jovie-web/dev',
    });
    const noCli = readDopplerSecret('FAL_KEY', {
      env: {},
      spawnImpl: spawnReturning({
        doppler: { status: null, error: new Error('ENOENT') },
      }),
    });
    expect(noCli).toEqual({
      ok: false,
      reason: 'doppler CLI unavailable (ENOENT)',
    });
  });
});

describe('fal image adapter', () => {
  it('returns credentials-unavailable and makes no call when the key is absent', async () => {
    const fetchImpl = vi.fn();
    const adapter = createFalImageAdapter({
      readSecret: () => ({ ok: false, reason: 'FAL_KEY is not set' }),
      fetchImpl,
    });
    await expect(adapter.generate(request)).resolves.toEqual({
      status: 'credentials-unavailable',
      provider: 'fal',
      reason: 'FAL_KEY is not set',
    });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('generates through fal.run with the key as a header only', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          images: [
            {
              url: 'https://cdn.example/x.png',
              width: 1600,
              height: 900,
              content_type: 'image/png',
            },
          ],
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer,
      });
    const adapter = createFalImageAdapter({
      readSecret: () => ({ ok: true, value: 'secret', source: 'doppler-cli' }),
      fetchImpl,
    });
    const outcome = await adapter.generate(request);
    expect(outcome).toMatchObject({
      status: 'generated',
      model: FAL_DEFAULT_MODEL,
      width: 1600,
    });
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe(`https://fal.run/${FAL_DEFAULT_MODEL}`);
    expect(init.headers.Authorization).toBe('Key secret');
    expect(init.body).not.toContain('secret');
    expect(adapter.family).toBe('bfl');
  });

  it('fails cleanly on HTTP errors, empty payloads and thrown errors', async () => {
    const make = (fetchImpl: ReturnType<typeof vi.fn>) =>
      createFalImageAdapter({
        model: 'fal-ai/other',
        readSecret: () => ({
          ok: true,
          value: 'secret',
          source: 'doppler-cli',
        }),
        fetchImpl: fetchImpl as never,
      });
    await expect(
      make(vi.fn().mockResolvedValue({ ok: false, status: 402 })).generate(
        request
      )
    ).resolves.toMatchObject({
      status: 'failed',
      reason: expect.stringContaining('402'),
    });
    await expect(
      make(
        vi
          .fn()
          .mockResolvedValue({ ok: true, status: 200, json: async () => ({}) })
      ).generate(request)
    ).resolves.toMatchObject({
      status: 'failed',
      reason: expect.stringContaining('no image'),
    });
    await expect(
      make(
        vi
          .fn()
          .mockResolvedValueOnce({
            ok: true,
            status: 200,
            json: async () => ({ images: [{ url: 'u' }] }),
          })
          .mockResolvedValueOnce({ ok: false, status: 404 })
      ).generate(request)
    ).resolves.toMatchObject({
      status: 'failed',
      reason: expect.stringContaining('404'),
    });
    const thrown = await make(
      vi.fn().mockRejectedValue(new Error('boom secret'))
    ).generate(request);
    expect(thrown).toMatchObject({ status: 'failed' });
    expect(JSON.stringify(thrown)).not.toContain('secret');
    expect(make(vi.fn()).family).toBe('fal');
  });
});

describe('generation pipeline', () => {
  it('no-ops with credentials-unavailable when the key is absent', async () => {
    const fs = memoryFs();
    const result = await generateMarketingImage({
      request,
      adapter: createFalImageAdapter({
        readSecret: () => ({ ok: false, reason: 'FAL_KEY is not set' }),
      }),
      assetId: 'bg-1',
      outDir: '/out',
      artGate: passGate,
      fs,
    });
    expect(result.status).toBe('credentials-unavailable');
    expect(fs.files.size).toBe(0);
    expect(toMediaExportOutputResult(result)).toEqual({
      ok: false,
      code: 'output-provider-unavailable',
    });
  });

  it('refuses surface recipes and ineligible models before any provider call', async () => {
    const adapter = fakeAdapter(generated);
    const surface = await generateMarketingImage({
      request: { ...request, recipeId: 'dark-glass' },
      adapter,
      assetId: 'x',
      outDir: '/out',
      artGate: passGate,
      fs: memoryFs(),
    });
    expect(surface).toMatchObject({ status: 'rejected' });
    const unknown = await generateMarketingImage({
      request: { ...request, recipeId: 'pen:N8WMP' as never },
      adapter,
      assetId: 'x',
      outDir: '/out',
      artGate: passGate,
      fs: memoryFs(),
    });
    expect(unknown).toMatchObject({
      status: 'rejected',
      reason: 'pen:N8WMP is not a marketing media recipe',
    });
    const person = await generateMarketingImage({
      request: { ...request, characterId: 'C99' },
      adapter,
      assetId: 'x',
      outDir: '/out',
      artGate: passGate,
      fs: memoryFs(),
    });
    expect(person).toMatchObject({
      status: 'rejected',
      reason: 'virtual model C99 is not campaign-eligible',
    });
    expect(adapter.generate).not.toHaveBeenCalled();
  });

  it('writes the asset, a C2PA manifest definition and an ai-generated sidecar', async () => {
    const fs = memoryFs();
    const result = await generateMarketingImage({
      request,
      adapter: fakeAdapter(generated),
      assetId: 'bg-1',
      outDir: '/out',
      artGate: passGate,
      now: () => new Date('2026-09-29T00:00:00.000Z'),
      spawnImpl: spawnReturning({}),
      fs,
    });
    expect(result.status).toBe('generated');
    if (result.status !== 'generated') return;
    expect(result.sidecar).toMatchObject({
      aiGenerated: true,
      digitalSourceType:
        'http://cv.iptc.org/newscodes/digitalsourcetype/trainedAlgorithmicMedia',
      generator: { provider: 'fal', family: 'bfl' },
      c2pa: { status: 'unavailable' },
      artEvaluation: { ok: true },
      createdAt: '2026-09-29T00:00:00.000Z',
    });
    expect([...fs.files.keys()].sort()).toEqual([
      '/out/bg-1.png',
      '/out/bg-1.png.c2pa.json',
      '/out/bg-1.png.provenance.json',
    ]);
    const manifest = JSON.parse(
      String(fs.files.get('/out/bg-1.png.c2pa.json'))
    );
    expect(manifest.assertions[0].data.actions[0]).toMatchObject({
      action: 'c2pa.created',
    });
    const output = toMediaExportOutputResult(result);
    expect(output).toMatchObject({ ok: true, format: 'image/png' });
    if (output.ok) {
      expect(output.rightsProvenance).toContain('ai-generated');
      expect(output.rightsProvenance).toContain('c2pa=sidecar-only');
      expect(output.assetHash).toMatch(/^sha256:[a-f0-9]{64}$/);
    }
  });

  it('marks the asset art-rejected when the evaluator fails', async () => {
    const result = await generateMarketingImage({
      request,
      adapter: fakeAdapter(generated),
      assetId: 'bg-2',
      outDir: '/out',
      artGate: async () => ({
        ok: false,
        modes: ['focal'],
        judgeModel: 'openai/gpt-5.5',
        notes: ['focal: glass sphere competes'],
      }),
      spawnImpl: spawnReturning({}),
      fs: memoryFs(),
    });
    expect(result.status).toBe('art-rejected');
    expect(toMediaExportOutputResult(result)).toEqual({
      ok: false,
      code: 'output-render-failed',
    });
  });

  it('passes adapter failures through', async () => {
    const result = await generateMarketingImage({
      request,
      adapter: fakeAdapter({ status: 'failed', provider: 'fal', reason: 'x' }),
      assetId: 'bg-3',
      outDir: '/out',
      artGate: passGate,
      fs: memoryFs(),
    });
    expect(result.status).toBe('failed');
    expect(toMediaExportOutputResult(result).ok).toBe(false);
  });
});

describe('c2pa embedding', () => {
  it('embeds with c2patool when installed and reports failures', () => {
    const args = {
      assetPath: '/a.png',
      manifestPath: '/a.json',
      outputPath: '/a.c2pa.png',
    };
    const ok = embedC2paManifest({
      ...args,
      spawnImpl: spawnReturning({ c2patool: { status: 0 } }),
    });
    expect(ok).toEqual({
      status: 'embedded',
      tool: 'c2patool',
      signedAssetPath: '/a.c2pa.png',
    });
    let calls = 0;
    const failing = embedC2paManifest({
      ...args,
      spawnImpl: () => ({ status: calls++ === 0 ? 0 : 3, stdout: '' }),
    });
    expect(failing).toMatchObject({ status: 'unavailable' });
  });
});

describe('art evaluator gate', () => {
  const evaluator = (ok: boolean) => ({
    buildFocalEvaluation: vi.fn(() => ({ mode: 'focal' })),
    buildIdentityEvaluation: vi.fn(() => ({ mode: 'identity' })),
    evaluateArt: vi.fn(async () => ({
      ok,
      verdict: ok ? { notes: 'clean' } : null,
      error: ok ? undefined : 'judge failed',
    })),
    subscriptionVisionTransport: vi.fn(() => 'transport'),
  });
  const gateInput = {
    imagePath: '/out/a.png',
    brief: 'hero',
    characterId: null,
    producerFamily: 'bfl',
  };

  it('runs the focal check through art-evaluator.mjs', async () => {
    const evaluatorModule = evaluator(true);
    const gate = createArtEvaluatorGate({ load: async () => evaluatorModule });
    await expect(gate(gateInput)).resolves.toEqual({
      ok: true,
      modes: ['focal'],
      judgeModel: 'openai/gpt-5.5',
      notes: ['focal: clean'],
    });
    expect(evaluatorModule.evaluateArt).toHaveBeenCalledWith(
      { mode: 'focal', judgeModel: 'openai/gpt-5.5' },
      'transport'
    );
  });

  it('adds the identity check for virtual models and fails without comps', async () => {
    const evaluatorModule = evaluator(false);
    const gate = createArtEvaluatorGate({ load: async () => evaluatorModule });
    await expect(
      gate({ ...gateInput, characterId: eligible })
    ).resolves.toMatchObject({ ok: false, modes: [] });
    const result = await gate({
      ...gateInput,
      characterId: eligible,
      identityComps: ['/comps/headshot.png'],
    });
    expect(result).toMatchObject({ ok: false, modes: ['focal', 'identity'] });
    expect(result.notes[0]).toBe('focal: judge failed');
  });

  it('refuses a judge from the producer family', async () => {
    const gate = createArtEvaluatorGate({
      judgeModel: 'openai/gpt-5.5',
      load: async () => evaluator(true),
    });
    await expect(
      gate({ ...gateInput, producerFamily: 'openai' })
    ).resolves.toMatchObject({ ok: false });
  });

  it('drives the real art-evaluator.mjs by default', async () => {
    vi.doMock(
      '../../../../scripts/vision/art-evaluator.mjs',
      async importOriginal => ({
        ...(await importOriginal<object>()),
        subscriptionVisionTransport: () => async () =>
          '{"status":"pass","focalPoint":"headline","competing":[],"identityDrift":[],"notes":"clean"}',
      })
    );
    const dir = mkdtempSync(join(tmpdir(), 'marketing-media-'));
    const image = join(dir, 'a.png');
    writeFileSync(image, new Uint8Array([137, 80, 78, 71]));
    try {
      const gate = createArtEvaluatorGate();
      await expect(
        gate({ ...gateInput, imagePath: image })
      ).resolves.toMatchObject({ ok: true, notes: ['focal: clean'] });
    } finally {
      vi.doUnmock('../../../../scripts/vision/art-evaluator.mjs');
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('capture adapter', () => {
  const registry: CaptureRegistry = {
    getScenario: id =>
      id === 'exported'
        ? { consumers: ['marketing-export'] }
        : id === 'admin-only'
          ? { consumers: ['admin'] }
          : id === 'broken'
            ? { consumers: ['marketing-export'] }
            : null,
    getExportImage: id => {
      if (id === 'broken') throw new Error('no publicExportPath');
      return {
        publicUrl: `/product-screenshots/${id}.png`,
        width: 1,
        height: 1,
        alt: id,
      };
    },
  };
  const base = { pageId: 'p', sectionInstanceId: 's' };

  it('resolves a registered marketing-export scenario', () => {
    expect(
      resolveCapture(
        {
          ...base,
          sourcing: { kind: 'registry-capture', scenarioId: 'exported' },
        },
        registry
      )
    ).toMatchObject({ status: 'resolved', scenarioId: 'exported' });
  });

  it('queues unregistered, non-export and unpublishable scenarios', () => {
    expect(
      resolveCapture(
        {
          ...base,
          sourcing: {
            kind: 'capture-request',
            scenarioId: null,
            reason: 'new',
          },
        },
        registry
      )
    ).toMatchObject({
      status: 'queued',
      request: { scenarioId: null, workflow: 'screenshots.yml', reason: 'new' },
    });
    expect(
      resolveCapture(
        {
          ...base,
          sourcing: { kind: 'registry-capture', scenarioId: 'admin-only' },
        },
        registry
      )
    ).toMatchObject({ status: 'queued' });
    expect(
      resolveCapture(
        {
          ...base,
          sourcing: { kind: 'registry-capture', scenarioId: 'broken' },
        },
        registry
      )
    ).toMatchObject({
      status: 'queued',
      request: { reason: 'no publicExportPath' },
    });
  });

  it('reads the real screenshot registry by default', () => {
    const exported = getMarketingExportScenarios()[0];
    expect(exported).toBeDefined();
    expect(isRegisteredMarketingCapture(exported.id)).toBe(true);
    const adminOnly = SCREENSHOT_SCENARIOS.find(
      scenario => !scenario.consumers.includes('marketing-export')
    );
    if (adminOnly) {
      expect(isRegisteredMarketingCapture(adminOnly.id)).toBe(false);
    }
    expect(isRegisteredMarketingCapture('does-not-exist')).toBe(false);
  });
});

describe('mediaExport seam', () => {
  it('feeds generated results into executeMarketingMediaExportRequest', () => {
    const fixture = MARKETING_MEDIA_EXPORT_FIXTURES[0];
    const unavailable: MarketingImageResult = {
      status: 'credentials-unavailable',
      provider: 'fal',
      reason: 'FAL_KEY is not set',
    };
    const execution = executeMarketingMediaExportRequest({
      request: {
        fixtureId: fixture.id,
        sourceRevision: 'rev-1',
        recipeId: fixture.recipeId,
        accentToken: fixture.accentToken,
        outputProfiles: ['still', 'poster'],
        rendererVersion: 'r1',
        tokenPolicyVersion: 't1',
        fallbackPolicy: 'static-only',
      },
      produceOutput: createGeneratedProduceOutput({ still: unavailable }),
    });
    expect(execution.status).toBe('partial');
    if (execution.status === 'partial') {
      expect(execution.findings.map(finding => finding.code)).toEqual([
        'output-provider-unavailable',
        'output-provider-unavailable',
      ]);
      expect(execution.receipt.approved).toBe(false);
    }
  });
});
