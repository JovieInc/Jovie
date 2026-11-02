import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  analyzePolicy,
  CONTROL_REGISTRY,
  cleanControlSnapshot,
  evaluate,
  RULES,
  runControls,
  vendorFor,
} from './privacy-rules.mjs';

const registry = JSON.parse(
  readFileSync(
    new URL('../../canon/privacy/tracker-registry.json', import.meta.url),
    'utf8'
  )
);

test('clean control snapshot passes every rule', () => {
  const fails = evaluate(cleanControlSnapshot(), CONTROL_REGISTRY).filter(
    r => r.status === 'fail'
  );
  assert.deepEqual(fails, []);
});

test('every rule has a seeded violation that fails it and only it', () => {
  const outcomes = runControls();
  assert.equal(outcomes.length, Object.keys(RULES).length + 1);
  for (const o of outcomes) assert.ok(o.ok, `${o.control}: ${o.detail}`);
});

test('controls catch a rule that stops biting', () => {
  // A broken evaluator that never fails anything must fail the controls.
  const outcomes = runControls(() => []);
  assert.ok(outcomes.filter(o => o.control !== 'clean').every(o => !o.ok));
});

test('analyzePolicy finds banned claims and named vendors in HTML', () => {
  const html =
    '<p>We don&#x27;t track you.</p><p>We use <b>Meta</b> pixels.</p>';
  const a = analyzePolicy(html, CONTROL_REGISTRY);
  assert.equal(a.banned_claim_hits.length, 1);
  assert.deepEqual(a.named_vendors, ['meta']);
});

test('registry: every vendor has an id, category, hosts and rationale', () => {
  const categories = new Set([
    'pixel',
    'analytics',
    'replay',
    'chat-widget',
    'ads',
    'processor',
    'content',
  ]);
  const ids = new Set();
  for (const v of registry.vendors) {
    assert.ok(v.id && !ids.has(v.id), `duplicate or missing id ${v.id}`);
    ids.add(v.id);
    assert.ok(
      categories.has(v.category),
      `${v.id}: bad category ${v.category}`
    );
    assert.ok(Array.isArray(v.hosts) && v.hosts.length, `${v.id}: no hosts`);
    assert.ok(
      v.rationale && v.approved,
      `${v.id}: needs rationale and approved date`
    );
  }
  for (const s of registry.surfaces) assert.match(s.url, /^https:\/\//);
});

test('vendorFor matches subdomains, not lookalikes', () => {
  const reg = { vendors: [{ id: 'meta', hosts: ['facebook.net'] }] };
  assert.equal(vendorFor('connect.facebook.net', reg)?.id, 'meta');
  assert.equal(vendorFor('evilfacebook.net', reg), null);
});

test('eu: a missing bar fails only where something consent-gated runs', () => {
  const snap = cleanControlSnapshot();
  snap.pages[3].consent_banner = { visible: false, accept: 0, reject: 0 };
  const fails = evaluate(snap, CONTROL_REGISTRY).filter(
    r => r.status === 'fail'
  );
  assert.deepEqual(
    fails.map(r => r.rule),
    ['eu-consent-first']
  );
  // Same page on a surface that loads nothing gated: no bar is owed.
  const quiet = cleanControlSnapshot();
  quiet.pages = quiet.pages.filter(
    p => p.surface !== 'home' || p.scenario === 'eu'
  );
  quiet.pages.find(p => p.scenario === 'eu').consent_banner = {
    visible: false,
    accept: 0,
    reject: 0,
  };
  quiet.pages.push({
    ...quiet.pages.find(p => p.scenario === 'eu'),
    scenario: 'us-default',
  });
  assert.equal(
    evaluate(quiet, CONTROL_REGISTRY).filter(
      r => r.rule === 'eu-consent-first' && r.status === 'fail'
    ).length,
    0
  );
});
