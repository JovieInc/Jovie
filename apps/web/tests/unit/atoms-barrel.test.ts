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
    const exportRegex = /export \* from '\.\/([^']+)';/g;
    const exported: string[] = [];
    let match: RegExpExecArray | null;
    while ((match = exportRegex.exec(indexContent)) !== null) {
      exported.push(match[1]);
    }
    exported.sort();

    expect(exported).toEqual(expected);
  });
});
