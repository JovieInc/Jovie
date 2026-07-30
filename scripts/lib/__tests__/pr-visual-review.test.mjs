import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  buildReviewPrompt,
  classifyFinding,
  classifyReviewOutcome,
  reviewWithConfiguredBackends,
  routeChangedFiles,
  sanitizeForPrompt,
  validateCaptureManifest,
  visualReviewIdentity,
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
      routes: ['/', '/demo', '/app/chat'],
      reason: 'ui-change',
      review_status: 'advisory',
    });
  });

  it('routes known profile and admin surfaces without broadening to the whole app', () => {
    expect(
      routeChangedFiles(['apps/web/app/(dynamic)/[username]/page.tsx'])
    ).toEqual({
      shouldReview: true,
      routes: ['/demo', '/app/chat', '/demo/profile'],
      reason: 'ui-change',
      review_status: 'advisory',
    });
    expect(routeChangedFiles(['scripts/format.mjs'])).toEqual({
      shouldReview: false,
      routes: [],
      reason: 'no-ui-change',
      review_status: 'skipped',
    });
  });

  it('classifies unavailable evidence and model output as successful advisory states', () => {
    expect(classifyReviewOutcome({ shouldReview: false })).toBe('skipped');
    expect(
      classifyReviewOutcome({ shouldReview: true, mergeBaseAvailable: false })
    ).toBe('unavailable');
    expect(
      classifyReviewOutcome({ shouldReview: true, backendAvailable: false })
    ).toBe('unavailable');
    expect(classifyReviewOutcome({ shouldReview: true, timedOut: true })).toBe(
      'unavailable'
    );
    expect(classifyReviewOutcome({ shouldReview: true })).toBe('advisory');
  });

  it('routes chat and shell changes through the seeded authenticated surface', () => {
    expect(
      routeChangedFiles(['apps/web/components/organisms/AppShellFrame.tsx'])
    ).toEqual({
      shouldReview: true,
      routes: ['/demo', '/app/chat'],
      reason: 'ui-change',
      review_status: 'advisory',
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
    expect(prompt).toContain('grok-4.5|codex');
    expect(prompt.toLowerCase()).not.toContain('kimi');
  });

  it('requires every requested route and viewport in a capture manifest', () => {
    const complete = validateCaptureManifest({
      routes: ['/app/chat'],
      viewports: { desktop: {}, mobile: {} },
      captures: [
        {
          route: '/app/chat',
          viewport: 'desktop',
          status: 'captured',
          path: 'chat-desktop.png',
        },
        {
          route: '/app/chat',
          viewport: 'mobile',
          status: 'captured',
          path: 'chat-mobile.png',
        },
      ],
    });
    expect(complete).toEqual({ ok: true, failures: [] });

    const incomplete = validateCaptureManifest({
      routes: ['/app/chat'],
      viewports: { desktop: {}, mobile: {} },
      captures: [
        {
          route: '/app/chat',
          viewport: 'desktop',
          status: 'captured',
          path: 'chat-desktop.png',
        },
      ],
    });
    expect(incomplete.ok).toBe(false);
    expect(incomplete.failures).toContain('missing capture /app/chat::mobile');
  });

  it('keys visual review idempotency to the exact PR, head, and run', () => {
    expect(
      visualReviewIdentity({
        prNumber: '15199',
        headSha: 'a'.repeat(40),
        runId: '12345',
      })
    ).toBe(
      '<!-- visual-review:pr=15199;head=' + 'a'.repeat(40) + ';run=12345 -->'
    );
    expect(() =>
      visualReviewIdentity({ prNumber: '15199', headSha: 'short', runId: '1' })
    ).toThrow('40-character head SHA');
  });

  it('uses Grok 4.5 first and independently falls back to Codex', async () => {
    const calls = [];
    const fetchImpl = async url => {
      calls.push(url);
      if (String(url).startsWith('https://grok.example'))
        return new Response(null, { status: 503 });
      return new Response(
        JSON.stringify({
          choices: [{ message: { content: '{"summary":"ok","findings":[]}' } }],
        }),
        { status: 200 }
      );
    };
    const result = await reviewWithConfiguredBackends({
      prompt: 'review',
      images: [],
      fetchImpl,
      grok: {
        apiKey: 'grok-key',
        baseUrl: 'https://grok.example/v1',
        model: 'grok-4.5',
      },
      codex: {
        apiKey: 'codex-key',
        baseUrl: 'https://codex.example/v1',
        model: 'gpt-5.2-codex',
      },
    });
    expect(result.provider).toBe('codex');
    expect(result.review.backend).toBe('codex');
    expect(calls).toEqual([
      'https://grok.example/v1/chat/completions',
      'https://codex.example/v1/chat/completions',
    ]);
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
    expect(workflow).toContain('Do not alter subjective/taste findings.');
    expect(workflow).toContain('review_status');
    expect(workflow).toContain(
      'Capture changed UI (desktop + mobile) (advisory)'
    );
    expect(workflow).toContain('GROK_VISUAL_REVIEW_API_KEY');
    expect(workflow).toContain('CODEX_VISUAL_REVIEW_API_KEY');
    expect(workflow).toContain('Call Grok 4.5 with Codex fallback');
    expect(workflow).not.toContain('Kimi');
    expect(workflow).toContain("'unavailable'");
    expect(workflow).toContain("'skipped'");
    expect(workflow).not.toContain('pr-visual-review-capture.mjs || true');
    expect(workflow).toContain('PR_HEAD_SHA');
    expect(workflow).toContain('visualReviewIdentity');
    expect(workflow).toContain('--paginate --slurp');
    expect(workflow).toContain(
      'Exact visual review already exists; idempotent no-op.'
    );
    expect(workflow).not.toContain('requested_reviewers');
  });

  it('fails visual capture closed on runtime console, page, and server errors', () => {
    const capture = readFileSync(
      '.github/scripts/pr-visual-review-capture.mjs',
      'utf8'
    );
    expect(capture).toContain("message.type() === 'error'");
    expect(capture).toContain("type: 'page-error'");
    expect(capture).toContain('response.status() >= 500');
    expect(capture).toContain('Captured route emitted runtime failures');
    expect(capture).toContain('validateCaptureManifest');
    expect(capture).toContain('capture-validation.json');
  });
});
