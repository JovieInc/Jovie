import { describe, expect, it, vi } from 'vitest';
import {
  fileOverallIssue,
  fileSurfaceIssues,
  postReceipts,
  stripEvidenceOnlyKeys,
} from '../../prod-cert.mjs';
import {
  buildReceipt,
  certificationVerdict,
  EXPECTED_BROWSER_CHECKS,
  runCheck,
  runProductionCertification,
  SURFACE_IDS,
  statusFromChecks,
} from '../prod-cert.mjs';

const SHA = 'a'.repeat(40);
const T = '2026-10-28T20:00:00.000Z';
const check = (status, id = 'c') => ({
  id,
  status,
  startedAt: T,
  endedAt: T,
  summary: 's',
});

/** @param {{ failPath?: string, sha?: string }} [options] */
function fakeFetch({ failPath, sha = SHA } = {}) {
  return async url => {
    const u = new URL(url);
    const html = (body, status = 200) =>
      new Response(body, { status, headers: { 'content-type': 'text/html' } });
    if (u.pathname === '/api/health/build-info') {
      return new Response(
        JSON.stringify({ commitSha: sha, deploymentId: 'dpl_1' })
      );
    }
    if (u.pathname === failPath) return html('boom', 500);
    if (u.pathname === '/api/handle/check') {
      const taken = u.searchParams.get('handle') === 'tim';
      return new Response(
        JSON.stringify(
          taken ? { available: false, reason: 'taken' } : { available: true }
        )
      );
    }
    if (u.pathname === '/og.png') {
      return new Response('x', { headers: { 'content-type': 'image/png' } });
    }
    if (u.pathname === '/tim') {
      return html(
        '<title>Tim</title><h1>Tim</h1><meta property="og:image" content="/og.png"/><a href="/tim/song-1">s</a>'
      );
    }
    if (u.pathname === '/tim/song-1') {
      return html(
        '<title>Song</title><meta property="og:image" content="/og.png"/>'
      );
    }
    if (u.pathname === '/signin')
      return html('<title>Sign in</title><input type="email">');
    return html('<title>Jovie page</title>');
  };
}

describe('statusFromChecks', () => {
  it('failed beats blocked beats passed, and no checks is never a pass', () => {
    expect(
      statusFromChecks([check('passed'), check('failed'), check('blocked')])
    ).toBe('failed');
    expect(statusFromChecks([check('passed'), check('blocked')])).toBe(
      'blocked'
    );
    expect(statusFromChecks([check('passed')])).toBe('passed');
    expect(statusFromChecks([])).toBe('blocked');
  });
});

describe('runCheck', () => {
  it('records an exception as a failed check with timestamps', async () => {
    const result = await runCheck('x', async () => {
      throw new Error('nope\nstack');
    });
    expect(result).toMatchObject({
      id: 'x',
      status: 'failed',
      summary: 'nope',
    });
    expect(Date.parse(result.endedAt)).toBeGreaterThanOrEqual(
      Date.parse(result.startedAt)
    );
  });
});

describe('buildReceipt', () => {
  it('carries the blocker reasons and screen ids', () => {
    const receipt = buildReceipt({
      surface: 'chat',
      checks: [
        check('passed', 'composer-ready'),
        check('blocked', 'first-reply'),
      ],
      sha: SHA,
      startedAt: T,
      endedAt: T,
    });
    expect(receipt.status).toBe('blocked');
    expect(receipt.blocker).toContain('first-reply');
    expect(receipt.screenIds).toEqual(['web.chat']);
  });
});

