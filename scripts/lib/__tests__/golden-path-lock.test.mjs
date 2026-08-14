import { describe, expect, it } from 'vitest';
import {
  buildAutofixPrompt,
  buildMergeGateReceipt,
  buildProdProbeReceipt,
  classifyChangedPaths,
  cursorAuthHeader,
  evaluateChatFirstMessage,
  evaluateHomepageHtml,
  evaluateProdProbe,
  evaluateWaitlistUnauth,
  findOwnedAgents,
  GOLDEN_PATH_LOCK_SCHEMA,
  MERGE_GATE_TEST_FILES,
  planAutofix,
  validateReceipt,
} from '../golden-path-lock.mjs';

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
      'README.md',
    ]);
    expect(classified.touchesGoldenPath).toBe(true);
    expect(classified.matched).toEqual([
      'apps/web/app/api/chat/onboarding-handler.ts',
      'apps/web/app/start/page.tsx',
      'apps/web/app/api/waitlist/route.ts',
      'apps/web/data/homepageFrontDoorCta.ts',
    ]);
  });

  it('still records docs-only diffs without treating them as a skip', () => {
    const classified = classifyChangedPaths(['docs/launch/LAUNCH_GATES.md']);
    expect(classified.touchesGoldenPath).toBe(false);
    expect(classified.changed).toEqual(['docs/launch/LAUNCH_GATES.md']);
  });
});

describe('golden-path lock evaluators', () => {
  it('requires Get started to point at /start', () => {
    expect(
      evaluateHomepageHtml(
        '<a href="/start?starter_prompt=Hey">Get started</a>'
      )
    ).toMatchObject({ id: 'homepage-cta', ok: true });
    expect(
      evaluateHomepageHtml('<a href="/signup">Get started</a>')
    ).toMatchObject({
      ok: false,
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

  it('aggregates the three live-path checks', () => {
    const ok = evaluateProdProbe({
      homepageHtml: '<a href="/start">Get started</a>',
      chatStatus: 403,
      chatBody: { errorCode: 'TURNSTILE_REQUIRED' },
      waitlistStatus: 401,
    });
    expect(ok.ok).toBe(true);
    expect(ok.checks).toHaveLength(3);

    const broken = evaluateProdProbe({
      homepageHtml: '<a href="/start">Get started</a>',
      chatStatus: 401,
      chatBody: { error: 'Unauthorized' },
      waitlistStatus: 401,
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
      homepageHtml: '<a href="/start">Get started</a>',
      chatStatus: 403,
      chatBody: { errorCode: 'TURNSTILE_REQUIRED' },
      waitlistStatus: 401,
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
