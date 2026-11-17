import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { passingGateInput } from './fixtures/deck.mjs';
import { gateDecision } from './gate.mjs';

test('gate fails closed', () => {
  const { build, evalReport, now } = passingGateInput();
  assert.deepEqual(gateDecision({ build, evalReport, now }), {
    open: true,
    reasons: [],
  });
  assert.equal(
    gateDecision({ build: { ...build, deckSha256: 'zzz' }, evalReport }).open,
    false
  );
  assert.equal(
    gateDecision({ build, evalReport: { ...evalReport, yes: 3 } }).open,
    false
  );
  assert.equal(
    gateDecision({ build, evalReport: { ...evalReport, calibration: null } })
      .open,
    false
  );
  assert.match(
    gateDecision({
      build,
      evalReport: {
        ...evalReport,
        calibration: { ok: false, unseparated: ['x', 'y'] },
      },
    }).reasons.join(),
    /calibration failed/u
  );
  assert.equal(gateDecision({ build, evalReport: null }).open, false);
});

test('gate rejects noninteger or out-of-range thresholds', () => {
  const input = passingGateInput();
  assert.equal(gateDecision(input).open, true);
  for (const threshold of [NaN, Infinity, -1, 0, 1.5, 7, '4', null]) {
    assert.equal(
      gateDecision({ ...input, threshold: /** @type {number} */ (threshold) })
        .open,
      false,
      String(threshold)
    );
  }
});

test('gate requires a valid vote count that agrees with the six persona results', () => {
  const input = passingGateInput();
  for (const yes of [undefined, NaN, Infinity, -1, 1.5, 7, '4', 6]) {
    assert.equal(
      gateDecision({ ...input, evalReport: { ...input.evalReport, yes } }).open,
      false,
      String(yes)
    );
  }
  for (const personas of [
    undefined,
    [],
    {},
    Array(6).fill(input.evalReport.personas[0]),
  ]) {
    assert.equal(
      gateDecision({ ...input, evalReport: { ...input.evalReport, personas } })
        .open,
      false
    );
  }
});

test('gate rejects malformed build/calibration receipts and future evaluations without throwing', () => {
  const input = passingGateInput();
  for (const build of [
    {},
    { deckSha256: 'synthetic' },
    { issues: [], deckSha256: '' },
  ]) {
    assert.equal(gateDecision({ ...input, build }).open, false);
  }
  for (const calibration of [{ ok: 'yes' }, { ok: false }, {}]) {
    assert.equal(
      gateDecision({
        ...input,
        evalReport: { ...input.evalReport, calibration },
      }).open,
      false
    );
  }
  for (const at of ['invalid', '2026-11-06T21:00:00Z']) {
    assert.equal(
      gateDecision({ ...input, evalReport: { ...input.evalReport, at } }).open,
      false
    );
  }
});

test('deck binding rejects changed rendered HTML or evaluation text at the gate CLI', t => {
  const dir = mkdtempSync(join(tmpdir(), 'investor-binding-test-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const { build, evalReport } = passingGateInput();
  const html = '<p>Synthetic investor deck</p>';
  const text = 'Synthetic investor deck';
  const digest = value => createHash('sha256').update(value).digest('hex');
  build.deckSha256 = evalReport.deckSha256 = digest(html);
  build.deckTextSha256 = evalReport.deckTextSha256 = digest(text);
  evalReport.at = new Date().toISOString();
  writeFileSync(join(dir, 'build.json'), JSON.stringify(build));
  writeFileSync(join(dir, 'invest-eval.json'), JSON.stringify(evalReport));
  writeFileSync(join(dir, 'deck.html'), html);
  writeFileSync(join(dir, 'deck.txt'), text);
  const run = () =>
    spawnSync(
      process.execPath,
      [new URL('./gate.mjs', import.meta.url).pathname, '--deck', dir],
      { encoding: 'utf8' }
    );
  assert.equal(run().status, 0);
  writeFileSync(join(dir, 'deck.txt'), 'Different synthetic evaluation text');
  assert.equal(run().status, 1);
  const evaluation = spawnSync(
    process.execPath,
    [new URL('./eval.mjs', import.meta.url).pathname, '--deck', dir],
    { encoding: 'utf8', env: {} }
  );
  assert.equal(evaluation.status, 1);
  assert.match(evaluation.stderr, /evaluation text does not match/u);
  writeFileSync(join(dir, 'deck.txt'), text);
  writeFileSync(
    join(dir, 'deck.html'),
    '<p>Different synthetic rendered deck</p>'
  );
  assert.equal(run().status, 1);
});
