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
import {
  pruneFixedOwnedOutputFiles,
  resetOwnedOutputDirectory,
  resetOwnedOutputDirectorySync,
  resetOwnedOutputFiles,
  resolveFixedOwnedOutputDirectory,
  resolveOwnedOutputDirectory,
} from './owned-output-path';

describe('owned output paths', () => {
  let tempDirectory: string | undefined;

  afterEach(async () => {
    if (tempDirectory) {
      await rm(tempDirectory, { recursive: true, force: true });
      tempDirectory = undefined;
    }
  });

  async function makeTempDirectory() {
    return mkdtemp(
      path.join(await realpath(os.tmpdir()), 'jovie-output-path-')
    );
  }

  it.each([
    'nested/run',
    '..',
    '/tmp/escaped-output',
  ])('rejects unsafe output segment %j', segment => {
    expect(() =>
      resolveOwnedOutputDirectory('/tmp/owned-output', segment, 'QA_CYCLE')
    ).toThrow('QA_CYCLE must be a single safe path segment');
  });

  it.each([
    'latest',
    'cycle-01',
    'core-profile-review-pass',
    'core.profile_review-2',
  ])('resolves valid output segment %j under the owned root', segment => {
    expect(
      resolveOwnedOutputDirectory('/tmp/owned-output', segment, 'QA_CYCLE')
    ).toBe(path.join('/tmp/owned-output', segment));
  });

  it('resets only the validated child directory', async () => {
    tempDirectory = await makeTempDirectory();
    const outputBase = path.join(tempDirectory, 'route-qa');
    const ownedRoot = path.join(outputBase, 'latest');
    const outsideRoot = path.join(tempDirectory, 'outside');
    const outsideSentinel = path.join(outsideRoot, 'sentinel.txt');
    await Promise.all([
      mkdir(ownedRoot, { recursive: true }),
      mkdir(outsideRoot, { recursive: true }),
    ]);
    await Promise.all([
      writeFile(path.join(ownedRoot, 'stale.png'), 'stale'),
      writeFile(outsideSentinel, 'keep'),
    ]);

    await expect(
      resetOwnedOutputDirectory(outputBase, 'latest', 'ROUTE_QA_OUTPUT_DIR')
    ).resolves.toBe(ownedRoot);

    await expect(readFile(path.join(ownedRoot, 'stale.png'))).rejects.toThrow();
    await expect(readFile(outsideSentinel, 'utf8')).resolves.toBe('keep');
  });

  it('rejects a configured fixed root that escapes or adds nesting', () => {
    const outputBase = '/tmp/jovie-profile-output';

    expect(() =>
      resolveFixedOwnedOutputDirectory(
        outputBase,
        'approval',
        '/tmp/outside',
        'PROFILE_LAYOUT_APPROVAL_DIR'
      )
    ).toThrow('must resolve to the fixed owned output root');
    expect(() =>
      resolveFixedOwnedOutputDirectory(
        outputBase,
        'approval',
        path.join(outputBase, 'approval/nested'),
        'PROFILE_LAYOUT_APPROVAL_DIR'
      )
    ).toThrow('must resolve to the fixed owned output root');
  });

  it('refuses to reset a symlinked owned root', async () => {
    tempDirectory = await makeTempDirectory();
    const outputBase = path.join(tempDirectory, 'profile-audit');
    const outsideRoot = path.join(tempDirectory, 'outside');
    await Promise.all([
      mkdir(outputBase, { recursive: true }),
      mkdir(outsideRoot, { recursive: true }),
    ]);
    await writeFile(path.join(outsideRoot, 'sentinel.txt'), 'keep');
    await import('node:fs/promises').then(({ symlink }) =>
      symlink(outsideRoot, path.join(outputBase, 'latest'))
    );

    await expect(
      resetOwnedOutputDirectory(outputBase, 'latest', 'PROFILE_AUDIT_CYCLE')
    ).rejects.toThrow('refuses to replace a symlinked output root');
    await expect(
      readFile(path.join(outsideRoot, 'sentinel.txt'), 'utf8')
    ).resolves.toBe('keep');
  });

  it('refuses live and dangling symlinked output bases', async () => {
    tempDirectory = await makeTempDirectory();
    const outsideRoot = path.join(tempDirectory, 'outside');
    const outsideSentinel = path.join(outsideRoot, 'sentinel.txt');
    await mkdir(outsideRoot);
    await writeFile(outsideSentinel, 'keep');

    const liveBase = path.join(tempDirectory, 'live-base');
    await symlink(outsideRoot, liveBase);
    await expect(
      resetOwnedOutputDirectory(liveBase, 'latest', 'QA_OUTPUT_DIR')
    ).rejects.toThrow('resolves outside its lexical root');

    const danglingBase = path.join(tempDirectory, 'dangling-base');
    await symlink(path.join(tempDirectory, 'missing'), danglingBase);
    await expect(
      resetOwnedOutputDirectory(danglingBase, 'latest', 'QA_OUTPUT_DIR')
    ).rejects.toThrow('resolves outside its lexical root');
    await expect(readFile(outsideSentinel, 'utf8')).resolves.toBe('keep');
  });

  it('removes child symlinks without following them', async () => {
    tempDirectory = await makeTempDirectory();
    const outputBase = path.join(tempDirectory, 'route-qa');
    const outputRoot = path.join(outputBase, 'latest');
    const outsideRoot = path.join(tempDirectory, 'outside');
    const outsideSentinel = path.join(outsideRoot, 'sentinel.txt');
    await Promise.all([
      mkdir(outputRoot, { recursive: true }),
      mkdir(outsideRoot),
    ]);
    await writeFile(outsideSentinel, 'keep');
    await symlink(outsideRoot, path.join(outputRoot, 'outside-link'));

    await resetOwnedOutputDirectory(outputBase, 'latest', 'QA_OUTPUT_DIR');

    await expect(readdir(outputRoot)).resolves.toEqual([]);
    await expect(readFile(outsideSentinel, 'utf8')).resolves.toBe('keep');
  });

  it('applies the same ownership boundary synchronously', async () => {
    tempDirectory = await makeTempDirectory();
    const outputBase = path.join(tempDirectory, 'linear-compare');
    const outputRoot = path.join(outputBase, 'dashboards');
    const outsideRoot = path.join(tempDirectory, 'outside');
    const outsideSentinel = path.join(outsideRoot, 'sentinel.txt');
    await Promise.all([
      mkdir(outputRoot, { recursive: true }),
      mkdir(outsideRoot),
    ]);
    await writeFile(outsideSentinel, 'keep');
    await symlink(outsideRoot, path.join(outputRoot, 'outside-link'));

    const resetRoot = resetOwnedOutputDirectorySync(
      outputBase,
      'dashboards',
      'LINEAR_COMPARE_OUTPUT_DIR'
    );
    await expect(realpath(resetRoot)).resolves.toBe(await realpath(outputRoot));
    await expect(readdir(outputRoot)).resolves.toEqual([]);
    await expect(readFile(outsideSentinel, 'utf8')).resolves.toBe('keep');
  });

  it('refuses async and sync output bases below an outside symlinked ancestor', async () => {
    tempDirectory = await makeTempDirectory();
    const lexicalRoot = path.join(tempDirectory, 'lexical');
    const outsideRoot = path.join(tempDirectory, 'outside');
    const outsideSentinel = path.join(outsideRoot, 'sentinel.txt');
    await Promise.all([mkdir(lexicalRoot), mkdir(outsideRoot)]);
    await writeFile(outsideSentinel, 'keep');
    await symlink(outsideRoot, path.join(lexicalRoot, 'test-results'));
    const outputBase = path.join(lexicalRoot, 'test-results', 'route-qa');

    await expect(
      resetOwnedOutputDirectory(outputBase, 'latest', 'QA_OUTPUT_DIR')
    ).rejects.toThrow('resolves outside its lexical root');
    expect(() =>
      resetOwnedOutputDirectorySync(outputBase, 'latest', 'QA_OUTPUT_DIR')
    ).toThrow('resolves outside its lexical root');
    await expect(readFile(outsideSentinel, 'utf8')).resolves.toBe('keep');
  });

  it('replaces only selected manifest-owned files', async () => {
    tempDirectory = await makeTempDirectory();
    const outputBase = path.join(tempDirectory, 'profile-review-matrix');
    const outputRoot = path.join(outputBase, 'latest');
    await mkdir(outputRoot, { recursive: true });
    await Promise.all([
      writeFile(path.join(outputRoot, 'home-mobile.png'), 'stale'),
      writeFile(path.join(outputRoot, 'home-desktop.png'), 'stale'),
      writeFile(path.join(outputRoot, 'music-mobile.png'), 'keep'),
      writeFile(path.join(outputRoot, 'summary.json'), 'stale'),
    ]);

    await resetOwnedOutputFiles(
      outputBase,
      'latest',
      'PROFILE_REVIEW_MATRIX_CYCLE',
      ['home-mobile.png', 'home-desktop.png', 'summary.json']
    );

    await expect(
      readFile(path.join(outputRoot, 'home-mobile.png'))
    ).rejects.toThrow();
    await expect(
      readFile(path.join(outputRoot, 'home-desktop.png'))
    ).rejects.toThrow();
    await expect(
      readFile(path.join(outputRoot, 'summary.json'))
    ).rejects.toThrow();
    await expect(
      readFile(path.join(outputRoot, 'music-mobile.png'), 'utf8')
    ).resolves.toBe('keep');
  });

  it('validates every selected filename before deleting any output', async () => {
    tempDirectory = await makeTempDirectory();
    const outputBase = path.join(tempDirectory, 'profile-review-matrix');
    const outputRoot = path.join(outputBase, 'latest');
    await mkdir(outputRoot, { recursive: true });
    await writeFile(path.join(outputRoot, 'home-mobile.png'), 'keep');

    await expect(
      resetOwnedOutputFiles(
        outputBase,
        'latest',
        'PROFILE_REVIEW_MATRIX_CYCLE',
        ['home-mobile.png', '../outside.png']
      )
    ).rejects.toThrow('output filename must be one safe path segment');
    await expect(
      readFile(path.join(outputRoot, 'home-mobile.png'), 'utf8')
    ).resolves.toBe('keep');
  });

  it('prunes only orphan files from the fixed root and preserves siblings', async () => {
    tempDirectory = await makeTempDirectory();
    const outputBase = path.join(tempDirectory, 'screenshot-catalog');
    const outputRoot = path.join(outputBase, 'current');
    const siblingRoot = path.join(outputBase, 'previous');
    const outsideRoot = path.join(tempDirectory, 'outside');
    const outsideSentinel = path.join(outsideRoot, 'sentinel.txt');
    await Promise.all([
      mkdir(outputRoot, { recursive: true }),
      mkdir(siblingRoot, { recursive: true }),
      mkdir(outsideRoot),
    ]);
    await Promise.all([
      writeFile(path.join(outputRoot, 'kept.png'), 'keep'),
      writeFile(path.join(outputRoot, 'orphan.png'), 'remove'),
      writeFile(path.join(siblingRoot, 'sibling.png'), 'keep'),
      writeFile(outsideSentinel, 'keep'),
    ]);
    await symlink(outsideSentinel, path.join(outputRoot, 'outside-link.png'));

    await expect(
      pruneFixedOwnedOutputFiles(
        outputBase,
        'current',
        outputRoot,
        'SCREENSHOT_CATALOG_OUTPUT_DIR',
        new Set(['kept.png'])
      )
    ).resolves.toBe(outputRoot);

    await expect(
      readFile(path.join(outputRoot, 'kept.png'), 'utf8')
    ).resolves.toBe('keep');
    await expect(
      readFile(path.join(outputRoot, 'orphan.png'))
    ).rejects.toThrow();
    await expect(
      readFile(path.join(siblingRoot, 'sibling.png'), 'utf8')
    ).resolves.toBe('keep');
    await expect(readFile(outsideSentinel, 'utf8')).resolves.toBe('keep');
    await expect(
      readFile(path.join(outputRoot, 'outside-link.png'))
    ).rejects.toThrow();
  });

  it('refuses live and dangling symlinked fixed output roots', async () => {
    tempDirectory = await makeTempDirectory();
    const outputBase = path.join(tempDirectory, 'catalog');
    const outsideRoot = path.join(tempDirectory, 'outside');
    const outsideSentinel = path.join(outsideRoot, 'sentinel.png');
    await Promise.all([mkdir(outputBase), mkdir(outsideRoot)]);
    await writeFile(outsideSentinel, 'keep');

    const liveRoot = path.join(outputBase, 'live');
    await symlink(outsideRoot, liveRoot);
    await expect(
      pruneFixedOwnedOutputFiles(
        outputBase,
        'live',
        liveRoot,
        'SCREENSHOT_OUTPUT_DIR',
        new Set()
      )
    ).rejects.toThrow('refuses to use a symlinked output root');

    const danglingRoot = path.join(outputBase, 'dangling');
    await symlink(path.join(tempDirectory, 'missing'), danglingRoot);
    await expect(
      pruneFixedOwnedOutputFiles(
        outputBase,
        'dangling',
        danglingRoot,
        'SCREENSHOT_OUTPUT_DIR',
        new Set()
      )
    ).rejects.toThrow('refuses to use a symlinked output root');
    await expect(readFile(outsideSentinel, 'utf8')).resolves.toBe('keep');
  });

  it('refuses live and dangling symlinked ancestors of a fixed output root', async () => {
    tempDirectory = await makeTempDirectory();
    const lexicalRoot = path.join(tempDirectory, 'web');
    const outsideRoot = path.join(tempDirectory, 'outside');
    const outsideSentinel = path.join(outsideRoot, 'sentinel.png');
    await Promise.all([mkdir(lexicalRoot), mkdir(outsideRoot)]);
    await writeFile(outsideSentinel, 'keep');

    const liveAncestor = path.join(lexicalRoot, 'live-public');
    await symlink(outsideRoot, liveAncestor);
    const liveBase = path.join(liveAncestor, 'screenshots');
    const liveOutput = path.join(liveBase, 'current');
    await expect(
      pruneFixedOwnedOutputFiles(
        liveBase,
        'current',
        liveOutput,
        'PUBLIC_SCREENSHOT_EXPORT_DIR',
        new Set()
      )
    ).rejects.toThrow('resolves outside its lexical root');

    const danglingAncestor = path.join(lexicalRoot, 'dangling-public');
    await symlink(path.join(tempDirectory, 'missing'), danglingAncestor);
    const danglingBase = path.join(danglingAncestor, 'screenshots');
    const danglingOutput = path.join(danglingBase, 'current');
    await expect(
      pruneFixedOwnedOutputFiles(
        danglingBase,
        'current',
        danglingOutput,
        'PUBLIC_SCREENSHOT_EXPORT_DIR',
        new Set()
      )
    ).rejects.toThrow('resolves outside its lexical root');
    await expect(readFile(outsideSentinel, 'utf8')).resolves.toBe('keep');
  });

  it('fails closed on scan errors without deleting existing files', async () => {
    tempDirectory = await makeTempDirectory();
    const outputBase = path.join(tempDirectory, 'screenshot-catalog');
    const outputRoot = path.join(outputBase, 'current');
    const orphanPath = path.join(outputRoot, 'orphan.png');
    await mkdir(outputRoot, { recursive: true });
    await writeFile(orphanPath, 'keep');

    await expect(
      pruneFixedOwnedOutputFiles(
        outputBase,
        'current',
        outputRoot,
        'SCREENSHOT_CATALOG_OUTPUT_DIR',
        new Set(),
        {
          readDirectory: async () => {
            throw new Error('fixture scan failure');
          },
        }
      )
    ).rejects.toThrow('fixture scan failure');
    await expect(readFile(orphanPath, 'utf8')).resolves.toBe('keep');
  });

  it('refuses recursive orphan cleanup and preserves its contents', async () => {
    tempDirectory = await makeTempDirectory();
    const outputBase = path.join(tempDirectory, 'screenshot-catalog');
    const outputRoot = path.join(outputBase, 'current');
    const orphanDirectory = path.join(outputRoot, 'unexpected');
    const sentinel = path.join(orphanDirectory, 'sentinel.png');
    await mkdir(orphanDirectory, { recursive: true });
    await writeFile(sentinel, 'keep');

    await expect(
      pruneFixedOwnedOutputFiles(
        outputBase,
        'current',
        outputRoot,
        'SCREENSHOT_CATALOG_OUTPUT_DIR',
        new Set()
      )
    ).rejects.toThrow('refuses to recursively remove non-file orphan');
    await expect(readFile(sentinel, 'utf8')).resolves.toBe('keep');
  });
});