describe('runProductionCertification', () => {
  it('emits one receipt per surface in launch order, bound to the served sha', async () => {
    const { receipts, served } = await runProductionCertification({
      fetchImpl: fakeFetch(),
      authStatus: 'not-configured',
    });
    expect(served.sha).toBe(SHA);
    expect(receipts.map(r => r.surface)).toEqual(SURFACE_IDS);
    expect(receipts.every(r => r.sha === SHA)).toBe(true);
    expect(receipts.find(r => r.surface === 'landing').status).toBe('passed');
    const signin = receipts.find(r => r.surface === 'signup-signin');
    expect(signin.status).toBe('blocked');
    expect(signin.blocker).toContain('not configured');
    expect(
      receipts.find(r => r.surface === 'smartlink').checks.map(c => c.id)
    ).toEqual([
      'release-link-resolves',
      'release-og-image',
      'click-analytics-capture',
    ]);
  });

  it('fails a surface whose page 500s', async () => {
    const { receipts } = await runProductionCertification({
      fetchImpl: fakeFetch({ failPath: '/claim' }),
    });
    const claim = receipts.find(r => r.surface === 'claim');
    expect(claim.status).toBe('failed');
    expect(claim.checks.find(c => c.id === 'claim-renders').summary).toContain(
      'HTTP 500'
    );
  });

  it('turns browser steps into passed checks and keeps a failed step failed', async () => {
    const steps = [
      {
        surface: 'onboarding',
        id: 'dashboard-first-value',
        status: 'passed',
        startedAt: T,
        endedAt: T,
        summary: 'ok',
      },
      {
        surface: 'onboarding',
        id: 'fresh-user-onboarding-first-value',
        status: 'passed',
        startedAt: T,
        endedAt: T,
        summary: 'ok',
      },
      {
        surface: 'checkout',
        id: 'checkout-entry-renders',
        status: 'failed',
        startedAt: T,
        endedAt: T,
        summary: 'no plan control',
      },
    ];
    const { receipts } = await runProductionCertification({
      fetchImpl: fakeFetch(),
      steps,
      authStatus: 'passed',
    });
    expect(receipts.find(r => r.surface === 'onboarding').status).toBe(
      'passed'
    );
    expect(receipts.find(r => r.surface === 'checkout').status).toBe('failed');
  });

  it('records no evidence for a promoted sha that production is not serving', async () => {
    const { receipts } = await runProductionCertification({
      fetchImpl: fakeFetch({ sha: 'b'.repeat(40) }),
      expectedSha: SHA,
    });
    expect(receipts.every(r => r.status === 'blocked')).toBe(true);
    expect(receipts[0].blocker).toContain('production serves bbbbbbbb');
    expect(receipts[0].sha).toBe('b'.repeat(40));
  });
});

describe('quality observations', () => {
  it('attaches measured contract observations from the browser run to the surface receipt', async () => {
    const steps = [
      {
        kind: 'observation',
        surface: 'chat',
        contractId: 'conversation.message-echo',
        dimension: 'responsiveness',
        value: 31,
        unit: 'ms',
        sampleSize: 1,
      },
    ];
    const { receipts } = await runProductionCertification({
      fetchImpl: fakeFetch(),
      steps,
      authStatus: 'passed',
    });
    expect(receipts.find(r => r.surface === 'chat').observations).toEqual([
      {
        contractId: 'conversation.message-echo',
        dimension: 'responsiveness',
        value: 31,
        unit: 'ms',
        sampleSize: 1,
      },
    ]);
    expect(receipts.find(r => r.surface === 'landing').observations).toEqual(
      []
    );
  });
});

describe('fileSurfaceIssues', () => {
  it('upserts one fingerprinted issue per failed surface and closes passed ones', async () => {
    const upsert = vi.fn(async (/** @type {any} */ _issue) => ({ ok: true }));
    const close = vi.fn(async (/** @type {any} */ _issue) => ({ ok: true }));
    const { receipts } = await runProductionCertification({
      fetchImpl: fakeFetch({ failPath: '/claim' }),
    });
    await fileSurfaceIssues(receipts, { deps: { upsert, close } });
    expect(upsert.mock.calls.map(c => c[0].fingerprint)).toEqual([
      'prod-cert-claim',
    ]);
    expect(upsert.mock.calls[0][0]).toMatchObject({
      fingerprint: 'prod-cert-claim',
      labelKey: 'prod-cert-claim',
    });
    expect(close.mock.calls.map(c => c[0].fingerprint)).toEqual([
      'prod-cert-landing',
    ]);
  });
});

