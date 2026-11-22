import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  checkScreenshotCatalog,
  imageBytes,
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
  await symlink(
    '../../screenshot-catalog/current/homepage-desktop.png',
    join(publicExportDirectory, 'homepage.png')
  );
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

  it('rejects a regular-file public export that copies the catalog bytes', async () => {
    const paths = await createFixture();
    const publicExport = join(paths.publicExportDirectory, 'homepage.png');
    await rm(publicExport);
    await writeFile(publicExport, 'canonical-image');

    await expect(
      checkScreenshotCatalog({ paths, scenarios })
    ).rejects.toMatchObject({
      violations: expect.arrayContaining([
        'homepage-desktop: public export must be a symlink to its canonical catalog image (regular-file copies double the combined-tree byte budget)',
      ]),
    } satisfies Pick<ScreenshotCatalogIntegrityError, 'violations'>);
  });

  it('rejects a public export symlink to any non-canonical file', async () => {
    const paths = await createFixture();
    const publicExport = join(paths.publicExportDirectory, 'homepage.png');
    await writeFile(
      join(paths.catalogDirectory, 'other.png'),
      'canonical-image'
    );
    await rm(publicExport);
    await symlink('../../screenshot-catalog/current/other.png', publicExport);

    await expect(
      checkScreenshotCatalog({ paths, scenarios })
    ).rejects.toMatchObject({
      violations: expect.arrayContaining([
        'homepage-desktop: public export symlink must target its canonical catalog image',
      ]),
    } satisfies Pick<ScreenshotCatalogIntegrityError, 'violations'>);
  });

  it('rejects manifest drift, temporary files, and stale public exports', async () => {
    const paths = await createFixture();
    await writeFile(
      join(paths.catalogDirectory, 'homepage-desktop.next.png'),
      'temporary'
    );
    await writeFile(join(paths.publicExportDirectory, 'stale.png'), 'stale');
    await rm(join(paths.publicExportDirectory, 'homepage.png'));
    await writeFile(
      join(paths.publicExportDirectory, 'homepage.png'),
      'different'
    );

    const driftedScenarios = [{ ...scenarios[0], title: 'Changed title' }];

    await expect(
      checkScreenshotCatalog({ paths, scenarios: driftedScenarios })
    ).rejects.toMatchObject({
      violations: expect.arrayContaining([
        'homepage-desktop: manifest title does not match the registry',
        'screenshot-catalog/current contains orphan or temporary file: homepage-desktop.next.png',
        'public/product-screenshots contains orphan or temporary file: stale.png',
        'homepage-desktop: public export must be a symlink to its canonical catalog image (regular-file copies double the combined-tree byte budget)',
      ]),
    } satisfies Pick<ScreenshotCatalogIntegrityError, 'violations'>);
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
    ).rejects.toMatchObject({
      violations: expect.arrayContaining([
        expect.stringContaining('over the 0-image budget'),
        expect.stringContaining('per-image budget'),
        expect.stringContaining('over the 0.00 MiB budget'),
      ]),
    } satisfies Pick<ScreenshotCatalogIntegrityError, 'violations'>);
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
    // Public export stays a symlink to the (now oversized) catalog image.

    await expect(
      checkScreenshotCatalog({ paths, scenarios })
    ).rejects.toMatchObject({
      violations: expect.arrayContaining([
        expect.stringContaining('over the 3.00 MiB per-image budget'),
      ]),
    } satisfies Pick<ScreenshotCatalogIntegrityError, 'violations'>);
  });

  it('accepts byte-identical catalog dedupe symlinks without double-counting bytes', async () => {
    const paths = await createFixture();
    const twinScenarios = [
      scenarios[0],
      {
        id: 'homepage-desktop-twin',
        title: 'Homepage twin',
        group: 'marketing',
        groupLabel: 'Marketing',
        route: '/twin',
        viewport: 'desktop' as const,
        theme: 'dark' as const,
        consumers: ['admin'],
        publicExportPath: 'homepage-twin.png',
      },
    ];
    await symlink(
      'homepage-desktop.png',
      join(paths.catalogDirectory, 'homepage-desktop-twin.png')
    );
    await symlink(
      '../../screenshot-catalog/current/homepage-desktop-twin.png',
      join(paths.publicExportDirectory, 'homepage-twin.png')
    );
    await writeFile(
      paths.manifestPath,
      `${JSON.stringify(
        twinScenarios.map(scenario => ({
          ...scenario,
          imagePath:
            scenario.id === 'homepage-desktop'
              ? 'homepage-desktop.png'
              : 'homepage-desktop-twin.png',
          capturedAt: '2026-07-13T00:00:00.000Z',
          gitSha: null,
        })),
        null,
        2
      )}\n`
    );

    await expect(
      checkScreenshotCatalog({ paths, scenarios: twinScenarios })
    ).resolves.toEqual({
      catalogBytes: 15,
      catalogFiles: 2,
      manifestEntries: 2,
      publicExportBytes: 30,
      publicExportFiles: 2,
    });
  });
});

describe('imageBytes', () => {
  it('counts a Git LFS pointer at the size of the image it stands for', async () => {
    const root = await mkdtemp(join(tmpdir(), 'catalog-lfs-'));
    fixtureRoots.push(root);
    const pointer = join(root, 'pointer.png');
    const body = `version https://git-lfs.github.com/spec/v1\noid sha256:${'a'.repeat(64)}\nsize 1986778\n`;
    await writeFile(pointer, body);
    expect(await imageBytes(pointer, body.length)).toBe(1_986_778);
    const small = join(root, 'small.png');
    await writeFile(small, 'tiny png bytes');
    expect(await imageBytes(small, 14)).toBe(14);
    expect(await imageBytes(small, 5_000)).toBe(5_000);
  });
});
