import { describe, expect, it, vi } from 'vitest';
import { createGoldenPathLinearIssue } from '../golden-path-intake.mjs';
import {
  buildAutofixPrompt,
  buildMergeGateReceipt,
  buildProdProbeReceipt,
  classifyChangedPaths,
  cursorAuthHeader,
  evaluateBillingHealth,
  evaluateChatFirstMessage,
  evaluateClaimUnauth,
  evaluateHomepageHtml,
  evaluateProdProbe,
  evaluateStripeWebhookLiveness,
  evaluateWaitlistUnauth,
  findOwnedAgents,
  GOLDEN_PATH_HERO_SEARCH_ACTION,
  GOLDEN_PATH_HERO_SEARCH_PLACEHOLDER,
  GOLDEN_PATH_LOCK_SCHEMA,
  HOMEPAGE_CTA_FAIL_REASON,
  HOMEPAGE_CTA_RETIRED_REASON,
  MERGE_GATE_TEST_FILES,
  planAutofix,
  validateReceipt,
} from '../golden-path-lock.mjs';

const CERTIFIED_HOMEPAGE_HTML = `
  <input placeholder="${GOLDEN_PATH_HERO_SEARCH_PLACEHOLDER}" />
  <button type="button" data-testid="homepage-primary-cta">${GOLDEN_PATH_HERO_SEARCH_ACTION}</button>
  <a href="/start" data-primary-cta="true">Find yourself</a>
`;

describe('golden-path lock test files', () => {
  it('keeps merge-gate files inside the web package', () => {
    expect(MERGE_GATE_TEST_FILES.length).toBeGreaterThan(0);
    for (const file of MERGE_GATE_TEST_FILES) {
      expect(file.startsWith('apps/web/tests/unit/')).toBe(true);
    }
  });
});

describe('golden-path lock classifier', () => {
  it('marks chat, start, waitlist, and homepage CTA paths', () => {
    const classified = classifyChangedPaths([
      'apps/web/app/api/chat/onboarding-handler.ts',
      'apps/web/app/start/page.tsx',
      'apps/web/app/api/waitlist/route.ts',
      'apps/web/data/homepageFrontDoorCta.ts',
      'apps/web/data/homepageLaunchCopy.ts',
      'README.md',
    ]);
    expect(classified.touchesGoldenPath).toBe(true);
    expect(classified.matched).toEqual([
      'apps/web/app/api/chat/onboarding-handler.ts',
      'apps/web/app/start/page.tsx',
      'apps/web/app/api/waitlist/route.ts',
      'apps/web/data/homepageFrontDoorCta.ts',
      'apps/web/data/homepageLaunchCopy.ts',
    ]);
  });

  it('still records docs-only diffs without treating them as a skip', () => {
    const classified = classifyChangedPaths(['docs/launch/LAUNCH_GATES.md']);
    expect(classified.touchesGoldenPath).toBe(false);
    expect(classified.changed).toEqual(['docs/launch/LAUNCH_GATES.md']);
  });
});

