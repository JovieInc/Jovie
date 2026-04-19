import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = process.cwd();
const APP_ROOT = join(ROOT, 'app');
const DEMO_APP_ROOT = join(APP_ROOT, 'demo');
const DEMO_FEATURE_ROOT = join(ROOT, 'components/features/demo');

function getFilesRecursively(directory: string): string[] {
  const files: string[] = [];

  for (const entry of readdirSync(directory)) {
    const absolutePath = join(directory, entry);
    const stats = statSync(absolutePath);

    if (stats.isDirectory()) {
      files.push(...getFilesRecursively(absolutePath));
      continue;
    }

    if (absolutePath.endsWith('.ts') || absolutePath.endsWith('.tsx')) {
      files.push(absolutePath);
    }
  }

  return files;
}

describe('demo surface boundaries', () => {
  it('keeps live app and marketing routes free of demo UI imports', () => {
    const offenders = getFilesRecursively(APP_ROOT)
      .filter(file => !file.startsWith(DEMO_APP_ROOT))
      .filter(
        file => !file.endsWith(join('(marketing)', 'demo', 'video', 'page.tsx'))
      )
      .filter(file => readFileSync(file, 'utf8').includes('@/features/demo/'))
      .map(file => relative(ROOT, file));

    expect(offenders).toEqual([]);
  });

  it('keeps /demo routes and demo feature wrappers free of home demo imports', () => {
    const offenders = [
      ...getFilesRecursively(DEMO_APP_ROOT),
      ...getFilesRecursively(DEMO_FEATURE_ROOT),
    ]
      .filter(file =>
        readFileSync(file, 'utf8').includes('@/features/home/demo/')
      )
      .map(file => relative(ROOT, file));

    expect(offenders).toEqual([]);
  });
});
