import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  buildPenColdReadbackReceipt,
  evaluatePenPromotionClaim,
  exitCodeForPenColdReadback,
  exitCodeForPenPromotionClaim,
  PEN_COLD_READBACK_SCHEMA,
  PEN_PROMOTION_GATE_SCHEMA,
  SAFE_COLD_MANIFEST_REASON,
} from './pen-cold-readback-lib.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const CLI = join(HERE, 'pen-cold-readback.mjs');
const GATE = join(HERE, 'pen-promotion-gate.mjs');
const CANONICAL_PATH = join(
  homedir(),
  'Documents/Jovie/Jovie Marketing Workspace/Jovie Design Studio — canonical.pen'
);

function unavailableInput(overrides = {}) {
  return {
    workspaceProfile: 'jovie-founder-design-studio',
    targetPath: CANONICAL_PATH,
    recordedAt: '2026-08-11T05:30:00.000Z',
    executeInvoked: false,
    saveInvoked: false,
    documentOpened: false,
    outputDocumentCreated: false,
    ...overrides,
  };
}

function saveReceipt(overrides = {}) {
  return {
    schema: 'pen-save-receipt/v1',
    verdict: 'saved_state_verified',
    expected_path: CANONICAL_PATH,
    explicit_save: { acknowledged_at: '2026-08-11T05:29:00.000Z' },
    blockers: [],
    ...overrides,
  };
}

function runCli(args, options = {}) {
  return spawnSync(process.execPath, [CLI, ...args], {
    encoding: 'utf8',
    ...options,
  });
}

test('unavailable inspector emits the exact fail-closed receipt', () => {
  const receipt = buildPenColdReadbackReceipt(unavailableInput());

  assert.equal(receipt.schema, PEN_COLD_READBACK_SCHEMA);
  assert.equal(receipt.verdict, 'cold_readback_failed');
  assert.deepEqual(receipt.typed_reasons, [SAFE_COLD_MANIFEST_REASON]);
  assert.equal(receipt.semantic_manifest, null);
  assert.equal(receipt.semantic_manifest_complete, false);
  assert.equal(receipt.inspection_method, null);
  assert.equal(receipt.execute_invoked, false);
  assert.equal(receipt.save_invoked, false);
  assert.equal(receipt.document_opened, false);
  assert.equal(receipt.output_document_created, false);
  assert.equal(receipt.durability, 'not_proven');
  assert.equal(receipt.exit_code, 1);
  assert.deepEqual(
    receipt.blockers.map(blocker => blocker.code),
    [SAFE_COLD_MANIFEST_REASON]
  );
  assert.equal(exitCodeForPenColdReadback(receipt), 1);
});

test('invalid identity facts cannot remove the unavailable-inspector blocker', () => {
  const receipt = buildPenColdReadbackReceipt({
    workspaceProfile: '',
    targetPath: 'relative.pen',
    recordedAt: 'not-a-time',
  });

  assert.equal(receipt.verdict, 'cold_readback_failed');
  assert.deepEqual(receipt.typed_reasons, [SAFE_COLD_MANIFEST_REASON]);
  assert.deepEqual(
    receipt.blockers.map(blocker => blocker.code),
    [
      SAFE_COLD_MANIFEST_REASON,
      'workspace_profile_missing',
      'target_path_invalid',
      'recorded_at_invalid',
    ]
  );
});

test('any reported document activity is a second hard blocker', () => {
  const receipt = buildPenColdReadbackReceipt(
    unavailableInput({
      executeInvoked: true,
      saveInvoked: true,
      documentOpened: true,
      outputDocumentCreated: true,
    })
  );

  assert.equal(receipt.execute_invoked, true);
  assert.equal(receipt.save_invoked, true);
  assert.equal(receipt.document_opened, true);
  assert.equal(receipt.output_document_created, true);
  assert.ok(
    receipt.blockers.some(
      blocker => blocker.code === 'forbidden_cold_readback_activity'
    )
  );
});

