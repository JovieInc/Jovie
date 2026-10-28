import { describe, expect, it, vi } from 'vitest';
import { fileSurfaceIssues } from '../../prod-cert.mjs';
import {
  buildReceipt,
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

describe('fileSurfaceIssues', () => {
  it('upserts one fingerprinted issue per failed surface and closes passed ones', async () => {
    const upsert = vi.fn(async () => ({ ok: true }));
    const close = vi.fn(async () => ({ ok: true }));
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
