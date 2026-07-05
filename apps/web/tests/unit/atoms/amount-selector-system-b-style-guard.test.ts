import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const appRoot = join(dirname(fileURLToPath(import.meta.url)), '../../..');
const sourcePath = join(appRoot, 'components/atoms/AmountSelector.tsx');

const forbiddenMotionClasses =
  /\b(?:transition-all|transition-transform|duration-\d+|hover:scale|hover:translate|hover:-translate|group-hover:scale|group-hover:translate|group-hover:-translate)\b|\btransition-\[[^\]]*transform[^\]]*\]/;

describe('AmountSelector System B style guard', () => {
  it('keeps amount state changes visually stable', async () => {
    const source = await readFile(sourcePath, 'utf8');

    expect(source).not.toMatch(forbiddenMotionClasses);
    expect(source).toContain(
      'transition-[background-color,border-color,box-shadow,color,opacity]'
    );
    expect(source).toContain('duration-subtle');
    expect(source).toContain('ease-subtle');
    expect(source).toContain('aspect-square');
  });
});
