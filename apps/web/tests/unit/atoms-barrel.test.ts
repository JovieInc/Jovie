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
    // Match active exports and commented-out exclusions (client components)
    const accounted: string[] = [];
    for (const line of indexContent.split('\n')) {
      const active = line.match(/^export \* from '\.\/([^']+)';/);
      const excluded = line.match(/^\/\/\s*export \* from '\.\/([^']+)';/);
      if (active) accounted.push(active[1]);
      else if (excluded) accounted.push(excluded[1]);
    }
    accounted.sort();

    expect(accounted).toEqual(expected);
  });
});
