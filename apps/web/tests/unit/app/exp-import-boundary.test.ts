import { spawnSync } from 'node:child_process';
import {
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
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

function findOffenders(files: string[]): string[] {
  const offenders: string[] = [];
  // Keep the exact file inventory; batch explicit paths to stay below ARG_MAX.
  // Rust's Unicode whitespace excludes BOM, which ECMAScript treats as space.
  const pattern = EXP_APP_IMPORT_PATTERN.source.replaceAll(
    '\\s',
    '(?:\\s|\\x{feff})'
  );
  for (let offset = 0; offset < files.length; offset += 128) {
    const batch = files.slice(offset, offset + 128);
    const result = spawnSync(
      'rg',
      [
        '--no-config',
        '--text',
        '--no-ignore',
        '--multiline',
        '--files-with-matches',
        '--null',
        '--regexp',
        pattern,
        '--',
        ...batch,
      ],
      { encoding: 'utf8' }
    );
    if (
      result.error &&
      'code' in result.error &&
      result.error.code === 'ENOENT'
    ) {
      offenders.push(
        ...batch.filter(file =>
          EXP_APP_IMPORT_PATTERN.test(readFileSync(file, 'utf8'))
        )
      );
      continue;
    }
    if (result.error || (result.status !== 0 && result.status !== 1)) {
      throw result.error ?? new Error(result.stderr || 'Import scan failed');
    }
    offenders.push(...result.stdout.split('\0').filter(Boolean));
  }
  return offenders;
}

describe('experimental app import boundary', () => {
  it('detects static, dynamic, relative and multiline imports including BOM whitespace', () => {
    const directory = mkdtempSync(join(tmpdir(), 'jovie-exp-boundary-'));
    try {
      const sources = [
        "import { x } from '@/app/exp/private';",
        "const x = import('../exp/private');",
        "export { x } from\n'@/app/exp/private';",
        "const x = import(\ufeff'@/app/exp/private');",
        "\0import { x } from '@/app/exp/private';",
        "import { x } from '@/constants/safe';",
      ];
      const files = sources.map((source, index) => {
        const file = join(directory, `${index}.ts`);
        writeFileSync(file, source);
        return file;
      });
      expect(findOffenders(files).sort()).toEqual(files.slice(0, 5));
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it('keeps production source from importing app/exp implementations directly', () => {
    const offenders = findOffenders(
      PRODUCTION_SOURCE_ROOTS.flatMap(sourceRoot =>
        collectSourceFiles(join(process.cwd(), sourceRoot))
      )
    );

    expect(
      offenders.map(filePath => relative(process.cwd(), filePath))
    ).toEqual([]);
  });
});
