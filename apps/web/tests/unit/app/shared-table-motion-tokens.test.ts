import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

function findRoot(...candidates: string[]): string {
  const found = candidates.find(candidate => existsSync(candidate));
  if (!found) {
    throw new Error(`Could not find source root. Checked: ${candidates}`);
  }
  return found;
}

function listSourceFiles(root: string): string[] {
  const entries = readdirSync(root);
  const files: string[] = [];

  for (const entry of entries) {
    const path = join(root, entry);
    const stat = statSync(path);
    if (stat.isDirectory()) {
      files.push(...listSourceFiles(path));
      continue;
    }
    if (/\.(ts|tsx)$/.test(entry)) {
      files.push(path);
    }
  }

  return files;
}

const TABLE_ROOTS = [
  findRoot(
    resolve(process.cwd(), 'components/organisms/table'),
    resolve(process.cwd(), 'apps/web/components/organisms/table')
  ),
  findRoot(
    resolve(process.cwd(), 'components/features/admin/table'),
    resolve(process.cwd(), 'apps/web/components/features/admin/table')
  ),
];

describe('shared table motion tokens', () => {
  it('uses named shell duration tokens in table primitives', () => {
    const offenders = TABLE_ROOTS.flatMap(root =>
      listSourceFiles(root).flatMap(file => {
        const source = readFileSync(file, 'utf8');
        return source.match(/\bduration-(?:100|150|200|300)\b/)
          ? [file.replace(process.cwd(), '')]
          : [];
      })
    );

    expect(offenders).toEqual([]);
  });
});
