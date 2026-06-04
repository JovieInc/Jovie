import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const appRoot = join(dirname(fileURLToPath(import.meta.url)), '../../..');
const sourcePath = join(
  appRoot,
  'components/features/dashboard/organisms/releases/cells/PopularityCell.tsx'
);

const forbiddenMotionClasses =
  /\b(?:transition-all|transition-transform|duration-\d+|active:scale|active:translate|hover:-translate|group-hover:scale)\b|\btransition-\[[^\]]*transform[^\]]*\]/;

describe('PopularityCell System B style guard', () => {
  it('keeps popularity bar changes bounded to color and width', async () => {
    const source = await readFile(sourcePath, 'utf8');

    expect(source).not.toMatch(forbiddenMotionClasses);
    expect(source).toContain('transition-[background-color,width]');
    expect(source).toContain('duration-subtle');
    expect(source).toContain('ease-subtle');
  });
});
