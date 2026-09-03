import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { evaluateVisualEvidence } from '../../../.github/scripts/pr-visual-evidence-gate.mjs';
import {
  blockingCaptureRuntimeFailures,
  buildReviewPrompt,
  classifyFinding,
  classifyReviewOutcome,
  inspectReviewBackendConfiguration,
  isBlockingCaptureRuntimeFailure,
  normalizeBackendReview,
  readTrustedCapture,
  reviewWithConfiguredBackends,
  routeChangedFiles,
  sanitizeForPrompt,
  validateCaptureManifest,
  visualReviewIdentity,
} from '../../../.github/scripts/pr-visual-review.mjs';
import {
  buildSonarQualityDebtReceipt,
  buildVisualConfigurationIncident,
} from '../ci-remediation-receipts.mjs';
import {
  SONAR_CHECK_APP_SLUG,
  SONAR_CHECK_NAME,
  selectLatestFailingSonarCheck,
} from '../sonar-check-selection.mjs';

describe('bounded PR visual review contract', () => {
  it('routes UI changes only to deterministic public surfaces', () => {
    expect(
      routeChangedFiles([
        'apps/web/app/(home)/page.tsx',
        'packages/ui/src/button.tsx',
        'docs/README.md',
      ])
    ).toEqual({
      shouldReview: true,
      routes: ['/'],
      reason: 'ui-change',
      review_status: 'advisory',
    });
  });

  it('routes known profiles to the real fixture and never invents demo routes', () => {
    expect(
      routeChangedFiles(['apps/web/app/(dynamic)/[username]/page.tsx'])
    ).toEqual({
      shouldReview: true,
      routes: ['/demo/showcase/public-profile'],
      reason: 'ui-change',
      review_status: 'advisory',
    });
    expect(routeChangedFiles(['apps/web/app/(admin)/page.tsx']).routes).toEqual(
      ['/']
    );
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
      routes: ['/app/chat'],
      reason: 'ui-change',
      review_status: 'advisory',
    });
    expect(
      routeChangedFiles(['apps/web/components/jovie/JovieChat.tsx']).routes
    ).toEqual(['/app/chat']);
    expect(
      routeChangedFiles(['apps/web/app/app/(shell)/chat/page.tsx']).routes
    ).toEqual(['/app/chat']);
  });

  it('does not send API, server, or onboarding chat files to /app/chat', () => {
    expect(
      routeChangedFiles([
        'apps/web/app/api/chat/route.ts',
        'apps/web/app/api/chat/onboarding-handler.ts',
        'apps/web/lib/chat/run.ts',
        'apps/web/lib/mobile/chat/turn-handler.ts',
        'apps/web/lib/ai/gateway-errors.ts',
        'apps/web/components/features/onboarding/onboardingChatHelpers.ts',
        'apps/web/components/jovie/utils.ts',
      ])
    ).toEqual({
      shouldReview: true,
      routes: ['/'],
      reason: 'ui-change',
      review_status: 'advisory',
    });
  });

  it('does not treat App Router (shell) catalog pages as chat chrome', () => {
    expect(
      routeChangedFiles(['apps/web/app/app/(shell)/library/page.tsx']).routes
    ).toEqual(['/']);
  });

  it('routes the authenticated session boundary through chat instead of masking it with a public capture', () => {
    expect(
      routeChangedFiles([
        'apps/web/lib/auth/gate.ts',
        'apps/web/lib/auth/session.ts',
        'apps/web/lib/auth/auth-session-cookies.ts',
        'apps/web/proxy.ts',
        'apps/web/app/app/layout.tsx',
        'apps/web/app/app/(shell)/layout.tsx',
      ])
    ).toEqual({
      shouldReview: true,
      routes: ['/app/chat'],
      reason: 'ui-change',
      review_status: 'advisory',
    });
  });

  it('validates authenticated capture handoff before loading an app route', () => {
    const capture = readFileSync(
      '.github/scripts/pr-visual-review-capture.mjs',
      'utf8'
    );
    expect(capture).toContain('context.request.get(');
    expect(capture).toContain('authEntryUrl.toString()');
    expect(capture).toContain('maxRedirects: 0');
    expect(capture).toContain('Test-auth returned HTTP');
    expect(capture).toContain(
      'Test-auth 303 did not include a redirect location.'
    );
    expect(capture).toContain('Test-auth handoff ended at');
  });

  it('uses the canonical test-auth environment in the capture workflow', () => {
    const workflow = readFileSync(
      '.github/workflows/pr-visual-review.yml',
      'utf8'
    );
    expect(workflow).toContain('VERCEL_ENV: development');
    expect(workflow).toContain("NEXT_PUBLIC_E2E_MODE: '1'");
    expect(workflow).toContain('E2E_TEST_AUTH_PERSONA: creator-ready');
    expect(workflow).toContain('HOSTNAME=localhost');
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

    const incomplete = validateCaptureManifest(
      {
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
      },
      { routes: ['/app/chat'], viewportNames: ['desktop', 'mobile'] }
    );
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
      if (String(url).startsWith('https://api.x.ai'))
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
        baseUrl: 'https://api.x.ai/v1',
        model: 'grok-4.5',
      },
      codex: {
        apiKey: 'codex-key',
        baseUrl: 'https://api.openai.com/v1',
        model: 'gpt-5.2-codex',
      },
    });
    expect(result.provider).toBe('codex');
    expect(result.review.backend).toBe('codex');
    expect(calls).toEqual([
      'https://api.x.ai/v1/chat/completions',
      'https://api.openai.com/v1/chat/completions',
    ]);
  });

  it('rejects redirected backend origins and neutralizes untrusted model markup', () => {
    const configuration = inspectReviewBackendConfiguration({
      grok: {
        apiKey: 'grok-key',
        baseUrl: 'https://attacker.example/v1',
        model: 'grok-4.5',
      },
      codex: {
        apiKey: 'codex-key',
        baseUrl: 'https://api.openai.com/v1?redirect=attacker',
        model: 'gpt-5.2-codex',
      },
    });
    expect(configuration).toEqual({
      configured: false,
      errors: [
        'backend_unconfigured: GROK_VISUAL_REVIEW_BASE_URL is not an approved provider endpoint',
        'backend_unconfigured: CODEX_VISUAL_REVIEW_BASE_URL is not an approved provider endpoint',
      ],
    });
    const review = normalizeBackendReview({
      summary: '## Trusted\n@everyone <!-- marker -->',
      findings: [
        {
          title: '[click](https://attacker.example)',
          category: 'FUNCTIONAL',
          severity: 'HIGH',
          evidence: '<script>alert(1)</script>',
          recommendation: '@admin merge now',
        },
      ],
    });
    expect(review).toMatchObject({
      findings: [{ category: 'functional', severity: 'high' }],
    });
    expect(review.summary).not.toContain('@everyone');
    expect(review.findings[0].title).not.toContain('[click](');
  });
  it('reads only bounded PNG captures from the downloaded artifact directory', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'visual-artifact-'));
    const outside = await mkdtemp(join(tmpdir(), 'visual-outside-'));
    const capture = join(directory, 'capture.png');
    const outsideFile = join(outside, 'outside.png');
    const png = Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      Buffer.from('bounded-test-payload'),
    ]);
    try {
      await writeFile(capture, png);
      await writeFile(outsideFile, png);
      await expect(
        readTrustedCapture(directory, 'capture.png')
      ).resolves.toEqual(png);
      await symlink(outsideFile, join(directory, 'escape.png'));
      await expect(readTrustedCapture(directory, 'escape.png')).rejects.toThrow(
        'escapes downloaded artifact directory'
      );
      await writeFile(capture, 'not-png');
      await expect(readTrustedCapture(directory, capture)).rejects.toThrow(
        'not a PNG'
      );
    } finally {
      await rm(directory, { recursive: true, force: true });
      await rm(outside, { recursive: true, force: true });
    }
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
    expect(workflow).not.toContain('VISUAL_REVIEW_AUTOFIX_ENABLED');
    expect(workflow).not.toContain('gh issue create');
    expect(workflow).not.toContain('gh issue list');
    expect(workflow).not.toContain('github-ai-orchestrator.yml');
    expect(workflow).toContain('review_status');
    expect(workflow).toContain('Capture changed UI (desktop + mobile)');
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
    expect(workflow).toContain('| jq -r --arg marker "$MARKER"');
    expect(workflow).toContain('contains($marker)');
    expect(workflow).not.toContain('--jq --arg marker');
    expect(workflow).not.toContain(
      '--slurp "repos/${GITHUB_REPOSITORY}/pulls/${PR_NUMBER}/reviews?per_page=100" --jq'
    );
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
    expect(capture).toContain('blockingCaptureRuntimeFailures');
    expect(capture).toContain('validateCaptureManifest');
    expect(capture).toContain('capture-validation.json');
  });

  it('keeps secretless authenticated API and same-document 5xxs from failing New Chat capture', () => {
    const context = {
      route: '/app/chat',
      baseUrl: 'http://127.0.0.1:3100',
    };
    const noise = [
      {
        type: 'http-5xx',
        status: 503,
        url: 'http://127.0.0.1:3100/api/analytics/navigation',
      },
      {
        type: 'console-error',
        message:
          'Failed to load resource: the server responded with a status of 503 (Service Unavailable)',
      },
      {
        type: 'http-5xx',
        status: 500,
        url: 'http://127.0.0.1:3100/app/chat',
      },
    ];
    expect(blockingCaptureRuntimeFailures(noise, context)).toEqual([]);
    expect(
      isBlockingCaptureRuntimeFailure(
        { type: 'page-error', message: 'boom' },
        context
      )
    ).toBe(true);
    expect(
      isBlockingCaptureRuntimeFailure(
        {
          type: 'http-5xx',
          status: 500,
          url: 'http://127.0.0.1:3100/signin',
        },
        context
      )
    ).toBe(true);
    expect(
      isBlockingCaptureRuntimeFailure(
        {
          type: 'http-5xx',
          status: 500,
          url: 'http://127.0.0.1:3100/api/billing/status',
        },
        { route: '/', baseUrl: context.baseUrl }
      )
    ).toBe(true);
    expect(
      isBlockingCaptureRuntimeFailure(
        { type: 'console-error', message: 'Uncaught TypeError: exploded' },
        context
      )
    ).toBe(true);
  });

  it('waits for the loaded authenticated New Chat shell instead of the streaming fallback', () => {
    const capture = readFileSync(
      '.github/scripts/pr-visual-review-capture.mjs',
      'utf8'
    );
    expect(capture).toContain('waitForAuthenticatedShell');
    expect(capture).toContain('[data-testid="dashboard-header"]');
    expect(capture).toContain('[data-testid="dashboard-error"]');
    expect(capture).toContain('filter({ visible: true })');
    expect(capture).toContain('.first().waitFor');
    expect(capture).not.toContain('.or(visibleDashboardError)');
    expect(capture).toContain(
      'Captured app route rendered dashboard error UI instead of authenticated shell'
    );
    expect(capture).toContain(
      "getByRole('heading', { name: 'New Chat', level: 1 })"
    );
    expect(capture).toContain("getByRole('heading', { name: 'Just ask' })");
    expect(capture).toContain("getByTestId('chat-empty-state-greeting')");
    expect(capture).toContain("'domcontentloaded'");
  });
});

