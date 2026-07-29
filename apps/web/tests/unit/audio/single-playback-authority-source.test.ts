import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

const webRoot = join(process.cwd());
const sourceRoots = [join(webRoot, 'app'), join(webRoot, 'components')];
const publicShareSurface =
  'components/features/library-asset-share/LibraryAssetShareSurface.tsx';

function sourceFiles(root: string): string[] {
  return readdirSync(root, { withFileTypes: true }).flatMap(entry => {
    const path = join(root, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return entry.isFile() && /\.(ts|tsx)$/.test(entry.name) ? [path] : [];
  });
}

describe('single playback authority source ratchet', () => {
  it('keeps native audio isolated to the public asset share surface', () => {
    const nativeAudioOwners = sourceRoots
      .flatMap(sourceFiles)
      .filter(file => statSync(file).isFile())
      .filter(file => readFileSync(file, 'utf8').includes('<audio'))
      .map(file => relative(webRoot, file));

    expect(nativeAudioOwners).toEqual([publicShareSurface]);
  });

  it('mounts the native public player only from no-shell share routes', () => {
    const publicRoutes = [
      'app/a/[handle]/[slug]/page.tsx',
      'app/p/[token]/page.tsx',
    ];
    const importNeedle =
      '@/components/features/library-asset-share/LibraryAssetShareSurface';

    for (const route of publicRoutes) {
      expect(readFileSync(join(webRoot, route), 'utf8')).toContain(
        importNeedle
      );
    }

    const authenticatedShellSource = readFileSync(
      join(webRoot, 'app/app/(shell)/layout.tsx'),
      'utf8'
    );
    expect(authenticatedShellSource).not.toContain(importNeedle);
  });
});
