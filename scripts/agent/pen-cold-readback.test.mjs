import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  buildPenColdReadbackReceipt,
  evaluatePenPromotionClaim,
  exitCodeForPenColdReadback,
  exitCodeForPenPromotionClaim,
  mapPenCliFailure,
  PEN_COLD_READBACK_SCHEMA,
  PEN_PROMOTION_GATE_SCHEMA,
  parseComponentListing,
} from './pen-cold-readback-lib.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const CLI = join(HERE, 'pen-cold-readback.mjs');
const GATE = join(HERE, 'pen-promotion-gate.mjs');
const SHA_A = createHash('sha256').update('pen-bytes-a').digest('hex');
const SHA_B = createHash('sha256').update('pen-bytes-b').digest('hex');

function validInput(overrides = {}) {
  return {
    mode: 'canonical',
    workspaceProfile: 'jovie-founder-design-studio',
    targetPath: '/tmp/canonical.pen',
    fileSha256Before: SHA_A,
    fileSha256After: SHA_A,
    saveInvoked: false,
    components: [
      { id: 'co5mw', name: 'Header' },
      { id: 'dn0Es', name: 'Hero' },
    ],
    typedReasons: [],
    cliExitCode: 0,
    recordedAt: '2026-08-11T00:00:03.000Z',
    ...overrides,
  };
}

test('mapPenCliFailure maps known signatures to typed reasons', () => {
  assert.deepEqual(mapPenCliFailure('Error: Base URI must be absolute!'), [
    'scene_graph_base_uri_not_absolute',
  ]);
  assert.deepEqual(
    mapPenCliFailure(
      'Error loading scene graph: Error: Base URI must be absolute!'
    ),
    ['scene_graph_base_uri_not_absolute', 'scene_graph_load_failed']
  );
  assert.deepEqual(
    mapPenCliFailure(
      '[ERROR] Authentication required. Run "pen login" or set PEN_CLI_KEY.'
    ),
    ['auth_unavailable']
  );
  assert.deepEqual(mapPenCliFailure('Export bounding box is invalid'), [
    'export_bbox_invalid',
  ]);
  assert.deepEqual(mapPenCliFailure(''), []);
  assert.deepEqual(mapPenCliFailure('all good'), []);
});

test('parseComponentListing extracts, dedupes, and sorts id::name lines', () => {
  const components = parseComponentListing(
    'noise line\ndn0Es::Hero\nco5mw::Header\ndn0Es::Hero\nmore noise'
  );
  assert.deepEqual(components, [
    { id: 'co5mw', name: 'Header' },
    { id: 'dn0Es', name: 'Hero' },
  ]);
});

test('cold readback verifies only with unchanged bytes and a clean CLI run', () => {
  const receipt = buildPenColdReadbackReceipt(validInput());
  assert.equal(receipt.schema, PEN_COLD_READBACK_SCHEMA);
  assert.equal(receipt.verdict, 'cold_readback_verified');
  assert.equal(receipt.bytes_unchanged, true);
  assert.equal(receipt.component_count, 2);
  assert.equal(exitCodeForPenColdReadback(receipt), 0);
});

test('a byte change during readback blocks verification', () => {
  const receipt = buildPenColdReadbackReceipt(
    validInput({ fileSha256After: SHA_B })
  );
  assert.equal(receipt.verdict, 'cold_readback_failed');
  assert.deepEqual(
    receipt.blockers.map(blocker => blocker.code),
    ['bytes_changed_during_readback']
  );
});

test('typed CLI failures and nonzero exits block verification', () => {
  const receipt = buildPenColdReadbackReceipt(
    validInput({
      components: [],
      typedReasons: ['scene_graph_base_uri_not_absolute'],
      cliExitCode: 1,
    })
  );
  assert.equal(receipt.verdict, 'cold_readback_failed');
  assert.deepEqual(
    receipt.blockers.map(blocker => blocker.code),
    ['cli_failure']
  );

  const exitOnly = buildPenColdReadbackReceipt(validInput({ cliExitCode: 2 }));
  assert.deepEqual(
    exitOnly.blockers.map(blocker => blocker.code),
    ['cli_exit_nonzero']
  );
});

test('expected reusable components must be read back', () => {
  const receipt = buildPenColdReadbackReceipt(
    validInput({ expectedComponents: ['dn0Es', 'zz9za'] })
  );
  assert.equal(receipt.verdict, 'cold_readback_failed');
  assert.deepEqual(
    receipt.blockers.map(blocker => blocker.code),
    ['expected_component_missing']
  );
});

