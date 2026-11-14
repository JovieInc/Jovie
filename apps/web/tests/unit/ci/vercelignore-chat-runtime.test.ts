import { readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// The root .vercelignore drops every *.md. Chat reads its topic and skill
// markdown from source at request time, so each of those files must still
// reach the Vercel upload, or useSkill fails with ENOENT in production.
const testDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(testDir, '..', '..', '..', '..', '..');
const repoRequire = createRequire(resolve(repoRoot, 'package.json'));
const vercelRequire = createRequire(repoRequire.resolve('vercel/package.json'));
const buildUtilsEntry = vercelRequire.resolve('@vercel/build-utils');
const { default: getIgnoreFilter } = createRequire(buildUtilsEntry)(
  resolve(dirname(buildUtilsEntry), 'get-ignore-filter.js')
) as {
  default: (downloadPath: string) => Promise<(filePath: string) => boolean>;
};

const CHAT_RUNTIME_DIRS = [
  'apps/web/lib/chat/knowledge/topics',
  'apps/web/lib/chat/skills/library',
];

function filesUnder(dir: string): string[] {
  return readdirSync(resolve(repoRoot, dir), {
    recursive: true,
    withFileTypes: true,
  })
    .filter(entry => entry.isFile())
    .map(entry =>
      relative(repoRoot, resolve(entry.parentPath, entry.name)).replaceAll(
        '\\',
        '/'
      )
    );
}

describe('.vercelignore keeps chat runtime markdown', () => {
  it.each(CHAT_RUNTIME_DIRS)('uploads every file under %s', async dir => {
    const isIgnored = await getIgnoreFilter(repoRoot);
    const files = filesUnder(dir);
    expect(files.some(file => file.endsWith('.md'))).toBe(true);
    for (const file of files) {
      expect(isIgnored(file), file).toBe(false);
    }
  });
});
