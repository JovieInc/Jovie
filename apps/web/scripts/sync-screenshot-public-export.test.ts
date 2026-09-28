import {
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  readlink,
  realpath,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { replaceWithAtomicSibling } from '../tests/product-screenshots/atomic-output';
import { pruneFixedOwnedOutputFiles } from './owned-output-path';
import { syncScreenshotPublicExport } from './sync-screenshot-public-export';

const roots: string[] = [];
const imagePath = 'scenario-desktop.png';
const publicExportPath = 'scenario.png';
const expectedTarget = `../../screenshot-catalog/current/${imagePath}`;

afterEach(async () => {
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true })));
});

async function createFixture() {
  const webRoot = await mkdtemp(
    join(await realpath(tmpdir()), 'jovie-screenshot-export-')
  );
  roots.push(webRoot);
  const catalogDirectory = join(webRoot, 'screenshot-catalog/current');
  const publicDirectory = join(webRoot, 'public/product-screenshots');
  await Promise.all([
    mkdir(catalogDirectory, { recursive: true }),
    mkdir(publicDirectory, { recursive: true }),
  ]);
  const catalogPath = join(catalogDirectory, imagePath);
  const publicPath = join(publicDirectory, publicExportPath);
  await writeFile(catalogPath, 'catalog image');
  return {
    catalogDirectory,
    catalogPath,
    publicDirectory,
    publicPath,
    webRoot,
  };
}

