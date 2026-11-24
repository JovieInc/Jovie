import {
  lstat,
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { replaceWithAtomicSibling } from '../../product-screenshots/atomic-output';

const fixtureRoots: string[] = [];

async function makeFixture() {
  const root = await mkdtemp(
    path.join(os.tmpdir(), 'screenshot-atomic-output-')
  );
  fixtureRoots.push(root);
  return root;
}

afterEach(async () => {
  await Promise.all(
    fixtureRoots
      .splice(0)
      .map(root => rm(root, { recursive: true, force: true }))
  );
});

describe('replaceWithAtomicSibling', () => {
  it('keeps the stable file unchanged until the confirmed sibling is renamed', async () => {
    const root = await makeFixture();
    const target = path.join(root, 'catalog.png');
    await writeFile(target, 'old');

    await expect(
      replaceWithAtomicSibling(target, async temporaryPath => {
        await writeFile(temporaryPath, 'new');
        await expect(readFile(target, 'utf8')).resolves.toBe('old');
        return true;
      })
    ).resolves.toBe(true);

    await expect(readFile(target, 'utf8')).resolves.toBe('new');
    await expect(readdir(root)).resolves.toEqual(['catalog.png']);
  });

  it('preserves the stable file and cleans the sibling on rejection or failure', async () => {
    const root = await makeFixture();
    const target = path.join(root, 'manifest.json');
    await writeFile(target, 'old');

    await expect(
      replaceWithAtomicSibling(target, async temporaryPath => {
        await writeFile(temporaryPath, 'unchanged');
        return false;
      })
    ).resolves.toBe(false);
    await expect(readFile(target, 'utf8')).resolves.toBe('old');
    await expect(readdir(root)).resolves.toEqual(['manifest.json']);

    await expect(
      replaceWithAtomicSibling(target, async temporaryPath => {
        await writeFile(temporaryPath, 'partial');
        throw new Error('capture failed');
      })
    ).rejects.toThrow('capture failed');
    await expect(readFile(target, 'utf8')).resolves.toBe('old');
    await expect(readdir(root)).resolves.toEqual(['manifest.json']);
  });

  it('cleans the sibling when the final rename cannot replace the target', async () => {
    const root = await makeFixture();
    const target = path.join(root, 'catalog.png');
    await mkdir(target);

    await expect(
      replaceWithAtomicSibling(target, async temporaryPath => {
        await writeFile(temporaryPath, 'new');
        return true;
      })
    ).rejects.toThrow();

    await expect(readdir(root)).resolves.toEqual(['catalog.png']);
    await expect(readdir(target)).resolves.toEqual([]);
  });

  it('replaces a symlinked target with a regular file even when the content is unchanged', async () => {
    const root = await makeFixture();
    const shared = path.join(root, 'playlist-fallback.png');
    const target = path.join(root, 'tour-nearby.png');
    await writeFile(shared, 'same');
    await symlink('playlist-fallback.png', target);

    await expect(
      replaceWithAtomicSibling(target, async temporaryPath => {
        await writeFile(temporaryPath, 'same');
        return false;
      })
    ).resolves.toBe(true);

    const stats = await lstat(target);
    expect(stats.isSymbolicLink()).toBe(false);
    expect(stats.isFile()).toBe(true);
    await expect(readFile(target, 'utf8')).resolves.toBe('same');
    await expect(readFile(shared, 'utf8')).resolves.toBe('same');
  });
});
