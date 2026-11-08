import { describe, expect, it, vi } from 'vitest';
import {
  BOTTLENECK_FINGERPRINT,
  bottleneckIssue,
  fileBottleneckIssue,
  PAID_PATH,
  paidPathOrder,
  topBottleneck,
} from '../cert-bottleneck.mjs';
import { SURFACE_IDS } from '../prod-cert.mjs';

const SHA = 'b'.repeat(40);
const check = (id, status, summary = `${id} ${status}`) => ({
  id,
  status,
  summary,
});
const receipt = (surface, status, checks = []) => ({ surface, status, checks });
const allPassed = () =>
  SURFACE_IDS.map(s => receipt(s, 'passed', [check('ok', 'passed')]));

describe('the topmost Golden Path bottleneck', () => {
  it('is the first surface in launch order that is not green', () => {
    const receipts = allPassed();
    receipts[SURFACE_IDS.indexOf('checkout')] = receipt('checkout', 'failed', [
      check('stripe-session', 'failed'),
    ]);
    receipts[SURFACE_IDS.indexOf('claim')] = receipt('claim', 'blocked', [
      check('claim-renders', 'passed'),
      check('claim-browser', 'blocked', 'no browser evidence'),
    ]);
    expect(topBottleneck(receipts, SURFACE_IDS)).toEqual({
      surface: 'claim',
      check: {
        id: 'claim-browser',
        status: 'blocked',
        summary: 'no browser evidence',
      },
      behind: ['checkout'],
    });
  });

  it('names a failed check before a blocked one on the same surface', () => {
    const receipts = allPassed();
    receipts[0] = receipt(SURFACE_IDS[0], 'failed', [
      check('waits', 'blocked'),
      check('broken', 'failed'),
    ]);
    expect(topBottleneck(receipts, SURFACE_IDS)?.check.id).toBe('broken');
  });

  it('treats a missing receipt as the bottleneck, never as green', () => {
    const receipts = allPassed().filter(r => r.surface !== 'onboarding');
    expect(topBottleneck(receipts, SURFACE_IDS)).toMatchObject({
      surface: 'onboarding',
      check: { id: 'no-evidence', status: 'blocked' },
    });
  });

  it('is null only when every surface passed', () => {
    expect(topBottleneck(allPassed(), SURFACE_IDS)).toBeNull();
  });

  it('writes an issue an agent can act on without other context', () => {
    const { title, description } = bottleneckIssue(
      {
        surface: 'landing',
        check: check('stranger-homepage-signup-entry', 'failed', 'invite only'),
        behind: ['claim'],
      },
      { servedSha: SHA, runUrl: 'https://github.com/run/1' }
    );
    expect(title).toContain(BOTTLENECK_FINGERPRINT);
    expect(description).toContain('`stranger-homepage-signup-entry`');
    expect(description).toContain('invite only');
    expect(description).toContain('- `claim`');
    expect(description).toContain('node scripts/prod-cert.mjs');
    expect(description).toMatch(/- \[ \] A production certification run/u);
  });
});

describe('filing the bottleneck issue', () => {
  const deps = () => ({
    upsert: vi.fn(async () => ({ ok: true, action: 'updated' })),
    close: vi.fn(async () => ({ ok: true, action: 'closed' })),
    findLabel: vi.fn(async name =>
      name === 'dispatch-next'
        ? { ok: true, id: 'L-dn' }
        : { ok: true, id: 'L-ar' }
    ),
  });

  it('files it Urgent in Todo with agent-ready and dispatch-next', async () => {
    const d = deps();
    const receipts = allPassed();
    receipts[2] = receipt(SURFACE_IDS[2], 'failed', [check('x', 'failed')]);
    const result = await fileBottleneckIssue(receipts, {
      servedSha: SHA,
      surfaceOrder: SURFACE_IDS,
      deps: d,
    });
    expect(d.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        fingerprint: BOTTLENECK_FINGERPRINT,
        labelKey: BOTTLENECK_FINGERPRINT,
        priority: 1,
        createStateName: 'Todo',
        keepLabelIds: ['L-ar', 'L-dn'],
        reopenTerminal: true,
      })
    );
    expect(d.close).not.toHaveBeenCalled();
    expect(result.bottleneck).toBe(`${SURFACE_IDS[2]}/x`);
  });

  it('still files when a dispatch label is missing', async () => {
    const d = deps();
    d.findLabel = vi.fn(async () => ({ ok: true, id: null }));
    const receipts = allPassed();
    receipts[0] = receipt(SURFACE_IDS[0], 'failed', [check('x', 'failed')]);
    await fileBottleneckIssue(receipts, {
      servedSha: SHA,
      surfaceOrder: SURFACE_IDS,
      deps: d,
    });
    expect(d.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ keepLabelIds: [] })
    );
  });

  it('closes it once every surface passes', async () => {
    const d = deps();
    await fileBottleneckIssue(allPassed(), {
      servedSha: SHA,
      surfaceOrder: SURFACE_IDS,
      deps: d,
    });
    expect(d.upsert).not.toHaveBeenCalled();
    expect(d.close).toHaveBeenCalledWith(
      expect.objectContaining({ fingerprint: BOTTLENECK_FINGERPRINT })
    );
  });

  it('works the paid path first: own profile with claim banner, claim, sign up, checkout', () => {
    const order = paidPathOrder(SURFACE_IDS);
    expect(order.slice(0, 4)).toEqual([...PAID_PATH]);
    expect([...order].sort()).toEqual([...SURFACE_IDS].sort());
    // The general homepage comes after the paid path.
    expect(order.indexOf('landing')).toBeGreaterThan(3);
    // Checkout red outranks onboarding red once the earlier paid steps pass.
    const receipts = SURFACE_IDS.map(surface => ({
      surface,
      status: ['onboarding', 'checkout'].includes(surface)
        ? 'failed'
        : 'passed',
      checks: [{ id: `${surface}-check`, status: 'failed' }],
    }));
    expect(topBottleneck(receipts, order)?.surface).toBe('checkout');
    expect(topBottleneck(receipts, SURFACE_IDS)?.surface).toBe('onboarding');
  });
});
