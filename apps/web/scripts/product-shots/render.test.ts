import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import type { Page } from '@playwright/test';
import sharp from 'sharp';
import { describe, expect, it, vi } from 'vitest';
import type { ProductShotSpec } from '../../lib/screenshots/product-shots';
import { cropBox, renderShot } from './render';
import { hashShotSources } from './source-hash.mjs';

function fakePage(png: Buffer, size = 8) {
  const locator = {
    first: () => locator,
    waitFor: vi.fn(async () => undefined),
    evaluate: vi.fn(async () => ({
      left: 2,
      top: 3,
      right: 2 + size,
      bottom: 3 + size,
    })),
  };
  const page = {
    goto: vi.fn(async () => undefined),
    locator: vi.fn(() => locator),
    evaluate: vi.fn(async () => ({ width: 100, height: 100 })),
    addStyleTag: vi.fn(async () => undefined),
    screenshot: vi.fn(async () => png),
    clock: { setFixedTime: vi.fn(async () => undefined) },
  };
  return { page, locator };
}

const spec: ProductShotSpec = {
  id: 'unit-fixture',
  title: 'Fixture',
  alt: 'Fixture control',
  route: '/demo/fixture',
  viewport: 'desktop',
  theme: 'dark',
  waitFor: 'main',
  crop: ['main'],
  displayWidth: 4,
  frame: 'bare',
  sources: ['source.ts'],
  placements: ['/product'],
};

describe('product-shot renderer operational paths', () => {
  it('encodes the actual screenshot and returns checked producer metadata in owned output', async () => {
    const root = mkdtempSync(join(tmpdir(), 'shot-render-'));
    writeFileSync(join(root, 'source.ts'), 'fixture source\n');
    const outDir = join(root, 'output');
    const png = await sharp({
      create: { width: 8, height: 8, channels: 3, background: '#334455' },
    })
      .png()
      .toBuffer();
    const { page } = fakePage(png);
    const result = await renderShot(
      page as unknown as Page,
      'http://localhost:3000',
      { ...spec, fixedNow: '2026-01-01T00:00:00Z' },
      { outDir, repoRoot: root }
    );
    expect(page.goto).toHaveBeenCalledWith(
      'http://localhost:3000/demo/fixture',
      expect.objectContaining({ waitUntil: 'load' })
    );
    expect(page.clock.setFixedTime).toHaveBeenCalled();
    expect(page.screenshot).toHaveBeenCalledWith(
      expect.objectContaining({
        clip: { x: 2, y: 3, width: 8, height: 8 },
        animations: 'disabled',
      })
    );
    expect(result).toMatchObject({
      width: 8,
      height: 8,
      sourceHash: hashShotSources(root, spec.sources),
      sources: spec.sources,
    });
    for (const ext of ['avif', 'webp'] as const) {
      const file = readFileSync(join(outDir, spec.id + '.' + ext));
      expect(file.length).toBe(result.bytes[ext]);
      expect((await sharp(file).metadata()).width).toBe(8);
    }
  });

  it('propagates navigation failure before taking or writing an image', async () => {
    const { page } = fakePage(Buffer.from('unused'));
    page.goto.mockRejectedValueOnce(new Error('route unavailable'));
    await expect(
      renderShot(page as unknown as Page, 'http://localhost:3000', spec)
    ).rejects.toThrow('route unavailable');
    expect(page.screenshot).not.toHaveBeenCalled();
  });

  it('rejects a crop with no painted box', async () => {
    const { page } = fakePage(Buffer.from('unused'), 0);
    await expect(cropBox(page as unknown as Page, spec)).rejects.toThrow(
      'has no box'
    );
  });

  it('rejects invalid image payloads instead of returning a successful render record', async () => {
    const root = mkdtempSync(join(tmpdir(), 'shot-bad-image-'));
    writeFileSync(join(root, 'source.ts'), 'fixture source\n');
    const { page } = fakePage(Buffer.from('not an image'));
    await expect(
      renderShot(page as unknown as Page, 'http://localhost:3000', spec, {
        outDir: join(root, 'output'),
        repoRoot: root,
      })
    ).rejects.toThrow();
  });

  it('rejects invalid CLI selection without mutating committed metadata', () => {
    const renderer = resolve('scripts/product-shots/render.ts');
    const manifest = resolve('lib/screenshots/product-shots.manifest.json');
    const before = readFileSync(manifest);
    expect(() =>
      execFileSync(
        process.execPath,
        ['--import', 'tsx', renderer, '--only', 'unknown-product-shot'],
        { stdio: 'pipe' }
      )
    ).toThrow();
    expect(readFileSync(manifest)).toEqual(before);
  });
});
