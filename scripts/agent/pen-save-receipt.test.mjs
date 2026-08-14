import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { linkSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  buildPenSaveReceipt,
  exitCodeForPenSaveReceipt,
  isProtectedPenEvidencePath,
  matchesProtectedFileIdentity,
  PEN_SAVE_RECEIPT_SCHEMA,
} from './pen-save-receipt-lib.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const CLI = join(HERE, 'pen-save-receipt.mjs');
const CANONICAL = join(
  homedir(),
  'Documents/Jovie/Jovie Marketing Workspace/Jovie Design Studio — canonical.pen'
);
const DAILY = join(
  homedir(),
  'Documents/Jovie/Jovie Marketing Workspace/Jovie Design Studio — daily.pen'
);

function evidence(content) {
  return {
    content,
    sha256: createHash('sha256').update(content).digest('hex'),
  };
}

function validInput(overrides = {}) {
  return {
    workspaceProfile: 'jovie-founder-design-studio',
    lockedExpectedPath: CANONICAL,
    activePathBefore: CANONICAL,
    activePathAfter: CANONICAL,
    documentTitle: 'Jovie Design Studio — canonical',
    writer: 'agent-veronica',
    batchId: 'header-candidates-04',
    rootIds: ['dn0Es', 'co5mw'],
    batchStartedAt: '2026-08-10T21:46:59.000Z',
    mutationState: 'confirmed',
    saveMethod: 'Cmd-S',
    saveRequestedAt: '2026-08-10T21:47:00.000Z',
    saveAcknowledgedAt: '2026-08-10T21:47:01.000Z',
    saveAcknowledged: true,
    dirtyState: 'clean',
    postReadbackAt: '2026-08-10T21:47:02.000Z',
    readbackVerified: true,
    recordedAt: '2026-08-10T21:47:03.000Z',
    evidence: {
      preAppState: evidence(`active canvas: ${CANONICAL}`),
      postAppState: evidence(`active canvas: ${CANONICAL}`),
      windowState: evidence('Jovie Design Studio — canonical'),
      saveResponse: evidence('save-document acknowledged'),
      readback: evidence('{"roots":["dn0Es","co5mw"]}'),
    },
    ...overrides,
  };
}

test('emits saved_state_verified only for a complete profile-locked receipt', () => {
  const receipt = buildPenSaveReceipt(validInput());
  assert.equal(receipt.schema, PEN_SAVE_RECEIPT_SCHEMA);
  assert.equal(receipt.verdict, 'saved_state_verified');
  assert.equal(receipt.durability, 'not_proven');
  assert.deepEqual(receipt.blockers, []);
  assert.equal(exitCodeForPenSaveReceipt(receipt), 0);
});

test('regression: daily side file blocks the pinned canonical profile', () => {
  const receipt = buildPenSaveReceipt(
    validInput({
      activePathBefore: DAILY,
      activePathAfter: DAILY,
      evidence: {
        ...validInput().evidence,
        preAppState: evidence(`active canvas: ${DAILY}`),
        postAppState: evidence(`active canvas: ${DAILY}`),
      },
    })
  );
  assert.equal(receipt.verdict, 'blocked');
  assert.deepEqual(
    receipt.blockers.map(blocker => blocker.code),
    [
      'path_mismatch_before',
      'path_mismatch_after',
      'pre_app_state_path_unbound',
      'post_app_state_path_unbound',
    ]
  );
});

test('an Edited title and unknown dirty state both block', () => {
  const receipt = buildPenSaveReceipt(
    validInput({
      documentTitle: 'Jovie Design Studio — canonical — Edited',
      dirtyState: 'unknown',
    })
  );
  assert.deepEqual(
    receipt.blockers.map(blocker => blocker.code),
    ['document_title_edited', 'dirty_or_unknown', 'window_title_unbound']
  );
});

test('a timeout is unknown and cannot be retried as a verified mutation', () => {
  const receipt = buildPenSaveReceipt(validInput({ mutationState: 'unknown' }));
  assert.equal(receipt.verdict, 'blocked');
  assert.equal(receipt.blockers[0].code, 'mutation_unknown');
});

test('autosave and Save As cannot pass as explicit save methods', () => {
  for (const saveMethod of ['autosave', 'Save As', '']) {
    const receipt = buildPenSaveReceipt(validInput({ saveMethod }));
    assert.equal(receipt.verdict, 'blocked');
    assert.equal(receipt.blockers[0].code, 'save_method_invalid');
  }
});

test('CLI save() is a valid explicit save method', () => {
  const receipt = buildPenSaveReceipt(
    validInput({
      saveMethod: 'save()',
      evidence: {
        ...validInput().evidence,
        saveResponse: evidence('Saved'),
      },
    })
  );
  assert.equal(receipt.verdict, 'saved_state_verified');
  assert.equal(receipt.explicit_save.method, 'save()');
});

test('save acknowledgment and root readback are mandatory', () => {
  const receipt = buildPenSaveReceipt(
    validInput({ saveAcknowledged: false, readbackVerified: false })
  );
  assert.deepEqual(
    receipt.blockers.map(blocker => blocker.code),
    ['save_not_acknowledged', 'readback_unverified']
  );
});

test('readback evidence must contain every supplied root', () => {
  const receipt = buildPenSaveReceipt(
    validInput({
      evidence: {
        ...validInput().evidence,
        readback: evidence('{"roots":["dn0Es"]}'),
      },
    })
  );
  assert.equal(receipt.blockers[0].code, 'readback_root_unbound');
});

test('receipt chronology must include readback and be monotonic', () => {
  const receipt = buildPenSaveReceipt(
    validInput({ recordedAt: '2026-08-10T21:47:01.500Z' })
  );
  assert.equal(receipt.blockers[0].code, 'chronology_invalid');
});

