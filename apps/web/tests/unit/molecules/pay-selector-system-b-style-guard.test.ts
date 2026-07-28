import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const appRoot = join(dirname(fileURLToPath(import.meta.url)), '../../..');
const sourcePath = join(appRoot, 'components/atoms/AmountSelector.tsx');

const forbiddenPresetMotionClasses =
  /\b(?:transition-all|transition-transform|duration-\d+|hover:scale|hover:translate|hover:-translate|group-hover:scale|group-hover:translate|group-hover:-translate)\b|\btransition-\[[^\]]*transform[^\]]*\]/;

describe('PaySelector System B style guard', () => {
  it('keeps amount preset state changes visually stable', async () => {
    const source = await readFile(sourcePath, 'utf8');
    expect(source).not.toMatch(forbiddenPresetMotionClasses);
    expect(source).toContain('data-selected');
    expect(source).toContain('rounded-full');
    expect(source).toContain('duration-subtle');
  });
});