describe('JOV-9822 retries, full green and the overall verdict', () => {
  const step = (surface, id, status, endedAt) => ({
    surface,
    id,
    status,
    startedAt: endedAt,
    endedAt,
    summary: status,
  });
  const allPassedSteps = Object.entries(EXPECTED_BROWSER_CHECKS).flatMap(
    ([surface, ids]) => ids.map(id => step(surface, id, 'passed', T))
  );

  it('keeps the latest attempt of a retried check, so a fail-then-pass passes', async () => {
    const { receipts } = await runProductionCertification({
      fetchImpl: fakeFetch(),
      authStatus: 'passed',
      steps: [
        ...allPassedSteps.filter(s => s.id !== 'checkout-entry-renders'),
        step('checkout', 'checkout-entry-renders', 'failed', T),
        step(
          'checkout',
          'checkout-entry-renders',
          'passed',
          '2026-10-28T20:01:00.000Z'
        ),
      ],
    });
    const checkout = receipts.find(r => r.surface === 'checkout');
    expect(checkout.status).toBe('passed');
    expect(checkout.checks).toHaveLength(1);
  });

  it('a pass followed by a failed retry stays failed', async () => {
    const { receipts } = await runProductionCertification({
      fetchImpl: fakeFetch(),
      authStatus: 'passed',
      steps: [
        ...allPassedSteps.filter(s => s.id !== 'first-reply'),
        step('chat', 'first-reply', 'passed', T),
        step('chat', 'first-reply', 'failed', '2026-10-28T20:01:00.000Z'),
      ],
    });
    expect(receipts.find(r => r.surface === 'chat').status).toBe('failed');
  });

  it('certifies only when all eight surfaces pass on the served sha within 24h', async () => {
    const { receipts } = await runProductionCertification({
      fetchImpl: fakeFetch(),
      authStatus: 'passed',
      steps: allPassedSteps,
    });
    expect(receipts.every(r => r.status === 'passed')).toBe(true);
    const now = Date.parse(receipts[0].endedAt);
    expect(
      certificationVerdict(receipts, { servedSha: SHA, nowMs: now })
    ).toEqual({
      certified: true,
      servedSha: SHA,
      notGreen: [],
    });
    const other = 'b'.repeat(40);
    expect(
      certificationVerdict(receipts, { servedSha: other, nowMs: now }).notGreen
    ).toHaveLength(8);
    expect(
      certificationVerdict(receipts, {
        servedSha: SHA,
        nowMs: now + 25 * 60 * 60 * 1000,
      }).certified
    ).toBe(false);
    expect(
      certificationVerdict(receipts.slice(1), { servedSha: SHA, nowMs: now })
        .notGreen
    ).toEqual([{ surface: 'landing', why: 'no receipt' }]);
  });

  it('requires the /start preview and the smartlink capture from the browser run', async () => {
    const { receipts } = await runProductionCertification({
      fetchImpl: fakeFetch(),
      authStatus: 'passed',
      steps: allPassedSteps.filter(
        s => s.id !== 'golden-path-preview-has-release'
      ),
    });
    const claim = receipts.find(r => r.surface === 'claim');
    expect(claim.status).toBe('blocked');
    expect(claim.blocker).toContain('golden-path-preview-has-release');
  });

  it('opens one overall issue when not certified and closes it when certified', async () => {
    const upsert = vi.fn().mockResolvedValue({ ok: true });
    const close = vi.fn().mockResolvedValue({ ok: true });
    await fileOverallIssue(
      {
        certified: false,
        servedSha: SHA,
        notGreen: [{ surface: 'chat', why: 'failed' }],
      },
      { deps: { upsert, close } }
    );
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        fingerprint: 'prod-cert-overall',
        description: expect.stringContaining('`chat`: failed'),
      })
    );
    await fileOverallIssue(
      { certified: true, servedSha: SHA, notGreen: [] },
      { deps: { upsert, close } }
    );
    expect(close).toHaveBeenCalledWith(
      expect.objectContaining({ fingerprint: 'prod-cert-overall' })
    );
  });
});

describe('JOV-9625 outcome rework: per-surface browser evidence', () => {
  it('folds telemetry and screenshot steps into the surface receipt', async () => {
    const steps = [
      {
        kind: 'telemetry',
        surface: 'chat',
        consoleErrors: 2,
        networkErrors: 1,
      },
      {
        kind: 'screenshot',
        surface: 'chat',
        format: 'jpeg',
        dataUrl: 'data:image/jpeg;base64,abc',
      },
    ];
    const { receipts } = await runProductionCertification({
      fetchImpl: fakeFetch(),
      steps,
      authStatus: 'passed',
    });
    const chat = receipts.find(r => r.surface === 'chat');
    expect(chat.consoleErrorCount).toBe(2);
    expect(chat.networkErrorCount).toBe(1);
    expect(chat.screenshot).toEqual({
      format: 'jpeg',
      dataUrl: 'data:image/jpeg;base64,abc',
    });
    // A surface with no browser evidence records absence, never a zero.
    const landing = receipts.find(r => r.surface === 'landing');
    expect(landing.consoleErrorCount).toBeNull();
    expect(landing.networkErrorCount).toBeNull();
    expect(landing.screenshot).toBeNull();
  });

  it('the latest telemetry and screenshot step for a surface wins', async () => {
    const steps = [
      {
        kind: 'telemetry',
        surface: 'chat',
        consoleErrors: 5,
        networkErrors: 5,
      },
      {
        kind: 'screenshot',
        surface: 'chat',
        format: 'jpeg',
        dataUrl: 'data:image/jpeg;base64,first',
      },
      {
        kind: 'telemetry',
        surface: 'chat',
        consoleErrors: 0,
        networkErrors: 0,
      },
      {
        kind: 'screenshot',
        surface: 'chat',
        format: 'jpeg',
        dataUrl: 'data:image/jpeg;base64,second',
      },
    ];
    const { receipts } = await runProductionCertification({
      fetchImpl: fakeFetch(),
      steps,
      authStatus: 'passed',
    });
    const chat = receipts.find(r => r.surface === 'chat');
    expect(chat.consoleErrorCount).toBe(0);
    expect(chat.networkErrorCount).toBe(0);
    expect(chat.screenshot.dataUrl).toBe('data:image/jpeg;base64,second');
  });

  it('folds the admin inventory readback into the landing receipt only (JOV-9625)', async () => {
    const steps = [
      {
        kind: 'readback',
        status: 'blocked',
        detail:
          'GET /api/ovie/certifications returned HTTP 403 — fixture is not an admin',
      },
    ];
    const { receipts } = await runProductionCertification({
      fetchImpl: fakeFetch(),
      steps,
      authStatus: 'passed',
    });
    const landing = receipts.find(r => r.surface === 'landing');
    expect(landing.adminInventoryReadback).toEqual({
      status: 'blocked',
      detail:
        'GET /api/ovie/certifications returned HTTP 403 — fixture is not an admin',
    });
    // Evidence only: a blocked readback never turns a surface red.
    expect(landing.status).toBe('passed');
    const chat = receipts.find(r => r.surface === 'chat');
    expect(chat.adminInventoryReadback).toBeNull();
  });

  it('expects the profile edit readback and the fresh-user onboarding step', () => {
    expect(EXPECTED_BROWSER_CHECKS['public-profile']).toContain(
      'profile-edit-save-readback'
    );
    expect(EXPECTED_BROWSER_CHECKS.onboarding).toContain(
      'fresh-user-onboarding-first-value'
    );
  });
});

