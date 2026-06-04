import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const webRoot = path.resolve(__dirname, '../../..');
const sourcePath =
  'components/features/dashboard/organisms/LiquidGlassMenu.tsx';

const transformMotionPatterns = [
  /\bactive:scale(?:-\[[^\]]+\]|-\d+)?\b/,
  /\btransition-all\b/,
  /\btransition-transform\b/,
  /\btransition-\[[^\]]*transform[^\]]*\]/,
  /\btranslate-y-/,
  /\bscale(?:-\[[^\]]+\]|-\d{1,3})/,
];

describe('dashboard LiquidGlassMenu System B guard', () => {
  it('keeps mobile menu feedback color or opacity only', () => {
    const source = readFileSync(path.join(webRoot, sourcePath), 'utf8');
    const offenders = transformMotionPatterns
      .filter(pattern => pattern.test(source))
      .map(pattern => pattern.toString());

    expect(offenders, `${sourcePath} leaked ${offenders.join(', ')}`).toEqual(
      []
    );
    expect(source).toContain('transition-[background-color,color]');
    expect(source).toContain('transition-colors');
    expect(source).toContain('transition-opacity');
    expect(source).toContain('active:bg-surface-2');
    expect(source).toContain('active:text-primary-token');
    expect(source).toContain('min-w-[64px]');
  });
});
