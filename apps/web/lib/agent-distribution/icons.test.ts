import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  composeIconSvg,
  ICON_SIZES,
  loadIconSource,
  pngDimensions,
  renderIcons,
} from './icons';

const ROOT = join(__dirname, '../../../..');

describe('listing icons', () => {
  it('returns null when the canonical mark or tokens are missing', async () => {
    const empty = await mkdtemp(join(tmpdir(), 'agent-icons-empty-'));
    try {
      expect(await loadIconSource(empty)).toBeNull();
    } finally {
      await rm(empty, { recursive: true, force: true });
    }
  });

  it('builds the icon from the canonical mark on the canvas token', async () => {
    const source = await loadIconSource(ROOT);
    expect(source?.info.markPath).toBe(
      'packages/brand/svg/jovie-mark-white.svg'
    );
    expect(source?.info.background).toMatch(/^#[0-9a-f]{6}$/u);
    expect(source?.svg).toContain(source?.info.background);
    expect(source?.info.sizes).toEqual([48, 64, 512, 1024]);
  });

  it('renders every size at the exact dimensions and records a sha256', async () => {
    const source = await loadIconSource(ROOT);
    if (!source) throw new Error('missing icon source');
    const dir = await mkdtemp(join(tmpdir(), 'agent-icons-'));
    try {
      const rendered = await renderIcons(source, dir);
      expect(rendered.map(r => r.size)).toEqual([...ICON_SIZES]);
      for (const icon of rendered) {
        expect([icon.width, icon.height]).toEqual([icon.size, icon.size]);
        expect(icon.sha256).toMatch(/^[0-9a-f]{64}$/u);
        const png = await readFile(join(dir, icon.file));
        expect(pngDimensions(png)).toEqual({
          width: icon.size,
          height: icon.size,
        });
      }
      const receipt = JSON.parse(
        await readFile(join(dir, 'receipt.json'), 'utf8')
      );
      expect(receipt.icons).toHaveLength(4);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('rejects non-PNG bytes and keeps the mark paths untouched', () => {
    expect(pngDimensions(new Uint8Array(30))).toBeNull();
    const svg = composeIconSvg(
      "<svg viewBox='0 0 100 100'><title>x</title><path d='M0 0'/></svg>",
      '#000000'
    );
    expect(svg).toContain("<path d='M0 0'/>");
    expect(svg).not.toContain('<title>');
  });
});
