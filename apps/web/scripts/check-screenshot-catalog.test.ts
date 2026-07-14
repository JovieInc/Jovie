import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  checkScreenshotCatalog,
  SCREENSHOT_CATALOG_BUDGETS,
  ScreenshotCatalogIntegrityError,
  type ScreenshotCatalogPaths,
} from './check-screenshot-catalog';

const fixtureRoots: string[] = [];

const scenarios = [
  {
    id: 'homepage-desktop',
    title: 'Homepage',
    group: 'marketing',
    groupLabel: 'Marketing',
    route: '/',
    viewport: 'desktop',
    theme: 'dark',
    consumers: ['admin'],
    publicExportPath: 'homepage.png',
  },
] as const;

afterEach(async () => {
  await Promise.all(
    fixtureRoots.splice(0).map(root => rm(root, { recursive: true }))
  );
});

async function createFixture(): Promise<ScreenshotCatalogPaths> {
  const root = await mkdtemp(join(tmpdir(), 'jovie-screenshot-catalog-'));
  fixtureRoots.push(root);
  const catalogDirectory = join(root, 'screenshot-catalog/current');
  const publicExportDirectory = join(root, 'public/product-screenshots');
  const manifestPath = join(catalogDirectory, 'manifest.json');
  const image = Buffer.from('canonical-image');

  await mkdir(catalogDirectory, { recursive: true });
  await mkdir(publicExportDirectory, { recursive: true });
  await writeFile(join(catalogDirectory, 'homepage-desktop.png'), image);
  await writeFile(join(publicExportDirectory, 'homepage.png'), image);
  await writeFile(
    manifestPath,
    `${JSON.stringify(
      [
        {
          ...scenarios[0],
          imagePath: 'homepage-desktop.png',
          capturedAt: '2026-07-13T00:00:00.000Z',
          gitSha: null,
        },
      ],
      null,
      2
    )}\n`
  );

  return { catalogDirectory, manifestPath, publicExportDirectory };
}

describe('checkScreenshotCatalog', () => {
  it('accepts a bounded catalog that exactly matches the registry and exports', async () => {
    const paths = await createFixture();

    await expect(checkScreenshotCatalog({ paths, scenarios })).resolves.toEqual(
      {
        catalogBytes: 15,
        catalogFiles: 1,
        manifestEntries: 1,
        publicExportBytes: 15,
        publicExportFiles: 1,
      }
    );
  });

  it('rejects manifest drift, temporary files, and stale public exports', async () => {
    const paths = await createFixture();
    await writeFile(
      join(paths.catalogDirectory, 'homepage-desktop.next.png'),
      'temporary'
    );
    await writeFile(join(paths.publicExportDirectory, 'stale.png'), 'stale');
    await writeFile(
      join(paths.publicExportDirectory, 'homepage.png'),
      'different'
    );

    const driftedScenarios = [{ ...scenarios[0], title: 'Changed title' }];

    await expect(
      checkScreenshotCatalog({ paths, scenarios: driftedScenarios })
    ).rejects.toMatchObject<ScreenshotCatalogIntegrityError>({
      violations: expect.arrayContaining([
        'homepage-desktop: manifest title does not match the registry',
        'screenshot-catalog/current contains orphan or temporary file: homepage-desktop.next.png',
        'public/product-screenshots contains orphan or temporary file: stale.png',
        'homepage-desktop: public export does not match its canonical catalog image',
      ]),
    });
  });

  it('rejects count, total-byte, and per-image budget overruns', async () => {
    const paths = await createFixture();

    await expect(
      checkScreenshotCatalog({
        paths,
        scenarios,
        budgets: {
          catalog: { maxBytes: 1, maxFiles: 0 },
          publicExports: { maxBytes: 1, maxFiles: 0 },
          maxImageBytes: 1,
        },
      })
    ).rejects.toMatchObject<ScreenshotCatalogIntegrityError>({
      violations: expect.arrayContaining([
        expect.stringContaining('over the 0-image budget'),
        expect.stringContaining('per-image budget'),
        expect.stringContaining('over the 0.00 MiB budget'),
      ]),
    });
  });

  it('rejects an image over the production 3 MiB cap', async () => {
    const paths = await createFixture();
    const oversizedImage = Buffer.alloc(
      SCREENSHOT_CATALOG_BUDGETS.maxImageBytes + 1
    );
    await writeFile(
      join(paths.catalogDirectory, 'homepage-desktop.png'),
      oversizedImage
    );
    await writeFile(
      join(paths.publicExportDirectory, 'homepage.png'),
      oversizedImage
    );

    await expect(
      checkScreenshotCatalog({ paths, scenarios })
    ).rejects.toMatchObject<ScreenshotCatalogIntegrityError>({
      violations: expect.arrayContaining([
        expect.stringContaining('over the 3.00 MiB per-image budget'),
      ]),
    });
  });
});
