import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

describe('atoms barrel exports', () => {
  it('matches the filesystem', () => {
    const atomsDir = path.join(process.cwd(), 'components', 'atoms');

    const files = readdirSync(atomsDir);
    const componentFiles = files
      .filter(file => file.endsWith('.tsx'))
      .filter(file => !file.endsWith('.stories.tsx'))
      .filter(file => !file.endsWith('.test.tsx'))
      .filter(file => file !== 'index.tsx');

    const expected = componentFiles
      .map(file => file.replace(/\.tsx$/, ''))
      .sort();

    const indexContent = readFileSync(path.join(atomsDir, 'index.ts'), 'utf8');
    // Style-agnostic: match any `from './Module'` pattern regardless of
    // export syntax (wildcard, named, type, multiline, commented-out)
    const moduleRe = /from '\.\/([^']+)'/g;
    const accounted = new Set<string>();
    for (const match of indexContent.matchAll(moduleRe)) {
      accounted.add(match[1]);
    }
    const sorted = [...accounted].sort();

    expect(sorted).toEqual(expected);
  });
});
