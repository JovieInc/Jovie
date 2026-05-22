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

const PROMO_DOWNLOADS_TABLE = findSourceFile(
  resolve(
    process.cwd(),
    'app/app/(shell)/dashboard/releases/[releaseId]/downloads/PromoDownloadsTable.tsx'
  ),
  resolve(
    process.cwd(),
    'apps/web/app/app/(shell)/dashboard/releases/[releaseId]/downloads/PromoDownloadsTable.tsx'
  )
);

function readReleaseDownloadsSource(): string {
  expect(RELEASE_DOWNLOADS_PAGE).toBeDefined();

  if (!RELEASE_DOWNLOADS_PAGE) {
    throw new Error('Could not find release downloads page source');
  }

  return readFileSync(RELEASE_DOWNLOADS_PAGE, 'utf8');
}

function readPromoDownloadsTableSource(): string {
  expect(PROMO_DOWNLOADS_TABLE).toBeDefined();

  if (!PROMO_DOWNLOADS_TABLE) {
    throw new Error('Could not find promo downloads table source');
  }

  return readFileSync(PROMO_DOWNLOADS_TABLE, 'utf8');
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
    expect(source).toContain(
      "import { PageContent, PageShell } from '@/components/organisms/PageShell';"
    );
    expect(source).toContain('<PageShell');
    expect(source).toContain("data-testid='release-downloads-shell'");
    expect(source).toContain('<PageContent>');
    expect(source).toContain('<ContentSectionHeader');
    expect(source).toContain('<ContentSurfaceCard');
    expect(source).not.toContain("className='space-y-6'");
    expect(source).not.toContain(
      "className='flex min-h-0 flex-1 flex-col gap-4 px-3 py-3 sm:px-4 sm:py-4'"
    );
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

  it('reserves stable feedback and loading regions for conditional states', () => {
    const source = readReleaseDownloadsSource();
    const tableSource = readPromoDownloadsTableSource();

    expect(source).toContain("className='min-h-9");
    expect(source).toContain("className='min-h-10'");
    expect(tableSource).toContain("className='min-h-[220px]");
  });
});
