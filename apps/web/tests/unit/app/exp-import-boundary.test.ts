import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

const PRODUCTION_SOURCE_ROOTS = [
  'app',
  'components',
  'constants',
  'hooks',
  'lib',
] as const;

const SOURCE_FILE_PATTERN = /\.(?:ts|tsx)$/;
const EXP_APP_IMPORT_PATTERN =
  /(?:from\s+|import\s*\()\s*['"]@\/app\/exp\/|(?:from\s+|import\s*\()\s*['"](?:\.\.\/)+exp\//;

function collectSourceFiles(rootDir: string): string[] {
  const files: string[] = [];

  for (const entry of readdirSync(rootDir, { withFileTypes: true })) {
    const absolutePath = join(rootDir, entry.name);
    const repoRelativePath = relative(process.cwd(), absolutePath);

    if (entry.isDirectory()) {
      if (repoRelativePath === 'app/exp') continue;
      if (entry.name === '__snapshots__') continue;
      files.push(...collectSourceFiles(absolutePath));
      continue;
    }

    if (entry.isFile() && SOURCE_FILE_PATTERN.test(entry.name)) {
      files.push(absolutePath);
    }
  }

  return files;
}

describe('experimental app import boundary', () => {
  it('keeps production source from importing app/exp implementations directly', () => {
    const offenders = PRODUCTION_SOURCE_ROOTS.flatMap(sourceRoot =>
      collectSourceFiles(join(process.cwd(), sourceRoot))
    ).filter(filePath =>
      EXP_APP_IMPORT_PATTERN.test(readFileSync(filePath, 'utf8'))
    );

    expect(
      offenders.map(filePath => relative(process.cwd(), filePath))
    ).toEqual([]);
  });
});
