import { describe, expect, it } from 'vitest';
import {
  conventionalCommitType,
  evaluateTasteLabel,
  MATERIAL_UX_MARKER,
  NON_TASTE_COMMIT_TYPES,
  tasteLabelsOn,
} from '../taste-label-guard.mjs';

describe('conventionalCommitType', () => {
  it.each([
    ['chore: update product screenshots', 'chore'],
    ['fix(chat): icon-only circular scroll-to-bottom button', 'fix'],
    ['ci(guards): stop required deterministic guards re-running', 'ci'],
    ['feat(home): collapse homepage to hero', 'feat'],
    ['refactor!: drop the legacy nav', 'refactor'],
    ['chore(deps): bump next from 15.0 to 15.1', 'chore'],
    ['FIX: shout-case still parses', 'fix'],
  ])('parses %j as %j', (title, expected) => {
    expect(conventionalCommitType(title)).toBe(expected);
  });

  it.each([
    'JOV-3120: Library right rail definitive design pass',
    'Update homepage hero copy',
    'v26.6.55 feat(home): collapse hero',
    '',
  ])('returns null for non-conventional title %j', title => {
    expect(conventionalCommitType(title)).toBeNull();
  });
});

describe('tasteLabelsOn', () => {
  it('matches both label forms, case-insensitively', () => {
    expect(tasteLabelsOn(['NEEDS:TASTE'])).toEqual(['needs:taste']);
    expect(tasteLabelsOn(['needs-human-taste', 'merge-queue'])).toEqual([
      'needs-human-taste',
    ]);
    expect(tasteLabelsOn(['merge-queue'])).toEqual([]);
  });
});

describe('evaluateTasteLabel — mis-applied (acceptance: guard red-fails)', () => {
  // The owner screenshot set (2026-06-26): each of these was WRONG to gate.
  it.each([
    ['#12021 chore', 'chore: update product screenshots', 'needs-human-taste'],
    [
      '#11982 fix (restoring approved design)',
      'fix(chat): icon-only circular scroll-to-bottom button (JOV-3524)',
      'needs-human-taste',
    ],
    [
      '#12020 ci (guardrail alignment)',
      'ci(guards): stop required deterministic guards re-running on label events',
      'needs:taste',
    ],
    ['dep bump', 'chore(deps): bump next from 15.0 to 15.1', 'needs:taste'],
    ['refactor', 'refactor(api): simplify user endpoint', 'needs-human-taste'],
    ['perf', 'perf(images): downsample avatars off main thread', 'needs:taste'],
    ['deps (bare type)', 'deps: bump radix-ui', 'needs:taste'],
    ['build', 'build: tweak turbo cache key', 'needs-human-taste'],
    ['docs', 'docs: clarify ship flow', 'needs:taste'],
    ['style', 'style: run biome format', 'needs-human-taste'],
    ['revert', 'revert: feat(home) hero collapse', 'needs:taste'],
  ])('%s -> violation', (_label, title, tasteLabel) => {
    const result = evaluateTasteLabel({
      title,
      labels: [tasteLabel, 'merge-queue'],
    });
    expect(result.ok).toBe(false);
    expect(result.level).toBe('error');
    expect(result.offendingLabels).toEqual([tasteLabel]);
  });

  it('returns BOTH taste labels when both are applied (so the workflow strips both)', () => {
    const result = evaluateTasteLabel({
      title: 'chore: update product screenshots',
      labels: ['needs:taste', 'needs-human-taste', 'merge-queue'],
    });
    expect(result.ok).toBe(false);
    expect(result.offendingLabels).toEqual([
      'needs:taste',
      'needs-human-taste',
    ]);
  });
});

describe('evaluateTasteLabel — correctly retained (acceptance: legit taste KEPT)', () => {
  it('keeps taste on a material UX feat (#11988 collapse homepage to hero)', () => {
    const result = evaluateTasteLabel({
      title: 'feat(home): collapse homepage to hero + minimal footer',
      labels: ['needs-human-taste'],
    });
    expect(result.ok).toBe(true);
  });

  it('keeps taste on an untyped design-pass title (#11984 library right rail)', () => {
    const result = evaluateTasteLabel({
      title: 'JOV-3120: Library right rail definitive design pass',
      labels: ['needs:taste'],
    });
    expect(result.ok).toBe(true);
  });

  it(`keeps taste on a chore when ${MATERIAL_UX_MARKER} is present (explicit override)`, () => {
    const result = evaluateTasteLabel({
      title: 'chore: refresh marketing screenshots',
      labels: ['needs-human-taste', MATERIAL_UX_MARKER],
    });
    expect(result.ok).toBe(true);
    expect(result.offendingLabels).toEqual([]);
  });

  it('honors the ux:material override case-insensitively', () => {
    const result = evaluateTasteLabel({
      title: 'refactor!: rebuild the nav',
      labels: ['needs:taste', 'UX:Material'],
    });
    expect(result.ok).toBe(true);
    expect(result.offendingLabels).toEqual([]);
  });

  it('keeps taste on a title with no conventional-commit type (conservative)', () => {
    const result = evaluateTasteLabel({
      title: 'fix:no-space-so-not-a-conventional-prefix',
      labels: ['needs:taste'],
    });
    expect(result.ok).toBe(true);
  });

  it('passes when no taste label is present', () => {
    const result = evaluateTasteLabel({
      title: 'chore: bump deps',
      labels: ['merge-queue'],
    });
    expect(result.ok).toBe(true);
    expect(result.offendingLabels).toEqual([]);
  });
});

describe('NON_TASTE_COMMIT_TYPES', () => {
  it('covers the auto-flow types named in the directive', () => {
    for (const type of [
      'chore',
      'deps',
      'build',
      'ci',
      'fix',
      'refactor',
      'test',
    ]) {
      expect(NON_TASTE_COMMIT_TYPES.has(type)).toBe(true);
    }
  });

  it('does NOT include feat (a feat can be a material UX change)', () => {
    expect(NON_TASTE_COMMIT_TYPES.has('feat')).toBe(false);
  });
});
