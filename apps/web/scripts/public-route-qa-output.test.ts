import {
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  realpath,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { resetPublicRouteQaOutput } from './public-route-qa-output';

describe('resetPublicRouteQaOutput', () => {
  let tempDirectory: string | undefined;

  afterEach(async () => {
    if (tempDirectory) {
      await rm(tempDirectory, { recursive: true, force: true });
      tempDirectory = undefined;
    }
  });

  async function makeTempDirectory() {
    return mkdtemp(
      path.join(await realpath(os.tmpdir()), 'jovie-public-route-qa-')
    );
  }

  it('clears orphaned artifacts before recreating the owned output root', async () => {
    tempDirectory = await makeTempDirectory();
    const outputBase = path.join(tempDirectory, 'public-route-qa');
    const outputRoot = path.join(outputBase, 'latest');
    await mkdir(path.join(outputRoot, 'screenshots'), { recursive: true });
    await Promise.all([
      writeFile(path.join(outputRoot, 'summary.json'), '{}'),
      writeFile(path.join(outputRoot, 'screenshots', 'removed-route.png'), ''),
    ]);

    await resetPublicRouteQaOutput(outputBase, outputRoot);

    await expect(readdir(outputRoot)).resolves.toEqual([]);
  });

  it('refuses to clear a directory outside the owned output base', async () => {
    tempDirectory = await makeTempDirectory();
    const outputBase = path.join(tempDirectory, 'public-route-qa');
    const outsideRoot = path.join(tempDirectory, 'outside');
    const sentinelPath = path.join(outsideRoot, 'sentinel.txt');
    await mkdir(outsideRoot, { recursive: true });
    await writeFile(sentinelPath, 'keep');

    await expect(
      resetPublicRouteQaOutput(outputBase, outsideRoot)
    ).rejects.toThrow(
      'PUBLIC_ROUTE_QA_OUTPUT_DIR must stay within test-results/public-route-qa'
    );
    await expect(readFile(sentinelPath, 'utf8')).resolves.toBe('keep');
  });

  it('refuses live and dangling symlinked output roots', async () => {
    tempDirectory = await makeTempDirectory();
    const outputBase = path.join(tempDirectory, 'public-route-qa');
    const outsideRoot = path.join(tempDirectory, 'outside');
    const outsideSentinel = path.join(outsideRoot, 'sentinel.txt');
    await Promise.all([mkdir(outputBase), mkdir(outsideRoot)]);
    await writeFile(outsideSentinel, 'keep');

    const liveRoot = path.join(outputBase, 'live-run');
    await symlink(outsideRoot, liveRoot);
    await expect(
      resetPublicRouteQaOutput(outputBase, liveRoot)
    ).rejects.toThrow('refuses to replace a symlinked output root');
    await expect(readFile(outsideSentinel, 'utf8')).resolves.toBe('keep');

    const danglingRoot = path.join(outputBase, 'dangling-run');
    await symlink(path.join(tempDirectory, 'missing'), danglingRoot);
    await expect(
      resetPublicRouteQaOutput(outputBase, danglingRoot)
    ).rejects.toThrow('refuses to replace a symlinked output root');
    await expect(readFile(outsideSentinel, 'utf8')).resolves.toBe('keep');
  });

  it('unlinks child symlinks without touching their targets', async () => {
    tempDirectory = await makeTempDirectory();
    const outputBase = path.join(tempDirectory, 'public-route-qa');
    const outputRoot = path.join(outputBase, 'latest');
    const outsideRoot = path.join(tempDirectory, 'outside');
    const outsideSentinel = path.join(outsideRoot, 'sentinel.txt');
    await Promise.all([
      mkdir(outputRoot, { recursive: true }),
      mkdir(outsideRoot),
    ]);
    await writeFile(outsideSentinel, 'keep');
    await symlink(outsideRoot, path.join(outputRoot, 'outside-link'));

    await resetPublicRouteQaOutput(outputBase, outputRoot);

    await expect(readdir(outputRoot)).resolves.toEqual([]);
    await expect(readFile(outsideSentinel, 'utf8')).resolves.toBe('keep');
  });

  it('refuses nested output roots', async () => {
    tempDirectory = await makeTempDirectory();
    const outputBase = path.join(tempDirectory, 'public-route-qa');

    await expect(
      resetPublicRouteQaOutput(
        outputBase,
        path.join(outputBase, 'run', 'nested')
      )
    ).rejects.toThrow(
      'PUBLIC_ROUTE_QA_OUTPUT_DIR must stay within test-results/public-route-qa'
    );
  });
});