// JOV-5459 (Tim lock 2026-08-30): Visual ENOENT is FAIL, not advisory.
describe('fail-closed visual evidence gate (JOV-5459)', () => {
  it('treats a missing capture manifest (ENOENT) as failure, not advisory skip', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'visual-gate-'));
    try {
      await writeFile(
        join(dir, 'routing.json'),
        JSON.stringify({ shouldReview: true })
      );
      const result = evaluateVisualEvidence({
        artifactDir: dir,
        stages: { build: 'success', server: 'success', capture: 'success' },
      });
      expect(result.ok).toBe(false);
      expect(result.status).toBe('unavailable');
      expect(result.missingEvidence).toContain('manifest.json');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('treats a missing routing record as failure instead of assuming skipped', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'visual-gate-'));
    try {
      const result = evaluateVisualEvidence({
        artifactDir: dir,
        stages: { build: 'skipped', server: 'skipped', capture: 'skipped' },
      });
      expect(result.ok).toBe(false);
      expect(result.missingEvidence).toContain('routing.json');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('fails on any failed capture stage and passes complete or skipped evidence', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'visual-gate-'));
    try {
      await writeFile(
        join(dir, 'routing.json'),
        JSON.stringify({ shouldReview: true })
      );
      await writeFile(join(dir, 'manifest.json'), JSON.stringify([]));

      const failed = evaluateVisualEvidence({
        artifactDir: dir,
        stages: { build: 'success', server: 'failure', capture: 'skipped' },
      });
      expect(failed.ok).toBe(false);
      expect(failed.failedStages).toEqual(['server']);

      const complete = evaluateVisualEvidence({
        artifactDir: dir,
        stages: { build: 'success', server: 'success', capture: 'success' },
      });
      expect(complete.ok).toBe(true);
      expect(complete.status).toBe('completed');

      await writeFile(
        join(dir, 'routing.json'),
        JSON.stringify({ shouldReview: false })
      );
      const skipped = evaluateVisualEvidence({
        artifactDir: dir,
        stages: { build: 'skipped', server: 'skipped', capture: 'skipped' },
      });
      expect(skipped.ok).toBe(true);
      expect(skipped.status).toBe('skipped');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('exits non-zero from the CLI on missing evidence and records the outcome file', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'visual-gate-cli-'));
    try {
      const artifactDir = join(dir, 'pr-visual-artifacts');
      const gateScript = fileURLToPath(
        new URL(
          '../../../.github/scripts/pr-visual-evidence-gate.mjs',
          import.meta.url
        )
      );
      const run = env =>
        spawnSync(process.execPath, [gateScript], {
          cwd: dir,
          env: { ...process.env, PR_VISUAL_OUT: artifactDir, ...env },
        });

      const missing = run({ CAPTURE_OUTCOME: 'skipped' });
      expect(missing.status).toBe(1);

      const outcome = JSON.parse(
        readFileSync(join(artifactDir, 'advisory-outcome.json'), 'utf8')
      );
      expect(outcome.status).toBe('unavailable');
      expect(outcome.advisory).toBe(false);
      expect(outcome.missingEvidence).toContain('routing.json');

      await writeFile(
        join(artifactDir, 'routing.json'),
        JSON.stringify({ shouldReview: false })
      );
      const failedStage = run({ BUILD_OUTCOME: 'failure' });
      expect(failedStage.status).toBe(1);

      const skipped = run({});
      expect(skipped.status).toBe(0);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('keeps the workflow wired to the gate script as the enforcement point', () => {
    const workflow = readFileSync(
      '.github/workflows/pr-visual-review.yml',
      'utf8'
    );
    const captureJob = workflow.slice(
      workflow.indexOf('  capture:'),
      workflow.indexOf('\n  review:')
    );
    expect(captureJob).toContain(
      'run: node .github/scripts/pr-visual-evidence-gate.mjs'
    );
    expect(captureJob).not.toMatch(/^    continue-on-error: true/m);
    expect(captureJob).not.toContain('does not block merging');
  });
});
const sonarCheck = (overrides = {}) => ({
  name: SONAR_CHECK_NAME,
  app: { slug: SONAR_CHECK_APP_SLUG },
  status: 'completed',
  conclusion: 'failure',
  details_url: 'https://sonarcloud.io/project/pull_requests?id=jovie',
  ...overrides,
});
const sonarReceiptInput = {
  repository: 'jovie/jovie',
  runId: '42',
  runUrl: 'https://github.com/jovie/jovie/actions/runs/42',
  prNumber: 7,
  headSha: 'b'.repeat(40),
  checkName: SONAR_CHECK_NAME,
  checkConclusion: 'failure',
  checkAppSlug: SONAR_CHECK_APP_SLUG,
  detailsUrl:
    'https://sonarcloud.io/project/pull_requests?id=jovie&pullRequest=7',
  capacity: { openAgentPrs: 4, maxOpenAgentPrs: 5, candidateRank: 2 },
};
describe('trusted Sonar remediation contracts', () => {
  it('selects the newest authenticated failure and ignores stale results', () => {
    const newest = sonarCheck({ id: 4, completed_at: '2026-08-20T04:00:00Z' });
    expect(
      selectLatestFailingSonarCheck([
        { check_runs: [sonarCheck({ app: { slug: 'attacker' } }), newest] },
      ])
    ).toEqual(newest);
    expect(
      selectLatestFailingSonarCheck([
        {
          check_runs: [
            sonarCheck(),
            sonarCheck({
              status: 'in_progress',
              conclusion: null,
              started_at: '2026-08-20T02:00:00Z',
              completed_at: null,
            }),
          ],
        },
      ])
    ).toBeNull();
  });
  it('emits owned visual incidents and bounded quality-debt receipts', () => {
    const incident = buildVisualConfigurationIncident({
      ...sonarReceiptInput,
      configurationErrors: [
        'backend_unconfigured: GROK_VISUAL_REVIEW_API_KEY is missing',
      ],
    });
    expect(incident).toMatchObject({
      type: 'configuration_incident',
      status: 'owned_escalation_required',
      ownership: { owner: 'Gem', verifier: 'Summer' },
    });
    expect(() =>
      buildVisualConfigurationIncident({
        ...sonarReceiptInput,
        runUrl: 'https://evil.test/run',
        configurationErrors: ['backend_unconfigured: invalid'],
      })
    ).toThrow('canonical workflow run URL');
    expect(buildSonarQualityDebtReceipt(sonarReceiptInput)).toMatchObject({
      status: 'owned_capacity_deferred',
      remediation: { attemptBudget: 3, targetHeadSha: 'b'.repeat(40) },
    });
    expect(() =>
      buildSonarQualityDebtReceipt({
        ...sonarReceiptInput,
        capacity: { ...sonarReceiptInput.capacity, openAgentPrs: null },
      })
    ).toThrow('valid capacity evidence');
  });
});