describe('syncScreenshotPublicExport', () => {
  it('preserves a canonical link through capture setup and a fresh capture', async () => {
    const fixture = await createFixture();
    await symlink(expectedTarget, fixture.publicPath);
    const orphanPath = join(fixture.publicDirectory, 'stale-export.png');
    await writeFile(orphanPath, 'stale');

    // These are both owned-output prune calls performed by catalog.spec.ts.
    await pruneFixedOwnedOutputFiles(
      join(fixture.webRoot, 'screenshot-catalog'),
      'current',
      fixture.catalogDirectory,
      'SCREENSHOT_CATALOG_OUTPUT_DIR',
      new Set([imagePath, 'manifest.json'])
    );
    await pruneFixedOwnedOutputFiles(
      join(fixture.webRoot, 'public'),
      'product-screenshots',
      fixture.publicDirectory,
      'PUBLIC_SCREENSHOT_EXPORT_DIR',
      new Set([publicExportPath])
    );
    expect((await lstat(fixture.publicPath)).isSymbolicLink()).toBe(true);
    await expect(readFile(orphanPath)).rejects.toMatchObject({
      code: 'ENOENT',
    });
    await expect(readFile(fixture.publicPath, 'utf8')).resolves.toBe(
      'catalog image'
    );

    // captureCatalogImage uses this same atomic replacement before export sync.
    await replaceWithAtomicSibling(fixture.catalogPath, async temporaryPath => {
      await writeFile(temporaryPath, 'fresh catalog image');
      return true;
    });
    await syncScreenshotPublicExport({
      imagePath,
      publicExportPath,
      webRoot: fixture.webRoot,
    });

    expect((await lstat(fixture.publicPath)).isSymbolicLink()).toBe(true);
    await expect(readlink(fixture.publicPath)).resolves.toBe(expectedTarget);
    await expect(readFile(fixture.publicPath, 'utf8')).resolves.toBe(
      'fresh catalog image'
    );
  });

  it('creates and refreshes regular copies for missing or existing exports', async () => {
    const fixture = await createFixture();

    await syncScreenshotPublicExport({
      imagePath,
      publicExportPath,
      webRoot: fixture.webRoot,
    });
    expect((await lstat(fixture.publicPath)).isFile()).toBe(true);
    expect((await lstat(fixture.publicPath)).isSymbolicLink()).toBe(false);
    await expect(readFile(fixture.publicPath, 'utf8')).resolves.toBe(
      'catalog image'
    );
    await syncScreenshotPublicExport({
      imagePath,
      publicExportPath,
      webRoot: fixture.webRoot,
    });
    expect((await lstat(fixture.publicPath)).isSymbolicLink()).toBe(false);

    await writeFile(fixture.catalogPath, 'updated catalog image');
    await syncScreenshotPublicExport({
      imagePath,
      publicExportPath,
      webRoot: fixture.webRoot,
    });
    expect((await lstat(fixture.publicPath)).isFile()).toBe(true);
    expect((await lstat(fixture.publicPath)).isSymbolicLink()).toBe(false);
    await expect(readFile(fixture.publicPath, 'utf8')).resolves.toBe(
      'updated catalog image'
    );
  });

  it('rejects a symlinked catalog image', async () => {
    const fixture = await createFixture();
    const otherImagePath = 'other.png';
    const otherPath = join(fixture.catalogDirectory, otherImagePath);
    await writeFile(otherPath, 'catalog image');
    await rm(fixture.catalogPath);
    await symlink(otherImagePath, fixture.catalogPath);

    await expect(
      syncScreenshotPublicExport({
        imagePath,
        publicExportPath,
        webRoot: fixture.webRoot,
      })
    ).rejects.toThrow('catalog image must be a regular file');
  });

  it('rejects a missing or non-regular canonical image', async () => {
    const missingFixture = await createFixture();
    await rm(missingFixture.catalogPath);
    await expect(
      syncScreenshotPublicExport({
        imagePath,
        publicExportPath,
        webRoot: missingFixture.webRoot,
      })
    ).rejects.toThrow('Screenshot catalog image is missing');

    const nonRegularFixture = await createFixture();
    await rm(nonRegularFixture.catalogPath);
    await mkdir(nonRegularFixture.catalogPath);
    await expect(
      syncScreenshotPublicExport({
        imagePath,
        publicExportPath,
        webRoot: nonRegularFixture.webRoot,
      })
    ).rejects.toThrow('Screenshot catalog image must be a regular file');
  });

  it('rejects an incorrect link even when its target has identical bytes', async () => {
    const fixture = await createFixture();
    const otherImagePath = 'other.png';
    const otherPath = join(fixture.catalogDirectory, otherImagePath);
    await writeFile(otherPath, 'catalog image');
    await symlink(
      `../../screenshot-catalog/current/${otherImagePath}`,
      fixture.publicPath
    );

    await expect(
      syncScreenshotPublicExport({
        imagePath,
        publicExportPath,
        webRoot: fixture.webRoot,
      })
    ).rejects.toThrow('symlink has an unexpected target');
  });

  it('rejects and preserves a dangling public link', async () => {
    const fixture = await createFixture();
    const danglingTarget = '../../screenshot-catalog/current/missing.png';
    await symlink(danglingTarget, fixture.publicPath);

    await expect(
      syncScreenshotPublicExport({
        imagePath,
        publicExportPath,
        webRoot: fixture.webRoot,
      })
    ).rejects.toThrow('symlink has an unexpected target');
    await expect(readlink(fixture.publicPath)).resolves.toBe(danglingTarget);
  });

  it('rejects a symlinked catalog output root without changing its sentinel', async () => {
    const fixture = await createFixture();
    const outsideDirectory = join(fixture.webRoot, 'outside-catalog');
    const sentinelPath = join(outsideDirectory, 'sentinel.txt');
    await mkdir(outsideDirectory);
    await writeFile(sentinelPath, 'leave untouched');
    await rm(fixture.catalogDirectory, { recursive: true });
    await symlink(outsideDirectory, fixture.catalogDirectory);

    await expect(
      syncScreenshotPublicExport({
        imagePath,
        publicExportPath,
        webRoot: fixture.webRoot,
      })
    ).rejects.toThrow('Screenshot catalog output must be a real directory');
    await expect(readFile(sentinelPath, 'utf8')).resolves.toBe(
      'leave untouched'
    );
  });

  it('rejects a symlinked public output root without changing its sentinel', async () => {
    const fixture = await createFixture();
    const outsideDirectory = join(fixture.webRoot, 'outside-public');
    const sentinelPath = join(outsideDirectory, 'sentinel.txt');
    await mkdir(outsideDirectory);
    await writeFile(sentinelPath, 'leave untouched');
    await rm(fixture.publicDirectory, { recursive: true });
    await symlink(outsideDirectory, fixture.publicDirectory);

    await expect(
      syncScreenshotPublicExport({
        imagePath,
        publicExportPath,
        webRoot: fixture.webRoot,
      })
    ).rejects.toThrow('Public screenshot export must be a real directory');
    await expect(readFile(sentinelPath, 'utf8')).resolves.toBe(
      'leave untouched'
    );
  });

  it('rejects unsafe paths and non-file destinations', async () => {
    const fixture = await createFixture();
    await expect(
      syncScreenshotPublicExport({
        imagePath: '../scenario-desktop.png',
        publicExportPath,
        webRoot: fixture.webRoot,
      })
    ).rejects.toThrow('one safe path segment');

    await expect(
      syncScreenshotPublicExport({
        imagePath,
        publicExportPath: '../scenario.png',
        webRoot: fixture.webRoot,
      })
    ).rejects.toThrow('one safe path segment');

    await mkdir(fixture.publicPath);
    await expect(
      syncScreenshotPublicExport({
        imagePath,
        publicExportPath,
        webRoot: fixture.webRoot,
      })
    ).rejects.toThrow('regular file or link');
  });

  it('rejects a symlinked web root', async () => {
    const fixture = await createFixture();
    const webRootAlias = join(fixture.webRoot, 'web-root-alias');
    await symlink(fixture.webRoot, webRootAlias);

    await expect(
      syncScreenshotPublicExport({
        imagePath,
        publicExportPath,
        webRoot: webRootAlias,
      })
    ).rejects.toThrow('Web root must be a real directory');
  });
});