describe('ledger POST across a served-build schema skew (JOV-9625)', () => {
  const receipt = () =>
    buildReceipt({
      surface: 'landing',
      checks: [check('passed', 'front-door-renders')],
      sha: SHA,
      startedAt: T,
      endedAt: T,
      adminInventoryReadback: { status: 'passed', detail: '8 surfaces' },
    });

  it('stripEvidenceOnlyKeys removes only the allowlisted keys', () => {
    const [stripped] = stripEvidenceOnlyKeys([
      {
        surface: 'landing',
        status: 'passed',
        sha: SHA,
        adminInventoryReadback: { status: 'passed', detail: 'd' },
        screenshot: { format: 'jpeg', dataUrl: 'data:image/jpeg;base64,x' },
      },
    ]);
    expect(stripped).toEqual({
      surface: 'landing',
      status: 'passed',
      sha: SHA,
      screenshot: { format: 'jpeg', dataUrl: 'data:image/jpeg;base64,x' },
    });
    // The original receipt is untouched — the --out file keeps the readback.
    expect(receipt().adminInventoryReadback).toEqual({
      status: 'passed',
      detail: '8 surfaces',
    });
  });

  it('reposts without the evidence-only key when the served ledger predates it', async () => {
    const bodies = [];
    const sentAdminKeys = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url, init) => {
        const body = JSON.parse(init.body);
        bodies.push(body);
        sentAdminKeys.push(
          body.receipts.map(r => 'adminInventoryReadback' in r)
        );
        if (bodies.length === 1)
          return new Response(
            JSON.stringify({
              error: 'invalid_receipts',
              unrecognized_keys: ['adminInventoryReadback'],
            }),
            { status: 400, headers: { 'content-type': 'application/json' } }
          );
        return new Response(JSON.stringify({ ok: true, inserted: 8 }), {
          status: 200,
        });
      })
    );
    const prevSecret = process.env.CRON_SECRET;
    process.env.CRON_SECRET = 'test-secret';
    try {
      const result = await postReceipts([receipt()], 'https://jov.ie');
      expect(result).toEqual({ ok: true, inserted: 8 });
      expect(bodies).toHaveLength(2);
      expect(sentAdminKeys[0]).toEqual([true]);
      expect(sentAdminKeys[1]).toEqual([false]);
    } finally {
      process.env.CRON_SECRET = prevSecret;
      vi.unstubAllGlobals();
    }
  });

  it('still fails loudly on a 400 that is not the evidence-key skew', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({ error: 'invalid_receipts', issues: [] }),
            { status: 400, headers: { 'content-type': 'application/json' } }
          )
      )
    );
    const prevSecret = process.env.CRON_SECRET;
    process.env.CRON_SECRET = 'test-secret';
    try {
      await expect(postReceipts([receipt()], 'https://jov.ie')).rejects.toThrow(
        /ledger POST HTTP 400/
      );
      expect(vi.mocked(fetch).mock.calls).toHaveLength(1);
    } finally {
      process.env.CRON_SECRET = prevSecret;
      vi.unstubAllGlobals();
    }
  });
});