test('an Edited desktop title after a claimed save is a typed reason', () => {
  const receipt = buildPenColdReadbackReceipt(
    validInput({ desktopTitle: 'Jovie Design Studio — canonical — Edited' })
  );
  assert.equal(receipt.verdict, 'cold_readback_failed');
  assert.deepEqual(
    receipt.blockers.map(blocker => blocker.code),
    ['desktop_dirty_after_save']
  );

  const dirty = buildPenColdReadbackReceipt(
    validInput({ desktopDirtyState: 'dirty' })
  );
  assert.deepEqual(
    dirty.blockers.map(blocker => blocker.code),
    ['desktop_dirty_after_save']
  );
});

function saveReceipt(overrides = {}) {
  return {
    schema: 'pen-save-receipt/v1',
    verdict: 'saved_state_verified',
    expected_path: '/tmp/canonical.pen',
    explicit_save: { acknowledged_at: '2026-08-11T00:00:02.000Z' },
    blockers: [],
    ...overrides,
  };
}

test('promotion gate: cold round trip requires a verified cold readback after save', () => {
  const evaluation = evaluatePenPromotionClaim({
    saveReceipt: saveReceipt(),
    coldReadbackReceipt: buildPenColdReadbackReceipt(validInput()),
  });
  assert.equal(evaluation.schema, PEN_PROMOTION_GATE_SCHEMA);
  assert.equal(evaluation.claim, 'cold_round_trip_verified');
  assert.equal(exitCodeForPenPromotionClaim(evaluation), 0);
});

test('promotion gate: live-app readback alone can never claim a cold round trip', () => {
  const evaluation = evaluatePenPromotionClaim({
    saveReceipt: saveReceipt(),
    coldReadbackReceipt: null,
  });
  assert.equal(evaluation.claim, 'live_readback_only');
  assert.deepEqual(
    evaluation.reasons.map(reason => reason.code),
    ['cold_readback_receipt_missing']
  );
  assert.equal(exitCodeForPenPromotionClaim(evaluation), 1);
});

test('promotion gate: stale, fixture-only, and mismatched cold readbacks downgrade', () => {
  const stale = evaluatePenPromotionClaim({
    saveReceipt: saveReceipt(),
    coldReadbackReceipt: buildPenColdReadbackReceipt(
      validInput({ recordedAt: '2026-08-11T00:00:01.000Z' })
    ),
  });
  assert.equal(stale.claim, 'live_readback_only');
  assert.deepEqual(
    stale.reasons.map(reason => reason.code),
    ['cold_readback_stale']
  );

  const fixtureOnly = evaluatePenPromotionClaim({
    saveReceipt: saveReceipt(),
    coldReadbackReceipt: buildPenColdReadbackReceipt(
      validInput({ mode: 'fixture' })
    ),
  });
  assert.equal(fixtureOnly.claim, 'live_readback_only');
  assert.ok(
    fixtureOnly.reasons.some(
      reason => reason.code === 'cold_readback_fixture_only'
    )
  );

  const mismatched = evaluatePenPromotionClaim({
    saveReceipt: saveReceipt(),
    coldReadbackReceipt: buildPenColdReadbackReceipt(
      validInput({ targetPath: '/tmp/other.pen' })
    ),
  });
  assert.equal(mismatched.claim, 'live_readback_only');
  assert.ok(
    mismatched.reasons.some(
      reason => reason.code === 'cold_readback_path_mismatch'
    )
  );
});

test('promotion gate: a desktop left dirty after save surfaces the typed reason', () => {
  const evaluation = evaluatePenPromotionClaim({
    saveReceipt: saveReceipt({
      verdict: 'blocked',
      blockers: [
        { code: 'document_title_edited', message: 'Title still Edited.' },
      ],
    }),
    coldReadbackReceipt: buildPenColdReadbackReceipt(validInput()),
  });
  assert.equal(evaluation.claim, 'unverified');
  assert.deepEqual(
    evaluation.reasons.map(reason => reason.code),
    ['desktop_dirty_after_save']
  );
});

function makeStubPen(directory, script) {
  const stubPath = join(directory, 'pen-stub.mjs');
  writeFileSync(stubPath, script);
  chmodSync(stubPath, 0o755);
  return stubPath;
}

const STUB_OK = `#!/usr/bin/env node
let input = '';
process.stdin.on('data', chunk => (input += chunk));
process.stdin.on('end', () => {
  if (input.includes('save()')) process.exit(3);
  console.log('dn0Es::Hero');
  console.log('co5mw::Header');
  process.exit(0);
});
`;

function runCli(args) {
  return spawnSync(process.execPath, [CLI, ...args], { encoding: 'utf8' });
}

