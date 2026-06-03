import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const forbiddenMotionClasses =
  /\b(?:transition-all|duration-\d+|active:scale|active:translate|hover:-translate|group-hover:scale)\b/;

describe('dashboard link action System B style guard', () => {
  it.each([
    [
      'LinkActions',
      'components/features/dashboard/atoms/link-actions/LinkActions.tsx',
    ],
    ['LinkPill', 'components/features/dashboard/atoms/LinkPill.tsx'],
  ])('%s does not use decorative press motion', (_name, filePath) => {
    const source = readFileSync(filePath, 'utf8');

    expect(source).not.toMatch(forbiddenMotionClasses);
  });
});