describe('golden-path lock evaluators', () => {
  it('requires the certified name search + Find me → /start', () => {
    expect(evaluateHomepageHtml(CERTIFIED_HOMEPAGE_HTML)).toMatchObject({
      id: 'homepage-cta',
      ok: true,
      reason: expect.stringContaining(GOLDEN_PATH_HERO_SEARCH_ACTION),
    });
    expect(
      evaluateHomepageHtml(
        '<a href="/start?starter_prompt=Hey">Get started</a>'
      )
    ).toMatchObject({
      ok: false,
      reason: HOMEPAGE_CTA_RETIRED_REASON,
    });
    expect(
      evaluateHomepageHtml('<a href="/signup">Get started</a>')
    ).toMatchObject({
      ok: false,
      reason: HOMEPAGE_CTA_RETIRED_REASON,
    });
    expect(
      evaluateHomepageHtml('<a href="https://jov.ie/waitlist">Get started</a>')
    ).toMatchObject({
      ok: false,
      reason: HOMEPAGE_CTA_RETIRED_REASON,
    });
    expect(
      evaluateHomepageHtml(
        `<input placeholder="${GOLDEN_PATH_HERO_SEARCH_PLACEHOLDER}" /><button>Find me</button>`
      )
    ).toMatchObject({
      ok: false,
      reason: HOMEPAGE_CTA_FAIL_REASON,
    });
    expect(evaluateHomepageHtml('')).toMatchObject({ ok: false });
  });

  it('fails 401 and fake rate-limit copy on logged-out first message', () => {
    expect(
      evaluateChatFirstMessage({ status: 401, body: { error: 'Unauthorized' } })
    ).toMatchObject({
      ok: false,
      reason: expect.stringContaining('401'),
    });
    expect(
      evaluateChatFirstMessage({
        status: 200,
        body: { error: 'Too many messages were sent.' },
      })
    ).toMatchObject({
      ok: false,
      reason: expect.stringContaining('fake rate-limit'),
    });
    expect(
      evaluateChatFirstMessage({
        status: 403,
        body: { errorCode: 'TURNSTILE_REQUIRED' },
      })
    ).toMatchObject({ ok: true });
    expect(
      evaluateChatFirstMessage({ status: 200, body: { ok: true } })
    ).toMatchObject({
      ok: true,
    });
  });

  it('requires unauthenticated waitlist writes to 401', () => {
    expect(evaluateWaitlistUnauth({ status: 401 })).toMatchObject({ ok: true });
    expect(evaluateWaitlistUnauth({ status: 200 })).toMatchObject({
      ok: false,
    });
  });

  it('requires unauthenticated claim writes to 401', () => {
    expect(evaluateClaimUnauth({ status: 401 })).toMatchObject({ ok: true });
    expect(evaluateClaimUnauth({ status: 200 })).toMatchObject({ ok: false });
  });

  it('requires billing health 200 healthy:true', () => {
    expect(
      evaluateBillingHealth({ status: 200, body: { healthy: true } })
    ).toMatchObject({ ok: true });
    expect(
      evaluateBillingHealth({ status: 503, body: { healthy: false } })
    ).toMatchObject({ ok: false });
    expect(evaluateBillingHealth({ status: 404 })).toMatchObject({ ok: false });
  });

  it('requires unsigned Stripe webhooks to 400', () => {
    expect(evaluateStripeWebhookLiveness({ status: 400 })).toMatchObject({
      ok: true,
    });
    expect(evaluateStripeWebhookLiveness({ status: 500 })).toMatchObject({
      ok: false,
    });
    expect(evaluateStripeWebhookLiveness({ status: 404 })).toMatchObject({
      ok: false,
    });
  });

  it('aggregates the live-path checks including claim, billing, and Stripe', () => {
    const liveExtras = {
      claimStatus: 401,
      billingStatus: 200,
      billingBody: { healthy: true },
      stripeWebhookStatus: 400,
    };
    const ok = evaluateProdProbe({
      homepageHtml: CERTIFIED_HOMEPAGE_HTML,
      chatStatus: 403,
      chatBody: { errorCode: 'TURNSTILE_REQUIRED' },
      waitlistStatus: 401,
      ...liveExtras,
    });
    expect(ok.ok).toBe(true);
    expect(ok.checks).toHaveLength(6);

    const broken = evaluateProdProbe({
      homepageHtml: CERTIFIED_HOMEPAGE_HTML,
      chatStatus: 401,
      chatBody: { error: 'Unauthorized' },
      waitlistStatus: 401,
      ...liveExtras,
    });
    expect(broken.ok).toBe(false);
    expect(
      broken.checks.find(check => check.id === 'logged-out-first-message')?.ok
    ).toBe(false);
  });
});

describe('golden-path lock receipts', () => {
  it('rejects stub or skipped receipts', () => {
    expect(validateReceipt(null).ok).toBe(false);
    expect(
      validateReceipt({
        schema: GOLDEN_PATH_LOCK_SCHEMA,
        mode: 'merge-gate',
        ok: true,
        skipped: true,
        checks: [],
      }).ok
    ).toBe(false);
    expect(
      validateReceipt({
        schema: GOLDEN_PATH_LOCK_SCHEMA,
        mode: 'prod-probe',
        ok: true,
        stub: true,
        checks: [],
      }).ok
    ).toBe(false);
  });

  it('accepts a real merge-gate receipt that always ran', () => {
    const receipt = buildMergeGateReceipt({
      ok: true,
      classification: classifyChangedPaths(['apps/web/app/start/page.tsx']),
      checks: [
        {
          id: 'merge-gate-product-tests',
          ok: true,
          reason: 'vitest passed',
        },
      ],
    });
    expect(receipt.alwaysRan).toBe(true);
    expect(receipt.skipped).toBe(false);
    expect(receipt.testFiles).toEqual([...MERGE_GATE_TEST_FILES]);
    expect(validateReceipt(receipt)).toEqual({ ok: true, errors: [] });
  });

  it('accepts a real prod-probe receipt', () => {
    const evaluated = evaluateProdProbe({
      homepageHtml: CERTIFIED_HOMEPAGE_HTML,
      chatStatus: 403,
      chatBody: { errorCode: 'TURNSTILE_REQUIRED' },
      waitlistStatus: 401,
      claimStatus: 401,
      billingStatus: 200,
      billingBody: { healthy: true },
      stripeWebhookStatus: 400,
    });
    const receipt = buildProdProbeReceipt({
      ok: evaluated.ok,
      checks: evaluated.checks,
    });
    expect(receipt.fingerprint).toBe('golden-path-lock:prod:ok');
    expect(validateReceipt(receipt)).toEqual({ ok: true, errors: [] });
  });
});

