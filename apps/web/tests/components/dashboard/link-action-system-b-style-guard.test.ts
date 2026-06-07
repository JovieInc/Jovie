import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const forbiddenMotionClasses =
  /\b(?:transition-all|transition-transform|duration-\d+|active:scale|active:translate|hover:-translate|group-hover:scale)\b|\btransition-\[[^\]]*transform[^\]]*\]/;

const linkRowSources = [
  [
    'ChatStyleLinkItem',
    'components/features/dashboard/organisms/links/ChatStyleLinkItem.tsx',
  ],
  [
    'SortableLinkItem',
    'components/features/dashboard/organisms/links/SortableLinkItem.tsx',
  ],
] as const;

const swipeActionClassSource =
  'components/features/dashboard/organisms/links/swipe-action-classes.ts';

const forbiddenNonDestructiveSwipeFillClasses =
  /\bbg-(?:blue|purple|violet|indigo)-\d|\bbg-accent\b|text-on-accent|text-accent-foreground/;

describe('dashboard link action System B style guard', () => {
  it.each([
    [
      'LinkActions',
      'components/features/dashboard/atoms/link-actions/LinkActions.tsx',
    ],
    ['LinkPill', 'components/features/dashboard/atoms/LinkPill.tsx'],
    ...linkRowSources,
  ])('%s does not use decorative press motion', (_name, filePath) => {
    const source = readFileSync(filePath, 'utf8');

    expect(source).not.toMatch(forbiddenMotionClasses);
  });

  it.each(
    linkRowSources
  )('%s consumes shared neutral swipe action classes', (_name, filePath) => {
    const source = readFileSync(filePath, 'utf8');

    expect(source).not.toMatch(forbiddenNonDestructiveSwipeFillClasses);
    expect(source).toContain('NEUTRAL_SWIPE_ACTION_CLASS');
    expect(source).toContain('DESTRUCTIVE_SWIPE_ACTION_CLASS');
  });

  it('keeps swipe edit and visibility actions neutral at the shared class source', () => {
    const source = readFileSync(swipeActionClassSource, 'utf8');

    expect(source).not.toMatch(forbiddenNonDestructiveSwipeFillClasses);
    expect(source).toContain('bg-surface-2 text-primary-token');
    expect(source).toContain('bg-red-500 text-white');
  });
});
