import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const testDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(testDir, '..', '..', '..', '..', '..');

function readVercelFunctions(relativePath: string): Record<string, unknown> {
  const configPath = resolve(repoRoot, relativePath);
  const config = JSON.parse(readFileSync(configPath, 'utf8')) as {
    functions?: Record<string, unknown>;
  };

  return config.functions ?? {};
}

describe('Vercel function config', () => {
  it('uses App Router function globs that Vercel can match', () => {
    const configs = ['vercel.json', 'apps/web/vercel.json'];

    for (const configPath of configs) {
      const functionGlobs = Object.keys(readVercelFunctions(configPath));

      expect(functionGlobs.length, `${configPath} functions`).toBeGreaterThan(
        0
      );
      expect(functionGlobs, configPath).not.toContain('app/api/**/*.ts');
      expect(functionGlobs, configPath).not.toContain(
        'apps/web/app/api/**/*.ts'
      );
      expect(
        functionGlobs.every(
          glob => /(^|\/)app\/api\//.test(glob) && glob.endsWith('/**/*')
        ),
        configPath
      ).toBe(true);
    }
  });
});