describe('golden-path lock autofix planner', () => {
  it('fails closed when CURSOR_API_KEY is missing', () => {
    const plan = planAutofix({
      cursorApiKey: '',
      fingerprint: 'golden-path-lock:prod:logged-out-first-message',
      checks: [
        {
          id: 'logged-out-first-message',
          ok: false,
          reason: 'logged-out /start first message returned 401',
        },
      ],
    });
    expect(plan).toMatchObject({
      action: 'fail_closed',
      reason: 'missing_cursor_api_key',
    });
  });

  it('dedups when an agent already owns the fingerprint', () => {
    const plan = planAutofix({
      cursorApiKey: 'key',
      existingAgentIds: ['bc-1'],
      fingerprint: 'golden-path-lock:prod:logged-out-first-message',
    });
    expect(plan).toMatchObject({
      action: 'dedup',
      existingAgentIds: ['bc-1'],
    });
  });

  it('launches Cursor-direct with autoCreatePr on main', () => {
    const checks = [
      {
        id: 'logged-out-first-message',
        ok: false,
        reason: 'logged-out /start first message returned 401',
      },
    ];
    const plan = planAutofix({
      cursorApiKey: 'key',
      fingerprint: 'golden-path-lock:prod:logged-out-first-message',
      checks,
      origin: 'https://jov.ie',
    });
    expect(plan.action).toBe('launch');
    expect(plan.request.source).toEqual({
      repository: 'https://github.com/JovieInc/Jovie',
      ref: 'main',
    });
    expect(plan.request.target.autoCreatePr).toBe(true);
    expect(plan.request.prompt.text).toContain('not 401');
    expect(plan.request.prompt.text).toContain('Too many messages');
    expect(plan.request.prompt.text).toContain('Find me');
    expect(plan.request.prompt.text).toContain(
      'Do not revert Find me to Get started'
    );
    expect(buildAutofixPrompt({ fingerprint: 'x', checks })).toContain(
      'Tell Gem she missed this'
    );
  });

  it('matches owned agents by fingerprint and encodes Basic auth', () => {
    expect(
      findOwnedAgents(
        [
          {
            id: 'bc-1',
            prompt: 'golden-path-lock:prod:logged-out-first-message',
          },
        ],
        'golden-path-lock:prod:logged-out-first-message'
      )
    ).toEqual(['bc-1']);
    expect(cursorAuthHeader('abc')).toBe(
      `Basic ${Buffer.from('abc:', 'utf8').toString('base64')}`
    );
  });
});

describe('golden-path Linear-only intake', () => {
  it('creates exactly one canonical Linear record', async () => {
    const fetchImpl = vi.fn(
      async (_input, _init) =>
        new Response(
          JSON.stringify({
            data: {
              issueCreate: {
                success: true,
                issue: {
                  id: 'linear-1',
                  identifier: 'JOV-1001',
                  url: 'https://linear.app/jovie/issue/JOV-1001',
                },
              },
            },
          }),
          { status: 200 }
        )
    );

    const result = await createGoldenPathLinearIssue(
      {
        fingerprint: 'golden-path-lock:prod:test',
        prompt: 'Fix the failure',
        apiKey: 'linear-test-key',
      },
      fetchImpl
    );

    expect(result).toMatchObject({
      ok: true,
      identifier: 'JOV-1001',
    });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const payload = JSON.parse(String(fetchImpl.mock.calls[0][1].body));
    expect(payload.query).toContain('mutation CreateGoldenPathLockIssue');
    expect(payload.query).toContain('issueCreate');
  });

  it('fails closed on a Linear rate limit without another tracker write', async () => {
    const fetchImpl = vi.fn(
      async (_input, _init) => new Response('rate limited', { status: 429 })
    );

    const result = await createGoldenPathLinearIssue(
      {
        fingerprint: 'golden-path-lock:prod:test',
        prompt: 'Fix the failure',
        apiKey: 'linear-test-key',
      },
      fetchImpl
    );

    expect(result).toMatchObject({
      ok: false,
      reason: 'linear_issue_429',
    });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});