test('direct and symlink-resolved Pen evidence paths are rejected without reading them', () => {
  const catalog = join(
    homedir(),
    'Documents/Jovie/Jovie Marketing Workspace/Jovie Marketing Workspace.pen'
  );
  assert.equal(
    isProtectedPenEvidencePath(CANONICAL, CANONICAL, [CANONICAL, catalog]),
    true
  );
  assert.equal(
    isProtectedPenEvidencePath('/tmp/evidence.json', CANONICAL, [
      CANONICAL,
      catalog,
    ]),
    true
  );
  assert.equal(
    isProtectedPenEvidencePath(catalog, catalog, [CANONICAL, catalog]),
    true
  );
  assert.equal(
    isProtectedPenEvidencePath('/tmp/evidence.json', '/tmp/evidence.json', [
      CANONICAL,
      catalog,
    ]),
    false
  );
  assert.equal(
    matchesProtectedFileIdentity({ dev: 10, ino: 20 }, [
      { dev: 10, ino: 20 },
      { dev: 10, ino: 21 },
    ]),
    true
  );
  assert.equal(
    matchesProtectedFileIdentity({ dev: 10, ino: 22 }, [{ dev: 10, ino: 20 }]),
    false
  );
});

function writeEvidenceFiles(directory, activePath) {
  const files = {
    preAppState: join(directory, 'pre-app-state.txt'),
    postAppState: join(directory, 'post-app-state.txt'),
    windowState: join(directory, 'window-state.txt'),
    saveResponse: join(directory, 'save-response.txt'),
    readback: join(directory, 'readback.txt'),
  };
  writeFileSync(files.preAppState, `active canvas: ${activePath}`);
  writeFileSync(files.postAppState, `active canvas: ${activePath}`);
  writeFileSync(files.windowState, 'Jovie Design Studio — canonical');
  writeFileSync(files.saveResponse, 'save-document acknowledged');
  writeFileSync(files.readback, '{"roots":["dn0Es","co5mw"]}');
  return files;
}

function cliArgs(activePath, files) {
  return [
    '--profile',
    'jovie-founder-design-studio',
    '--active-path-before',
    activePath,
    '--active-path-after',
    activePath,
    '--document-title',
    'Jovie Design Studio — canonical',
    '--writer',
    'agent-veronica',
    '--batch-id',
    'header-candidates-04',
    '--batch-started-at',
    '2026-08-10T21:46:59.000Z',
    '--root-id',
    'dn0Es',
    '--root-id',
    'co5mw',
    '--mutation-state',
    'confirmed',
    '--save-method',
    'Cmd-S',
    '--save-requested-at',
    '2026-08-10T21:47:00.000Z',
    '--save-acknowledged-at',
    '2026-08-10T21:47:01.000Z',
    '--save-acknowledged',
    'true',
    '--dirty-state',
    'clean',
    '--post-readback-at',
    '2026-08-10T21:47:02.000Z',
    '--readback-verified',
    'true',
    '--recorded-at',
    '2026-08-10T21:47:03.000Z',
    '--pre-app-state-evidence',
    files.preAppState,
    '--post-app-state-evidence',
    files.postAppState,
    '--window-state-evidence',
    files.windowState,
    '--save-response-evidence',
    files.saveResponse,
    '--readback-evidence',
    files.readback,
  ];
}

test('CLI loads canonical identity from the profile and binds evidence hashes', () => {
  const directory = mkdtempSync(join(tmpdir(), 'pen-save-receipt-'));
  try {
    const files = writeEvidenceFiles(directory, CANONICAL);
    const result = spawnSync(
      process.execPath,
      [CLI, ...cliArgs(CANONICAL, files)],
      {
        encoding: 'utf8',
      }
    );
    assert.equal(result.status, 0, result.stderr);
    const receipt = JSON.parse(result.stdout);
    assert.equal(receipt.verdict, 'saved_state_verified');
    assert.match(receipt.evidence.pre_app_state_sha256, /^[a-f0-9]{64}$/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('CLI blocks daily even when the caller supplies daily for every active path', () => {
  const directory = mkdtempSync(join(tmpdir(), 'pen-save-receipt-'));
  try {
    const files = writeEvidenceFiles(directory, DAILY);
    const result = spawnSync(
      process.execPath,
      [CLI, ...cliArgs(DAILY, files)],
      {
        encoding: 'utf8',
      }
    );
    assert.equal(result.status, 1, result.stderr);
    const receipt = JSON.parse(result.stdout);
    assert.equal(receipt.expected_path, CANONICAL);
    assert.equal(receipt.verdict, 'blocked');
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('CLI rejects hard-linked evidence before reading it', () => {
  const directory = mkdtempSync(join(tmpdir(), 'pen-save-receipt-'));
  try {
    const files = writeEvidenceFiles(directory, CANONICAL);
    const linkedEvidence = join(directory, 'pre-app-state-hardlink.txt');
    linkSync(files.preAppState, linkedEvidence);
    files.preAppState = linkedEvidence;
    const result = spawnSync(
      process.execPath,
      [CLI, ...cliArgs(CANONICAL, files)],
      {
        encoding: 'utf8',
      }
    );
    assert.equal(result.status, 2, result.stderr);
    assert.match(JSON.parse(result.stdout).error, /single-link regular file/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('CLI exits 2 with JSON for malformed arguments', () => {
  const result = spawnSync(process.execPath, [CLI, '--expected-path', DAILY], {
    encoding: 'utf8',
  });
  assert.equal(result.status, 2);
  assert.equal(JSON.parse(result.stdout).verdict, 'error');
});
