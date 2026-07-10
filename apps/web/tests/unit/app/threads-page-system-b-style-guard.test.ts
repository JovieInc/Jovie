import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const appRoot = join(dirname(fileURLToPath(import.meta.url)), '../../..');
const sourcePath = join(
  appRoot,
  'app/app/(shell)/threads/ThreadsPageClient.tsx'
);

const colorMixPattern = /color-mix\(/i;
const inlineLinearSurfacePattern =
  /\b(?:bg|border)-\[[^\]\n]*--linear-[^\]\n]*\]/;
const legacyFrameSeamPattern =
  /border-\[color-mix\(in_oklab,var\(--linear-app-frame-seam\)[^\]]+\)\]/;
const legacyContentSurfacePattern =
  /bg-\[color-mix\(in_oklab,var\(--linear-app-content-surface\)[^\]]+\)\]/;

describe('threads page System B source contract', () => {
  it('keeps threads chrome on named System B primitives', async () => {
    const source = await readFile(sourcePath, 'utf8');

    expect(source).not.toMatch(colorMixPattern);
    expect(source).not.toMatch(inlineLinearSurfacePattern);
    expect(source).not.toMatch(legacyFrameSeamPattern);
    expect(source).not.toMatch(legacyContentSurfacePattern);
    expect(source).toContain(
      "className='shrink-0 border-b border-subtle px-4 py-3 sm:px-6'"
    );
    expect(source).toContain(
      "className='grid min-h-72 place-items-center rounded-2xl border border-dashed border-subtle bg-surface-0 px-6 py-10 text-center'"
    );
  });

  it('keeps layout-state wrappers stable across thread states', async () => {
    const source = await readFile(sourcePath, 'utf8');

    expect(source).toContain("className='flex h-full min-h-0 flex-col'");
    expect(source).toContain(
      "className='min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-6'"
    );
    expect(source).toContain('<ChatListSkeleton />');
    expect(source).toContain('<PageErrorState');
    expect(source).toContain('filteredThreads.length === 0');
    expect(source).toContain('filteredThreads.map(thread => (');
  });
});
