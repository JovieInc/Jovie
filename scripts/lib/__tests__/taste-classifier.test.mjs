import { describe, expect, it } from 'vitest';
import { classifyTaste } from '../../taste-classifier.mjs';

// Regression tests for the JOV-3808 taste-label loop (PR #12688): the
// classifier reverted human unlabels, treated its own output label as a force
// signal, and gated fix-typed PRs that policy says auto-flow.

const TASTE_FILES = [
  'apps/web/app/(marketing)/pricing/page.tsx',
  'apps/web/styles/globals.css',
];

describe('classifyTaste — terminal human approval', () => {
  it('never re-gates a PR carrying taste-approved, even a taste-heavy feat', () => {
    const result = classifyTaste({
      title: 'feat(home): new hero composition',
      files: TASTE_FILES,
      labels: ['taste-approved', 'ui'],
    });
    expect(result.classification).toBe('auto-ship');
    expect(result.signals).toContain('label:taste-approved');
  });
});

describe('classifyTaste — non-taste commit types auto-flow', () => {
  it('classifies a fix-typed PR with taste-scoring files as llm-reviewable (the PR #12688 case)', () => {
    const result = classifyTaste({
      title: 'fix(dashboard): eliminate UI jank in chat panels',
      files: TASTE_FILES,
      labels: [],
    });
    expect(result.classification).toBe('llm-reviewable');
    expect(result.signals).toContain('commit-type:fix');
  });

  it('still gates a fix-typed PR when the ux:material marker is present', () => {
    const result = classifyTaste({
      title: 'fix(home): rework hero visual hierarchy',
      files: TASTE_FILES,
      labels: ['ux:material'],
    });
    expect(result.classification).toBe('taste-required');
  });

  it('does not treat a stale needs-human-taste label as a force signal', () => {
    const result = classifyTaste({
      title: 'fix(chat): guard null session cookie',
      files: ['apps/web/lib/chat/session.ts'],
      labels: ['needs-human-taste'],
    });
    expect(result.classification).not.toBe('taste-required');
  });
});

describe('classifyTaste — the gate still gates', () => {
  it('keeps taste-required for a feat touching marketing surfaces', () => {
    const result = classifyTaste({
      title: 'feat(marketing): redesign pricing page',
      files: TASTE_FILES,
      labels: [],
    });
    expect(result.classification).toBe('taste-required');
  });

  it('human force labels still win on non-exempt commit types', () => {
    const result = classifyTaste({
      title: 'feat(profile): new listen panel',
      files: ['apps/web/lib/profile/panel.ts'],
      labels: ['design'],
    });
    expect(result.classification).toBe('taste-required');
  });
});
