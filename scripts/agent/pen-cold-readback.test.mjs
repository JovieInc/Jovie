import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  linkSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
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
  const digest = 'a'.repeat(64);
  return {
    schema: 'pen-save-receipt/v1',
    workspace_profile: 'jovie-founder-design-studio',
    expected_path: CANONICAL_PATH,
    active_path_before: CANONICAL_PATH,
    active_path_after: CANONICAL_PATH,
    document_title: 'Jovie Design Studio — canonical',
    writer: 'exclusive-codex-writer',
    mutation_batch_id: 'batch-20260811T052700Z',
    root_ids: ['ocKLh'],
    mutation_state: 'confirmed',
    explicit_save: {
      method: 'Cmd-S',
      requested_at: '2026-08-11T05:28:00.000Z',
      acknowledged_at: '2026-08-11T05:29:00.000Z',
      acknowledged: true,
    },
    dirty_state: 'clean',
    post_save_readback_at: '2026-08-11T05:29:30.000Z',
    post_save_readback_verified: true,
    batch_started_at: '2026-08-11T05:27:00.000Z',
    backup_path: null,
    evidence: {
      pre_app_state_sha256: digest,
      post_app_state_sha256: digest,
      window_state_sha256: digest,
      save_response_sha256: digest,
      readback_sha256: digest,
    },
    recorded_at: '2026-08-11T05:30:00.000Z',
    verdict: 'saved_state_verified',
    durability: 'not_proven',
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

function runGate(args, options = {}) {
  return spawnSync(process.execPath, [GATE, ...args], {
    encoding: 'utf8',
    ...options,
  });
}

function evaluatePromotion(input) {
  return evaluatePenPromotionClaim({
    lockedExpectedPath: CANONICAL_PATH,
    ...input,
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

test('any reported document activity produces a distinct truthful error receipt', () => {
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
  assert.equal(receipt.verdict, 'error');
  assert.deepEqual(receipt.typed_reasons, ['forbidden_cold_readback_activity']);
  assert.equal(receipt.exit_code, 2);
  assert.equal(exitCodeForPenColdReadback(receipt), 2);
  assert.deepEqual(
    receipt.blockers.map(blocker => blocker.code),
    ['forbidden_cold_readback_activity']
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

test('CLI rejects an invalid recorded-at argument as malformed invocation', () => {
  const result = runCli([
    '--profile',
    'jovie-founder-design-studio',
    '--recorded-at',
    'not-a-time',
  ]);

  assert.equal(result.status, 2, result.stderr);
  const receipt = JSON.parse(result.stdout);
  assert.equal(receipt.verdict, 'error');
  assert.equal(receipt.exit_code, 2);
  assert.match(receipt.error, /--recorded-at must be a valid timestamp/);
});

test('help is an explicit non-gate exit-zero exception with non-JSON output', () => {
  for (const command of [CLI, GATE]) {
    const result = spawnSync(process.execPath, [command, '--help'], {
      encoding: 'utf8',
    });
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /^Usage:/);
    assert.throws(() => JSON.parse(result.stdout));
  }
});

test('promotion remains live_readback_only for the unavailable receipt', () => {
  const evaluation = evaluatePromotion({
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
  const evaluation = evaluatePromotion({
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

test('empty v2 and legacy inventories can never promote', () => {
  const emptyV2 = evaluatePromotion({
    saveReceipt: saveReceipt(),
    coldReadbackReceipt: {
      ...buildPenColdReadbackReceipt(unavailableInput()),
      verdict: 'cold_readback_verified',
      typed_reasons: [],
      semantic_manifest: { roots: [] },
      semantic_manifest_complete: true,
      inspection_method: 'invented-inspector',
      exit_code: 0,
      blockers: [],
    },
  });
  assert.equal(emptyV2.claim, 'live_readback_only');
  assert.notEqual(emptyV2.claim, 'cold_round_trip_verified');
  assert.equal(exitCodeForPenPromotionClaim(emptyV2), 1);

  const emptyLegacy = evaluatePromotion({
    saveReceipt: saveReceipt(),
    coldReadbackReceipt: {
      schema: 'pen-cold-readback/v1',
      verdict: 'cold_readback_verified',
      components: [],
    },
  });
  assert.equal(emptyLegacy.claim, 'live_readback_only');
  assert.notEqual(emptyLegacy.claim, 'cold_round_trip_verified');
  assert.equal(exitCodeForPenPromotionClaim(emptyLegacy), 1);
});

test('missing and legacy cold receipts preserve live_readback_only', () => {
  const missing = evaluatePromotion({
    saveReceipt: saveReceipt(),
    coldReadbackReceipt: null,
  });
  assert.equal(missing.claim, 'live_readback_only');
  assert.deepEqual(
    missing.reasons.map(reason => reason.code),
    ['cold_readback_receipt_missing']
  );

  const legacy = evaluatePromotion({
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
  const evaluation = evaluatePromotion({
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

  const wrongSchema = evaluatePromotion({
    saveReceipt: saveReceipt({ schema: 'invented-save-receipt/v1' }),
    coldReadbackReceipt: buildPenColdReadbackReceipt(unavailableInput()),
  });
  assert.equal(wrongSchema.claim, 'unverified');
  assert.deepEqual(
    wrongSchema.reasons.map(reason => reason.code),
    ['save_receipt_invalid']
  );

  const forgedPassingVerdict = evaluatePromotion({
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

  const forgedMinimal = evaluatePromotion({
    saveReceipt: {
      schema: 'pen-save-receipt/v1',
      verdict: 'saved_state_verified',
    },
    coldReadbackReceipt: buildPenColdReadbackReceipt(unavailableInput()),
  });
  assert.equal(forgedMinimal.claim, 'unverified');
  assert.deepEqual(
    forgedMinimal.reasons.map(reason => reason.code),
    ['save_receipt_invalid']
  );
  assert.equal(exitCodeForPenPromotionClaim(forgedMinimal), 1);

  const forgedWrongLock = evaluatePromotion({
    saveReceipt: saveReceipt({
      expected_path: '/tmp/forged.pen',
      active_path_before: '/tmp/forged.pen',
      active_path_after: '/tmp/forged.pen',
    }),
  });
  assert.equal(forgedWrongLock.claim, 'unverified');
  assert.deepEqual(
    forgedWrongLock.reasons.map(reason => reason.code),
    ['save_receipt_invalid']
  );
  assert.equal(exitCodeForPenPromotionClaim(forgedWrongLock), 1);
});

test('copied save blockers are bounded in count and message length', () => {
  const evaluation = evaluatePromotion({
    saveReceipt: saveReceipt({
      verdict: 'blocked',
      blockers: Array.from({ length: 40 }, (_, index) => ({
        code: `blocker-${index}`,
        message: 'x'.repeat(2_000),
      })),
    }),
  });

  assert.equal(evaluation.claim, 'unverified');
  assert.equal(evaluation.reasons.length, 33);
  assert.equal(
    evaluation.reasons.at(-1).code,
    'save_receipt_blockers_truncated'
  );
  assert.ok(
    evaluation.reasons
      .slice(0, -1)
      .every(reason => reason.message.length <= 512)
  );
});

test('path and chronology mismatches remain explicit', () => {
  const evaluation = evaluatePromotion({
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

test('promotion CLI rejects symlink, hardlink, and oversized JSON receipts', () => {
  const directory = mkdtempSync(join(tmpdir(), 'pen-promotion-loader-test-'));
  try {
    const symlinkTarget = join(directory, 'symlink-target.json');
    const symlinkPath = join(directory, 'symlink.json');
    writeFileSync(symlinkTarget, JSON.stringify(saveReceipt()));
    symlinkSync(symlinkTarget, symlinkPath);

    const symlinkResult = runGate(['--save-receipt', symlinkPath]);
    assert.equal(symlinkResult.status, 2, symlinkResult.stderr);
    assert.match(JSON.parse(symlinkResult.stdout).error, /symbolic link/);

    const hardlinkTarget = join(directory, 'hardlink-target.json');
    const hardlinkPath = join(directory, 'hardlink.json');
    writeFileSync(hardlinkTarget, JSON.stringify(saveReceipt()));
    linkSync(hardlinkTarget, hardlinkPath);

    const hardlinkResult = runGate(['--save-receipt', hardlinkPath]);
    assert.equal(hardlinkResult.status, 2, hardlinkResult.stderr);
    assert.match(JSON.parse(hardlinkResult.stdout).error, /single-link/);

    const oversizedPath = join(directory, 'oversized.json');
    writeFileSync(oversizedPath, Buffer.alloc(1_000_001, 0x20));

    const oversizedResult = runGate(['--save-receipt', oversizedPath]);
    assert.equal(oversizedResult.status, 2, oversizedResult.stderr);
    assert.match(
      JSON.parse(oversizedResult.stdout).error,
      /no larger than 1 MB/
    );

    const directoryPath = join(directory, 'directory.json');
    mkdirSync(directoryPath);

    const directoryResult = runGate(['--save-receipt', directoryPath]);
    assert.equal(directoryResult.status, 2, directoryResult.stderr);
    assert.match(JSON.parse(directoryResult.stdout).error, /regular file/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('promotion CLI exits 2 with JSON for malformed arguments', () => {
  const result = spawnSync(process.execPath, [GATE], { encoding: 'utf8' });
  assert.equal(result.status, 2);
  assert.equal(JSON.parse(result.stdout).claim, 'error');
});
