import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  assertPublicLfsFiles,
  findLfsPointers,
  isLfsPointerFile,
} from './assert-public-lfs-files.mjs';

const POINTER =
  'version https://git-lfs.github.com/spec/v1\noid sha256:' +
  'a'.repeat(64) +
  '\nsize 12345\n';

const roots: string[] = [];
function fixture() {
  const root = mkdtempSync(path.join(tmpdir(), 'public-lfs-'));
  roots.push(root);
  const catalog = path.join(root, 'catalog');
  const publicDir = path.join(root, 'public');
  mkdirSync(catalog);
  mkdirSync(path.join(publicDir, 'product-screenshots'), { recursive: true });
  writeFileSync(path.join(catalog, 'pointer.png'), POINTER);
  writeFileSync(path.join(catalog, 'real.png'), Buffer.from([137, 80, 78, 71]));
  symlinkSync(
    path.join(catalog, 'pointer.png'),
    path.join(publicDir, 'product-screenshots', 'linked.png')
  );
  symlinkSync(
    path.join(catalog, 'real.png'),
    path.join(publicDir, 'product-screenshots', 'real.png')
  );
  writeFileSync(path.join(publicDir, 'direct.png'), POINTER);
  writeFileSync(path.join(publicDir, 'robots.txt'), 'User-agent: *\n');
  return { publicDir, catalog };
}

afterEach(() => {
  for (const root of roots.splice(0))
    rmSync(root, { recursive: true, force: true });
  vi.restoreAllMocks();
});

describe('assert-public-lfs-files', () => {
  it('detects pointer files, including ones reached through symlinks', () => {
    const { publicDir, catalog } = fixture();
    expect(isLfsPointerFile(path.join(catalog, 'pointer.png'))).toBe(true);
    expect(isLfsPointerFile(path.join(catalog, 'real.png'))).toBe(false);
    expect(findLfsPointers(publicDir)).toEqual([
      'direct.png',
      path.join('product-screenshots', 'linked.png'),
    ]);
  });

  it('fails a CI build and only warns locally or on Vercel', () => {
    const { publicDir } = fixture();
    expect(() =>
      assertPublicLfsFiles({ publicDir, ci: 'true', vercel: '' })
    ).toThrow(/2 file\(s\) .* are Git LFS pointers/);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    // An undefined option falls back to process.env, which is CI=true in CI.
    expect(
      assertPublicLfsFiles({ publicDir, ci: '', vercel: '' })
    ).toHaveLength(2);
    expect(
      assertPublicLfsFiles({ publicDir, ci: '1', vercel: '1' })
    ).toHaveLength(2);
    expect(warn).toHaveBeenCalledTimes(2);
  });

  it('passes a public tree with no pointers', () => {
    const { publicDir } = fixture();
    rmSync(path.join(publicDir, 'direct.png'));
    rmSync(path.join(publicDir, 'product-screenshots', 'linked.png'));
    expect(assertPublicLfsFiles({ publicDir, ci: 'true' })).toEqual([]);
  });
});
