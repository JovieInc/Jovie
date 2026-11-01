import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import {
  claimsGate,
  designTokenGate,
  gateStatus,
  privacyGate,
  runGates,
} from './gates.mjs';
import {
  blockingFindings,
  checkLine,
  outputCheck,
  verdictFor,
} from './output-check.mjs';

const _answer = (over = {}) => ({
  first_impression: 'Fifty clocks.',
  mission_achieved: false,
  score: 30,
  top_issue: 'My own time is buried among 50.',
  single_change: 'Show only my local time, large.',
  harm_or_legal_risk: 'none',
  unsupported_or_contradictory_claims: [],
  other_issues: ['seconds are noise'],
  ...over,
});
const _reply = body => ({
  text: JSON.stringify(body),
  usage: { neurons: 1000 },
});
const textRender = async ({ ref, text }) => ({
  type: 'text',
  ref: ref ?? 'inline',
  sha256: 'f'.repeat(64),
  text: text ?? readFileSync(ref, 'utf8'),
  images: [],
});
const tmp = () => mkdtempSync(join(tmpdir(), 'oql-'));

test('design gate: tokens only, raw colors outside custom properties fail', () => {
  assert.deepEqual(
    designTokenGate(
      '<style>:root{--surface-0:#0b0b0d}@media (prefers-color-scheme: dark){}body{background:var(--surface-0)}</style>'
    ),
    []
  );
  const raw = designTokenGate(
    '<style>body{background:#fff;color:rgb(0,0,0)}</style>'
  );
  assert.equal(gateStatus(raw), 'fail');
  assert.ok(raw.some(f => /no design tokens/.test(f.message)));
  assert.ok(
    designTokenGate('<div style="color:#123456"></div>').some(f =>
      /raw color/.test(f.message)
    )
  );
});

test('claims gate: numbers need a ledger entry; external kinds block', () => {
  const ledger = { covered: new Set(['53m', '3.6m']) };
  assert.deepEqual(
    claimsGate('A fan video with 53M views', ledger, { external: true }),
    []
  );
  const out = claimsGate('70M streams and 3.6M views', ledger, {
    external: true,
  });
  assert.deepEqual(
    out.map(f => [f.severity, f.match]),
    [['block', '70M']]
  );
  assert.equal(
    claimsGate('70M streams', null, { external: false })[0].severity,
    'warn'
  );
  assert.deepEqual(claimsGate('no numbers here', null, { external: true }), []);
});

test('privacy gate blocks secrets and warns on personal contact data', () => {
  const out = privacyGate(
    'key ghp_abcdefghijklmnopqrstuvwxyz0123456789 mail jane@gmail.com, tim@jov.ie, call 415-555-0134'
  );
  assert.deepEqual(
    out.map(f => f.severity),
    ['block', 'warn', 'warn']
  );
});

test('runGates bundles every gate; output check combines gates and intent', async () => {
  const rendered = {
    type: 'text',
    ref: 'inline',
    sha256: 'a'.repeat(64),
    text: 'Thanks for the early delivery.',
    images: [],
  };
  const gates = await runGates({ rendered, kind: 'email', ledger: null });
  assert.deepEqual(
    gates.map(g => g.id),
    ['copy', 'slop', 'design', 'claims', 'privacy']
  );
  await assert.rejects(
    runGates({ rendered, kind: 'nope', ledger: null }),
    /unknown --kind/
  );
  assert.equal(verdictFor([{ status: 'pass' }], { verdict: 'pass' }), 'pass');
  assert.equal(verdictFor([{ status: 'fail' }], { verdict: 'pass' }), 'fail');
  assert.equal(verdictFor([], { verdict: 'abstain' }), 'abstain');
  const state = tmp();
  const { receipt } = await outputCheck({
    text: 'hi',
    kind: 'sms',
    mission: 'm',
    audience: 'a',
    state,
    mode: 'warn',
    render: textRender,
    loop: async () => ({
      runId: 'r1',
      verdict: 'fail',
      score: 40,
      passCount: 3,
      mission: 'm',
      final: { path: undefined, sha256: 'b'.repeat(64) },
      passes: [],
    }),
    gates: async () => [{ id: 'copy', status: 'pass', findings: [] }],
  });
  assert.equal(receipt.verdict, 'fail');
  assert.equal(receipt.blocking, false, 'warn mode never blocks');
  assert.match(
    checkLine(receipt),
    /^Output-check: jovie\.output-check\/v1 run=r1 verdict=fail mode=warn gates=copy:pass intent=fail\(40,3p\)/
  );
  assert.match(
    readFileSync(join(state, 'checks.jsonl'), 'utf8'),
    /"intentPasses":3/
  );
});

test('gate block findings become one-line reviser instructions', () => {
  assert.deepEqual(
    blockingFindings([
      {
        findings: [
          { severity: 'block', message: 'x', match: 'y' },
          { severity: 'warn', message: 'z' },
        ],
      },
      { findings: [{ severity: 'block', message: 'x', match: 'y' }] },
    ]),
    ['x [y]']
  );
});
