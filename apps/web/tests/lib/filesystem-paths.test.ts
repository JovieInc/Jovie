import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  resolveAppContentPath,
  resolveAppWebRoot,
  resolveMonorepoRoot,
} from '@/lib/filesystem-paths';

describe('filesystem-paths', () => {
  it('resolves the app root from a monorepo cwd', () => {
    const cwd = '/workspace/jovie';
    const existingPaths = new Set([
      path.join(cwd, 'turbo.json'),
      path.join(cwd, 'apps', 'web', 'package.json'),
      path.join(cwd, 'apps', 'web', 'content'),
    ]);

    const exists = (candidatePath: string): boolean =>
      existingPaths.has(path.resolve(candidatePath));

    expect(resolveAppWebRoot(cwd, exists)).toBe(path.join(cwd, 'apps', 'web'));
    expect(resolveMonorepoRoot(cwd, exists)).toBe(cwd);
  });

  it('resolves the app root when the cwd is already the app workspace', () => {
    const cwd = '/workspace/jovie/apps/web';
    const existingPaths = new Set([
      path.join(cwd, 'package.json'),
      path.join(cwd, 'content'),
    ]);

    const exists = (candidatePath: string): boolean =>
      existingPaths.has(path.resolve(candidatePath));

    expect(resolveAppWebRoot(cwd, exists)).toBe(cwd);
    expect(resolveMonorepoRoot(cwd, exists)).toBe(cwd);
  });

  it('resolves legal content inside the app content root', () => {
    expect(resolveAppContentPath('legal/cookies.md')).toMatch(
      /apps\/web\/content\/legal\/cookies\.md$/
    );
  });

  it('falls back safely when existsSync is unavailable', () => {
    expect(resolveAppWebRoot('/workspace/jovie', undefined)).toMatch(
      /apps\/web$/
    );
  });
});