test('CLI source has no Pen launch or document-read capability', () => {
  const source = readFileSync(CLI, 'utf8');

  assert.doesNotMatch(source, /node:child_process|spawnSync/);
  assert.doesNotMatch(source, /\binteractive\b/);
  assert.doesNotMatch(source, /\bexecute\s*\(/);
  assert.doesNotMatch(source, /\bsave\s*\(/);
  assert.doesNotMatch(
    source,
    /openSync|realpathSync|statSync|fstatSync|createHash/
  );
});

test('CLI emits the exact contract with no executable search path', () => {
  const result = runCli(
    [
      '--profile',
      'jovie-founder-design-studio',
      '--recorded-at',
      '2026-08-11T05:30:00.000Z',
    ],
    { env: { ...process.env, PATH: '' } }
  );

  assert.equal(result.status, 1, result.stderr);
  const receipt = JSON.parse(result.stdout);
  assert.equal(receipt.target_path, CANONICAL_PATH);
  assert.equal(receipt.verdict, 'cold_readback_failed');
  assert.deepEqual(receipt.typed_reasons, [SAFE_COLD_MANIFEST_REASON]);
  assert.equal(receipt.semantic_manifest, null);
  assert.equal(receipt.semantic_manifest_complete, false);
  assert.equal(receipt.inspection_method, null);
  assert.equal(receipt.execute_invoked, false);
  assert.equal(receipt.save_invoked, false);
  assert.equal(receipt.document_opened, false);
  assert.equal(receipt.output_document_created, false);
  assert.equal(receipt.durability, 'not_proven');
  assert.equal(receipt.exit_code, 1);
});

test('CLI rejects every former target-opening argument before target access', () => {
  for (const args of [
    ['--fixture', '/tmp/never-read.pen'],
    ['--pen-bin', '/tmp/never-run'],
    ['--manifest', '/tmp/never-read.json'],
    ['--timeout-ms', '1000'],
    ['--expect-component', 'dn0Es'],
    ['--desktop-title', 'Edited'],
    ['--desktop-dirty-state', 'unknown'],
    ['--no-probe'],
  ]) {
    const result = runCli(args);
    assert.equal(result.status, 2, `${args[0]}: ${result.stderr}`);
    const receipt = JSON.parse(result.stdout);
    assert.equal(receipt.verdict, 'error');
    assert.equal(receipt.exit_code, 2);
    assert.match(receipt.error, /is prohibited/);
  }
});

test('CLI requires a versioned workspace profile', () => {
  const missing = runCli([]);
  assert.equal(missing.status, 2);
  assert.match(JSON.parse(missing.stdout).error, /--profile is required/);

  const unknown = runCli(['--profile', 'unknown-profile']);
  assert.equal(unknown.status, 2);
  assert.match(
    JSON.parse(unknown.stdout).error,
    /Unknown Pen workspace profile/
  );
});

test('promotion remains live_readback_only for the unavailable receipt', () => {
  const evaluation = evaluatePenPromotionClaim({
    saveReceipt: saveReceipt(),
    coldReadbackReceipt: buildPenColdReadbackReceipt(unavailableInput()),
  });

  assert.equal(evaluation.schema, PEN_PROMOTION_GATE_SCHEMA);
  assert.equal(evaluation.claim, 'live_readback_only');
  assert.deepEqual(
    evaluation.reasons.map(reason => reason.code),
    [SAFE_COLD_MANIFEST_REASON]
  );
  assert.equal(exitCodeForPenPromotionClaim(evaluation), 1);
});

test('a forged verified cold receipt still cannot promote', () => {
  const forged = {
    ...buildPenColdReadbackReceipt(unavailableInput()),
    verdict: 'cold_readback_verified',
    typed_reasons: [],
    semantic_manifest: { roots: [{ id: 'ocKLh' }] },
    semantic_manifest_complete: true,
    inspection_method: 'invented-inspector',
    exit_code: 0,
    blockers: [],
  };
  const evaluation = evaluatePenPromotionClaim({
    saveReceipt: saveReceipt(),
    coldReadbackReceipt: forged,
  });

  assert.equal(evaluation.claim, 'live_readback_only');
  assert.deepEqual(
    evaluation.reasons.map(reason => reason.code),
    [SAFE_COLD_MANIFEST_REASON]
  );
  assert.equal(exitCodeForPenPromotionClaim(evaluation), 1);
});

test('missing and legacy cold receipts preserve live_readback_only', () => {
  const missing = evaluatePenPromotionClaim({
    saveReceipt: saveReceipt(),
    coldReadbackReceipt: null,
  });
  assert.equal(missing.claim, 'live_readback_only');
  assert.deepEqual(
    missing.reasons.map(reason => reason.code),
    ['cold_readback_receipt_missing']
  );

  const legacy = evaluatePenPromotionClaim({
    saveReceipt: saveReceipt(),
    coldReadbackReceipt: {
      schema: 'pen-cold-readback/v1',
      verdict: 'cold_readback_verified',
      components: [{ id: 'dn0Es', name: 'Hero' }],
    },
  });
  assert.equal(legacy.claim, 'live_readback_only');
  assert.deepEqual(
    legacy.reasons.map(reason => reason.code),
    ['partial_component_evidence']
  );
});

test('an invalid save receipt remains unverified', () => {
  const evaluation = evaluatePenPromotionClaim({
    saveReceipt: saveReceipt({
      verdict: 'blocked',
      blockers: [
        { code: 'document_title_edited', message: 'Title still Edited.' },
      ],
    }),
    coldReadbackReceipt: buildPenColdReadbackReceipt(unavailableInput()),
  });

  assert.equal(evaluation.claim, 'unverified');
  assert.deepEqual(
    evaluation.reasons.map(reason => reason.code),
    ['desktop_dirty_after_save']
  );

  const wrongSchema = evaluatePenPromotionClaim({
    saveReceipt: saveReceipt({ schema: 'invented-save-receipt/v1' }),
    coldReadbackReceipt: buildPenColdReadbackReceipt(unavailableInput()),
  });
  assert.equal(wrongSchema.claim, 'unverified');
  assert.deepEqual(
    wrongSchema.reasons.map(reason => reason.code),
    ['save_receipt_invalid']
  );

  const forgedPassingVerdict = evaluatePenPromotionClaim({
    saveReceipt: saveReceipt({
      blockers: [{ code: 'dirty_or_unknown', message: 'Dirty state unknown.' }],
    }),
    coldReadbackReceipt: buildPenColdReadbackReceipt(unavailableInput()),
  });
  assert.equal(forgedPassingVerdict.claim, 'unverified');
  assert.deepEqual(
    forgedPassingVerdict.reasons.map(reason => reason.code),
    ['desktop_dirty_after_save']
  );
});

test('path and chronology mismatches remain explicit', () => {
  const evaluation = evaluatePenPromotionClaim({
    saveReceipt: saveReceipt(),
    coldReadbackReceipt: buildPenColdReadbackReceipt(
      unavailableInput({
        targetPath: '/tmp/other.pen',
        recordedAt: '2026-08-11T05:28:00.000Z',
      })
    ),
  });

  assert.equal(evaluation.claim, 'live_readback_only');
  assert.deepEqual(
    evaluation.reasons.map(reason => reason.code),
    [
      SAFE_COLD_MANIFEST_REASON,
      'cold_readback_path_mismatch',
      'cold_readback_stale',
    ]
  );
});

test('promotion CLI evaluates JSON receipts without Pen access', () => {
  const directory = mkdtempSync(join(tmpdir(), 'pen-promotion-gate-test-'));
  try {
    const savePath = join(directory, 'save.json');
    const coldPath = join(directory, 'cold.json');
    writeFileSync(savePath, JSON.stringify(saveReceipt()));
    writeFileSync(
      coldPath,
      JSON.stringify(buildPenColdReadbackReceipt(unavailableInput()))
    );

    const result = spawnSync(
      process.execPath,
      [GATE, '--save-receipt', savePath, '--cold-readback-receipt', coldPath],
      { encoding: 'utf8', env: { ...process.env, PATH: '' } }
    );
    assert.equal(result.status, 1, result.stderr);
    const evaluation = JSON.parse(result.stdout);
    assert.equal(evaluation.claim, 'live_readback_only');
    assert.deepEqual(
      evaluation.reasons.map(reason => reason.code),
      [SAFE_COLD_MANIFEST_REASON]
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('promotion CLI exits 2 with JSON for malformed arguments', () => {
  const result = spawnSync(process.execPath, [GATE], { encoding: 'utf8' });
  assert.equal(result.status, 2);
  assert.equal(JSON.parse(result.stdout).claim, 'error');
});