test('CLI verifies a fixture through a stub pen without mutating bytes', () => {
  const directory = mkdtempSync(join(tmpdir(), 'pen-cold-readback-test-'));
  try {
    const fixture = join(directory, 'fixture.pen');
    writeFileSync(fixture, '{"pen":"fixture"}');
    const stub = makeStubPen(directory, STUB_OK);
    const result = runCli([
      '--fixture',
      fixture,
      '--pen-bin',
      stub,
      '--expect-component',
      'dn0Es',
      '--recorded-at',
      '2026-08-11T00:00:03.000Z',
    ]);
    assert.equal(result.status, 0, result.stderr);
    const receipt = JSON.parse(result.stdout);
    assert.equal(receipt.verdict, 'cold_readback_verified');
    assert.equal(receipt.mode, 'fixture');
    assert.equal(receipt.component_count, 2);
    assert.equal(receipt.bytes_unchanged, true);
    assert.equal(receipt.save_invoked, false);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('CLI maps the Base URI scene-graph failure to a typed reason', () => {
  const directory = mkdtempSync(join(tmpdir(), 'pen-cold-readback-test-'));
  try {
    const fixture = join(directory, 'fixture.pen');
    writeFileSync(fixture, '{"pen":"fixture"}');
    const stub = makeStubPen(
      directory,
      `#!/usr/bin/env node
console.error('Error loading scene graph: Error: Base URI must be absolute!');
process.exit(1);
`
    );
    const result = runCli([
      '--fixture',
      fixture,
      '--pen-bin',
      stub,
      '--recorded-at',
      '2026-08-11T00:00:03.000Z',
    ]);
    assert.equal(result.status, 1, result.stderr);
    const receipt = JSON.parse(result.stdout);
    assert.equal(receipt.verdict, 'cold_readback_failed');
    assert.ok(
      receipt.typed_reasons.includes('scene_graph_base_uri_not_absolute')
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('CLI reports auth_unavailable and cli_unavailable as typed reasons', () => {
  const directory = mkdtempSync(join(tmpdir(), 'pen-cold-readback-test-'));
  try {
    const fixture = join(directory, 'fixture.pen');
    writeFileSync(fixture, '{"pen":"fixture"}');
    const authStub = makeStubPen(
      directory,
      `#!/usr/bin/env node
console.error('[ERROR] Authentication required. Run "pen login" or set PEN_CLI_KEY environment variable.');
process.exit(2);
`
    );
    const authResult = runCli([
      '--fixture',
      fixture,
      '--pen-bin',
      authStub,
      '--recorded-at',
      '2026-08-11T00:00:03.000Z',
    ]);
    assert.equal(authResult.status, 1, authResult.stderr);
    assert.ok(
      JSON.parse(authResult.stdout).typed_reasons.includes('auth_unavailable')
    );

    const missingResult = runCli([
      '--fixture',
      fixture,
      '--pen-bin',
      join(directory, 'does-not-exist'),
      '--recorded-at',
      '2026-08-11T00:00:03.000Z',
    ]);
    assert.equal(missingResult.status, 1, missingResult.stderr);
    assert.ok(
      JSON.parse(missingResult.stdout).typed_reasons.includes('cli_unavailable')
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('CLI rejects a non-absolute fixture path', () => {
  const result = runCli(['--fixture', 'relative/path.pen']);
  assert.equal(result.status, 2);
  assert.equal(JSON.parse(result.stdout).verdict, 'error');
});

test('gate CLI evaluates receipt files end to end', () => {
  const directory = mkdtempSync(join(tmpdir(), 'pen-promotion-gate-test-'));
  try {
    const savePath = join(directory, 'save.json');
    const coldPath = join(directory, 'cold.json');
    writeFileSync(savePath, JSON.stringify(saveReceipt()));
    writeFileSync(
      coldPath,
      JSON.stringify(buildPenColdReadbackReceipt(validInput()))
    );

    const verified = spawnSync(
      process.execPath,
      [GATE, '--save-receipt', savePath, '--cold-readback-receipt', coldPath],
      { encoding: 'utf8' }
    );
    assert.equal(verified.status, 0, verified.stderr);
    assert.equal(JSON.parse(verified.stdout).claim, 'cold_round_trip_verified');

    const liveOnly = spawnSync(
      process.execPath,
      [GATE, '--save-receipt', savePath],
      { encoding: 'utf8' }
    );
    assert.equal(liveOnly.status, 1, liveOnly.stderr);
    assert.equal(JSON.parse(liveOnly.stdout).claim, 'live_readback_only');
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('gate CLI exits 2 with JSON for malformed arguments', () => {
  const result = spawnSync(process.execPath, [GATE], { encoding: 'utf8' });
  assert.equal(result.status, 2);
  assert.equal(JSON.parse(result.stdout).claim, 'error');
});
