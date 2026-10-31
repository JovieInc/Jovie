import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buyerReady } from './gate.mjs';
import { RUBRIC_VERSION } from './rubric.mjs';

test("gate fails closed and only opens on the user's own pay walk", () => {
  const sha = 'abc1234';
  const now = Date.parse('2026-10-31T12:00:00Z');
  const base = { rubric: RUBRIC_VERSION, at: '2026-10-31T10:00:00Z' };
  const holdouts = [1, 2, 3].map(n => ({
    ...base,
    subject: `h${n}`,
    holdout: true,
    persona: { tier: 'A' },
    verdict: 'no_pay',
    pPay: 0.03,
    holdoutHolds: true,
  }));
  const control = {
    ...base,
    sha,
    subject: 'control-link-in-bio',
    persona: { tier: 'A', control: true },
    verdict: 'no_pay',
    pPay: 0.01,
  };
  const own = {
    ...base,
    sha,
    id: 'r1',
    subject: 'wl-1',
    walkSubject: 'wl-1',
    persona: { tier: 'B' },
    verdict: 'pay',
    pPay: 0.7,
    strong: { pPay: 0.7 },
  };
  const positive = {
    ...base,
    subject: 'positive-1',
    holdout: true,
    expect: 'pay',
    persona: { tier: 'A' },
    verdict: 'pay',
    pPay: 0.7,
    holdoutHolds: true,
  };
  holdouts.push(positive);
  const cert = { allow: true };
  assert.deepEqual(
    buyerReady({
      subject: 'wl-1',
      sha,
      receipts: [...holdouts, control, own],
      cert,
      now,
    }).ready,
    true
  );
  assert.match(
    buyerReady({
      subject: 'wl-1',
      sha,
      receipts: [...holdouts.slice(0, 3), control, own],
      cert,
      now,
    }).reasons.join(),
    /no-positive-canary/
  );
  assert.match(
    buyerReady({
      subject: 'wl-1',
      sha,
      receipts: [
        ...holdouts.slice(0, 3),
        { ...positive, verdict: 'no_pay', holdoutHolds: false },
        control,
        own,
      ],
      cert,
      now,
    }).reasons.join(),
    /positive-missed/
  );
  assert.match(
    buyerReady({
      subject: 'wl-1',
      sha,
      receipts: [...holdouts, control, own],
      cert: null,
      now,
    }).reasons.join(),
    /cert-missing/
  );
  assert.match(
    buyerReady({
      subject: 'wl-1',
      sha,
      receipts: [...holdouts, control, { ...own, walkSubject: null }],
      cert,
      now,
    }).reasons.join(),
    /no-own-walk/
  );
  assert.match(
    buyerReady({
      subject: 'wl-1',
      sha,
      receipts: [...holdouts, { ...control, verdict: 'pay' }, own],
      cert,
      now,
    }).reasons.join(),
    /control-said-pay/
  );
  assert.match(
    buyerReady({
      subject: 'wl-1',
      sha,
      receipts: [holdouts[0], positive, control, own],
      cert,
      now,
    }).reasons.join(),
    /calibration-insufficient/
  );
  assert.match(
    buyerReady({
      subject: 'wl-1',
      sha,
      receipts: [...holdouts, control, own],
      cert,
      now: now + 5 * 86_400_000,
    }).reasons.join(),
    /stale/
  );
});
