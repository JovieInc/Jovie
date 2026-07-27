import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const appRoot = join(dirname(fileURLToPath(import.meta.url)), '../../..');
const sourcePath = join(appRoot, 'components/molecules/PaySelector.tsx');

const forbiddenPresetMotionClasses =
  /\b(?:transition-all|transition-transform|duration-\d+|hover:scale|hover:translate|hover:-translate|group-hover:scale|group-hover:translate|group-hover:-translate)\b|\btransition-\[[^\]]*transform[^\]]*\]/;

describe('PaySelector System B style guard', () => {
  it('keeps amount preset state changes visually stable', async () => {
    const source = await readFile(sourcePath, 'utf8');
    const presetButtonClass = source.match(
      /'flex h-23 items-center justify-center[^']+'/
    )?.[0];

    expect(presetButtonClass).toBeDefined();
    expect(presetButtonClass).not.toMatch(forbiddenPresetMotionClasses);
    expect(presetButtonClass).toContain(
      'transition-[border-color,background-color,box-shadow,color,opacity]'
    );
    expect(presetButtonClass).toContain('duration-subtle');
  });
});
