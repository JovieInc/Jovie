import { execFileSync } from 'node:child_process';
import {
  mkdir,
  mkdtemp,
  readFile,
  readlink,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { stageScreenshotCatalogTransfer } from './stage-screenshot-catalog-transfer';

const fixtureRoots: string[] = [];

afterEach(async () => {
  await Promise.all(
    fixtureRoots
      .splice(0)
      .map(root => rm(root, { recursive: true, force: true }))
  );
});

async function createFixture() {
  const repoRoot = await mkdtemp(join(tmpdir(), 'jovie-catalog-transfer-'));
  fixtureRoots.push(repoRoot);
  const catalog = join(repoRoot, 'apps/web/screenshot-catalog/current');
  const publicExports = join(repoRoot, 'apps/web/public/product-screenshots');
  await mkdir(catalog, { recursive: true });
  await mkdir(publicExports, { recursive: true });
  await writeFile(join(catalog, 'manifest.json'), '{}\n');
  await writeFile(join(catalog, 'homepage.png'), 'catalog-image');
  await writeFile(join(publicExports, 'copied.png'), 'public-image');
  await symlink(
    '../../screenshot-catalog/current/homepage.png',
    join(publicExports, 'homepage.png')
  );

  execFileSync('git', ['init', '-b', 'main'], { cwd: repoRoot });
  execFileSync('git', ['config', 'user.email', 'fixture@example.com'], {
    cwd: repoRoot,
  });
  execFileSync('git', ['config', 'user.name', 'Fixture'], { cwd: repoRoot });
  execFileSync('git', ['add', '.'], { cwd: repoRoot });
  execFileSync('git', ['commit', '-m', 'fixture'], { cwd: repoRoot });
  return {
    outputDirectory: join(repoRoot, '.artifacts/screenshot-catalog-transfer'),
    publicExports,
    repoRoot,
  };
}

describe('stageScreenshotCatalogTransfer', () => {
  it('copies regular catalog files while retaining verified checkout symlinks', async () => {
    const fixture = await createFixture();

    await expect(stageScreenshotCatalogTransfer(fixture)).resolves.toEqual({
      copiedFiles: 3,
      skippedTrackedSymlinks: 1,
    });
    await expect(
      readFile(
        join(
          fixture.outputDirectory,
          'apps/web/screenshot-catalog/current/homepage.png'
        ),
        'utf8'
      )
    ).resolves.toBe('catalog-image');
    await expect(
      readFile(
        join(
          fixture.outputDirectory,
          'apps/web/public/product-screenshots/copied.png'
        ),
        'utf8'
      )
    ).resolves.toBe('public-image');
    await expect(
      readlink(
        join(
          fixture.outputDirectory,
          'apps/web/public/product-screenshots/homepage.png'
        )
      )
    ).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('rejects a changed symlink instead of dereferencing it', async () => {
    const fixture = await createFixture();
    const link = join(fixture.publicExports, 'homepage.png');
    await rm(link);
    await symlink('../../screenshot-catalog/current/manifest.json', link);

    await expect(stageScreenshotCatalogTransfer(fixture)).rejects.toThrow(
      'rejects a changed symlink'
    );
  });

  it('rejects replacing a tracked symlink with a regular file', async () => {
    const fixture = await createFixture();
    const link = join(fixture.publicExports, 'homepage.png');
    await rm(link);
    await writeFile(link, 'replacement');

    await expect(stageScreenshotCatalogTransfer(fixture)).rejects.toThrow(
      'rejects replacing a tracked symlink'
    );
  });

  it('rejects an untracked symlink outside the catalog', async () => {
    const fixture = await createFixture();
    await writeFile(join(fixture.repoRoot, 'outside.png'), 'outside');
    await symlink(
      '../../../../outside.png',
      join(fixture.publicExports, 'outside.png')
    );

    await expect(stageScreenshotCatalogTransfer(fixture)).rejects.toThrow(
      'rejects non-catalog symlink'
    );
  });

  it('refuses to reset any output directory outside the fixed transfer path', async () => {
    const fixture = await createFixture();
    const sentinel = join(fixture.repoRoot, 'sentinel');
    await mkdir(sentinel);
    await writeFile(join(sentinel, 'keep.txt'), 'keep');

    await expect(
      stageScreenshotCatalogTransfer({
        ...fixture,
        outputDirectory: sentinel,
      })
    ).rejects.toThrow('output must be .artifacts/screenshot-catalog-transfer');
    await expect(readFile(join(sentinel, 'keep.txt'), 'utf8')).resolves.toBe(
      'keep'
    );
  });
});
