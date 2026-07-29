import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  buildReviewPrompt,
  classifyFinding,
  routeChangedFiles,
  sanitizeForPrompt,
} from '../../../.github/scripts/pr-visual-review.mjs';

describe('bounded PR visual review contract', () => {
  it('routes UI changes to the changed surface and always captures desktop/mobile', () => {
    expect(
      routeChangedFiles([
        'apps/web/app/(home)/page.tsx',
        'packages/ui/src/button.tsx',
        'docs/README.md',
      ])
    ).toEqual({
      shouldReview: true,
      routes: ['/', '/demo'],
      reason: 'ui-change',
    });
  });

  it('routes known profile and admin surfaces without broadening to the whole app', () => {
    expect(
      routeChangedFiles(['apps/web/app/(dynamic)/[username]/page.tsx'])
    ).toEqual({
      shouldReview: true,
      routes: ['/demo', '/demo/profile'],
      reason: 'ui-change',
    });
    expect(routeChangedFiles(['scripts/format.mjs'])).toEqual({
      shouldReview: false,
      routes: [],
      reason: 'no-ui-change',
    });
  });

  it('routes chat and shell changes through the seeded authenticated surface', () => {
    expect(
      routeChangedFiles(['apps/web/components/organisms/AppShellFrame.tsx'])
    ).toEqual({
      shouldReview: true,
      routes: ['/demo', '/app/chat'],
      reason: 'ui-change',
    });
  });

  it('keeps prompt input bounded and removes credential-shaped values', () => {
    const prompt = buildReviewPrompt({
      diff: 'const x = process.env.API_KEY;\n'.repeat(10000),
      changedFiles: ['apps/web/app/page.tsx'],
      screenshots: ['desktop/home.png', 'mobile/home.png'],
    });
    expect(prompt.length).toBeLessThan(30_000);
    expect(sanitizeForPrompt('AI_GATEWAY_API_KEY=secret-value')).toBe(
      '[redacted-secret]'
    );
    expect(prompt).not.toContain('secret-value');
  });

  it('separates objective findings from taste and never auto-fixes taste', () => {
    expect(classifyFinding({ category: 'layout', severity: 'high' })).toEqual({
      kind: 'objective',
      autoFollowUpEligible: true,
    });
    expect(classifyFinding({ category: 'taste', severity: 'high' })).toEqual({
      kind: 'subjective',
      autoFollowUpEligible: false,
    });
    expect(
      classifyFinding({ category: 'accessibility', severity: 'medium' })
    ).toEqual({
      kind: 'objective',
      autoFollowUpEligible: true,
    });
  });

  it('keeps the workflow bounded, idempotent, and artifact-retained', () => {
    const workflow = readFileSync(
      '.github/workflows/pr-visual-review.yml',
      'utf8'
    );
    expect(workflow).toContain('pull_request_target:');
    expect(workflow).toContain('cancel-in-progress: true');
    expect(workflow).toContain('retention-days: 14');
    expect(workflow).toContain('VISUAL_REVIEW_AUTOFIX_ENABLED');
    expect(workflow).toContain(
      'Existing visual review found; idempotent no-op.'
    );
    expect(workflow).toContain('Do not alter subjective/taste findings.');
  });
});
