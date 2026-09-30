import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';

import { createCaptureProduceOutput } from './capture-adapter';
import { createFalProduceOutput } from './fal-image-adapter';
import {
  AI_GENERATED_MARKUP,
  buildGeneratedAssetProvenance,
  provenanceSidecarPath,
  writeProvenanceSidecar,
} from './provenance';

const SCRIPTS_DIR = dirname(fileURLToPath(import.meta.url));
const WEB_ROOT = join(SCRIPTS_DIR, '..', '..');
const CATALOG_DIR = join(WEB_ROOT, 'screenshot-catalog', 'current');
const ART_EVALUATOR = join(SCRIPTS_DIR, 'art-evaluator.mjs');
const SCENARIO = 'artist-profile-hero-section-desktop';

const tmp = mkdtempSync(join(tmpdir(), 'marketing-media-'));
afterAll(() => rmSync(tmp, { recursive: true, force: true }));

function minimalPng(width = 4, height = 4): Buffer {
  const png = Buffer.alloc(33);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(png);
  png.writeUInt32BE(13, 8); // IHDR length
  png.write('IHDR', 12);
  png.writeUInt32BE(width, 16);
  png.writeUInt32BE(height, 20);
  return png;
}

function runEvaluator(assetPath: string): { status: number; stderr: string } {
  try {
    execFileSync('node', [ART_EVALUATOR, assetPath], { stdio: 'pipe' });
    return { status: 0, stderr: '' };
  } catch (error) {
    const e = error as { status: number; stderr: Buffer };
    return { status: e.status, stderr: e.stderr.toString() };
  }
}

describe('capture adapter (JOV-7250)', () => {
  it('serves a registered screenshot-catalog capture for every profile', () => {
    const produce = createCaptureProduceOutput(SCENARIO, CATALOG_DIR);
    for (const profile of ['still', 'poster', 'sequence'] as const) {
      const result = produce(profile);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.format).toBe('image/png');
        expect(result.rightsProvenance).toContain(SCENARIO);
        expect(result.assetHash).toMatch(/^[0-9a-f]{64}$/);
        expect(result.width).toBeGreaterThan(0);
      }
    }
  });

  it('fails closed for an unregistered scenario', () => {
    const produce = createCaptureProduceOutput('no-such-scenario', CATALOG_DIR);
    expect(produce('still')).toEqual({
      ok: false,
      code: 'output-provider-unavailable',
    });
  });
});

describe('generated-asset provenance (JOV-7250)', () => {
  it('stamps AI-generated markup and a C2PA assertion block', () => {
    const provenance = buildGeneratedAssetProvenance({
      assetId: 'a1',
      generator: 'fal/fal-ai/flux/schnell',
      prompt: 'editorial background',
    });
    expect(provenance.aiGenerated).toBe(true);
    expect(provenance.markup).toBe(AI_GENERATED_MARKUP);
    expect(provenance.c2pa.assertions.length).toBeGreaterThan(0);
    expect(provenance.c2pa.signature).toBeNull();
  });
});

describe('art evaluator gate (JOV-7250)', () => {
  it('passes a generated asset that carries its provenance sidecar', () => {
    const asset = join(tmp, 'generated.png');
    writeFileSync(asset, minimalPng());
    writeProvenanceSidecar(
      asset,
      buildGeneratedAssetProvenance({
        assetId: 'a1',
        generator: 'fal/test',
        prompt: 'x',
      })
    );
    expect(runEvaluator(asset).status).toBe(0);
  });

  it('rejects a generated asset with no provenance sidecar', () => {
    const asset = join(tmp, 'unmarked.png');
    writeFileSync(asset, minimalPng());
    const { status, stderr } = runEvaluator(asset);
    expect(status).toBe(1);
    expect(stderr).toContain('missing provenance sidecar');
  });

  it('rejects a missing asset', () => {
    const { status, stderr } = runEvaluator(join(tmp, 'gone.png'));
    expect(status).toBe(1);
    expect(stderr).toContain('asset not found');
  });
});

describe('fal image adapter (JOV-7250)', () => {
  it('fails closed when the generated asset does not exist', () => {
    const produce = createFalProduceOutput({
      apiKey: undefined,
      prompt: 'x',
      assetId: 'a1',
      outPath: join(tmp, 'never-generated.png'),
      generate: false,
    });
    expect(produce('still')).toEqual({
      ok: false,
      code: 'output-provider-unavailable',
    });
  });

  it('serves a gated generated asset with AI provenance', () => {
    const asset = join(tmp, 'fal-asset.png');
    writeFileSync(asset, minimalPng());
    writeProvenanceSidecar(
      asset,
      buildGeneratedAssetProvenance({
        assetId: 'a1',
        generator: 'fal/test',
        prompt: 'x',
      })
    );
    const produce = createFalProduceOutput({
      apiKey: 'test-key',
      prompt: 'x',
      assetId: 'a1',
      outPath: asset,
      generate: true,
    });
    const result = produce('still');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.rightsProvenance).toContain('ai-generated');
      expect(readFileSync(provenanceSidecarPath(asset), 'utf8')).toContain(
        'aiGenerated'
      );
    }
  });
});
