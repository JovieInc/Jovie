import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { createCua, runChannel } from '../../mac-dogfood.mjs';
import { SAFE_PRESS } from '../mac-dogfood.mjs';

const el = (role, label, token) => ({
  role,
  label,
  element_token: token ?? `t:${label}`,
});
const state = (title, elements) => ({ window_title: title, elements });
const SHA = 'a'.repeat(40);

test('the runner refuses to press anything outside the read-only allowlist', () => {
  const calls = [];
  const cua = createCua({ exec: (_b, args) => (calls.push(args), '{}') });
  const snap = {
    elements: [{ role: 'AXButton', label: 'Download', token: 't:1' }],
  };
  assert.throws(
    () => cua.press(1, snap, 'Download', 'AXButton'),
    /not read-only safe/
  );
  assert.throws(
    () => cua.press(1, snap, 'Restart To Update', 'AXButton'),
    /not read-only safe/
  );
  assert.equal(calls.length, 0);
  for (const bad of [
    'Download',
    'Restart To Update',
    'Approve',
    'Send Reply',
    'Add',
    'Cancel Sign-in',
  ])
    assert.equal(SAFE_PRESS.has(bad), false, bad);
});

test('runChannel drives a signed-out stable bundle end to end with a scripted driver', async () => {
  const stable = {
    channel: 'production',
    version: '26.10.16',
    sourceRevision: SHA,
    builtAt: '2026-10-24T11:14:14.284Z',
  };
  let page = 'finish';
  const pages = {
    finish: [
      el('AXHeading', 'Finish Signing In'),
      el('AXButton', 'Continue In Browser'),
      el('AXButton', 'Other Sign-in Options', 'opts'),
    ],
    options: [
      el('AXHeading', 'Finish Signing In'),
      el('AXButton', 'Continue In Browser'),
      el('AXButton', 'Copy Sign-in Link'),
      el('AXButton', 'Enter A Code'),
      el('AXButton', 'Scan With Phone'),
      el('AXButton', 'Other Sign-in Options', 'opts'),
    ],
  };
  const pressed = [];
  const exec = (_bin, [tool, json]) => {
    const a = JSON.parse(json);
    if (tool === 'launch_app') return JSON.stringify({ pid: 7, windows: [] });
    if (tool === 'list_windows')
      return JSON.stringify({
        windows: [
          { window_id: 9, bounds: { height: 650 }, is_on_screen: true },
        ],
      });
    if (tool === 'get_window_state')
      return JSON.stringify(state('Jovie', pages[page]));
    if (tool === 'click') {
      pressed.push(a.element_token);
      page = 'options';
      return '{}';
    }
    throw new Error(tool);
  };
  const out = mkdtempSync(path.join(os.tmpdir(), 'mac-dogfood-'));
  const run = await runChannel({
    channel: 'production',
    cua: createCua({ exec }),
    outDir: out,
    sleepMs: 0,
    fetchImpl: async () => ({
      ok: true,
      json: async () => ({
        commitSha: 'd'.repeat(40),
        environment: 'production',
        name: '26.10.16',
      }),
    }),
    readers: { identity: () => stable, readiness: () => null },
  });
  assert.equal(run.sessionKind, 'signed-out');
  assert.deepEqual(pressed, ['opts']);
  const by = id => run.receipts.find(r => r.mission.id === id);
  assert.equal(by('dogfood:mac-signin').receipt.outcome, 'passed');
  assert.equal(by('dogfood:mac-launch').receipt.outcome, 'passed');
  assert.equal(by('dogfood:mac-shell').receipt.outcome, 'blocked');
  assert.match(
    by('dogfood:mac-shell').receipt.blocker,
    /needs a signed-in session/
  );
  assert.equal(by('dogfood:mac-summer-turn').receipt.outcome, 'blocked');
});
