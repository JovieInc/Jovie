import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

function findSourceFile(...candidates: string[]): string | undefined {
  return candidates.find(candidate => existsSync(candidate));
}

const RELEASE_DOWNLOADS_PAGE = findSourceFile(
  resolve(
    process.cwd(),
    'app/app/(shell)/dashboard/releases/[releaseId]/downloads/page.tsx'
  ),
  resolve(
    process.cwd(),
    'apps/web/app/app/(shell)/dashboard/releases/[releaseId]/downloads/page.tsx'
  )
);

function readReleaseDownloadsSource(): string {
  expect(RELEASE_DOWNLOADS_PAGE).toBeDefined();

  if (!RELEASE_DOWNLOADS_PAGE) {
    throw new Error('Could not find release downloads page source');
  }

  return readFileSync(RELEASE_DOWNLOADS_PAGE, 'utf8');
}

describe('release downloads shell contract', () => {
  it('uses shared shell surfaces and header chrome', () => {
    const source = readReleaseDownloadsSource();

    expect(source).toContain(
      "import { ContentSectionHeader } from '@/components/molecules/ContentSectionHeader';"
    );
    expect(source).toContain(
      "import { ContentSurfaceCard } from '@/components/molecules/ContentSurfaceCard';"
    );
    expect(source).toContain('<ContentSectionHeader');
    expect(source).toContain('<ContentSurfaceCard');
    expect(source).not.toContain("className='space-y-6'");
    expect(source).not.toContain('border-white/10');
    expect(source).not.toContain('ring-white');
  });

  it('keeps the upload target drag/drop capable without invisible overlay hacks', () => {
    const source = readReleaseDownloadsSource();

    expect(source).toContain("data-testid='promo-download-dropzone'");
    expect(source).toContain('onDrop={handleDrop}');
    expect(source).toContain("className='sr-only'");
    expect(source).not.toContain("className='absolute inset-0");
    expect(source).not.toContain("style={{ position: 'relative' }}");
  });

  it('surfaces network failures instead of silently swallowing them', () => {
    const source = readReleaseDownloadsSource();

    expect(source).toContain('Unable to load promo downloads right now.');
    expect(source).toContain('Unable to update file visibility.');
    expect(source).toContain('Unable to delete this file.');
    expect(source).not.toContain('Silently fail');
    expect(source).not.toContain('Revert on error');
  });
});
