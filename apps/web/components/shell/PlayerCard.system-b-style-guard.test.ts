import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const forbiddenMotionClasses =
  /\b(?:transition-all|transition-transform|active:scale|active:translate|hover:-translate)\b/;

describe('shell player card System B style guard', () => {
  it.each([
    ['MobilePlayerCard', 'components/shell/MobilePlayerCard.tsx'],
    ['TabletPlayerCard', 'components/shell/TabletPlayerCard.tsx'],
  ])('%s does not use transform-based press motion', (_name, filePath) => {
    const source = readFileSync(filePath, 'utf8');

    expect(source).not.toMatch(forbiddenMotionClasses);
  });

  it.each([
    ['AudioBar', 'components/shell/AudioBar.tsx'],
    ['MobilePlayerCard', 'components/shell/MobilePlayerCard.tsx'],
    ['TabletPlayerCard', 'components/shell/TabletPlayerCard.tsx'],
    ['JovieOverlay', 'components/shell/JovieOverlay.tsx'],
  ])('%s keeps central audio controls neutral', (_name, filePath) => {
    const source = readFileSync(filePath, 'utf8');

    expect(source).not.toContain('bg-primary text-on-primary');
    expect(source).not.toMatch(/\bbg-(?:blue|purple|violet|indigo)-\d/);

    expect(source).toContain('bg-btn-primary');
    expect(source).toContain('text-btn-primary-foreground');
  });
});
