import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, it } from 'node:test';
import {
  appendEvidenceEntry,
  appendEvidenceFile,
  readEvidenceLedger,
  serializeEvidenceLedger,
} from './append-only-ledger.mjs';
import {
  auditDefinitionDigest,
  SYMPHONY_CHANGE_SAFETY_AUDIT,
} from './audit-registry.mjs';
import {
  AUDIT_EVIDENCE_SCHEMA,
  AUDIT_LEDGER_ENTRY_SCHEMA,
  digestObject,
} from './contracts.mjs';

const ROOT = resolve(import.meta.dirname, '../..');
const SHA = 'a'.repeat(40);
const DIGEST = 'd'.repeat(64);

function evidence(overrides = {}) {
  return {
    schema: AUDIT_EVIDENCE_SCHEMA,
    evidenceId: 'evidence-1',
    eventId: 'event-1',
    auditId: SYMPHONY_CHANGE_SAFETY_AUDIT.auditId,
    subject: {
      repository: 'JovieInc/Jovie',
      headSha: SHA,
      baseSha: SHA,
      mergeBaseSha: SHA,
      patchDigest: DIGEST,
      requiredContextDigest: DIGEST,
      artifactDigests: [],
    },
    auditDefinitionDigest: auditDefinitionDigest(SYMPHONY_CHANGE_SAFETY_AUDIT),
    toolDigest: DIGEST,
    modelDigest: null,
    configDigest: DIGEST,
    inputBundleDigest: DIGEST,
    redactionManifestDigest: DIGEST,
    outcome: 'satisfied',
    producer: { kind: 'deterministic' },
    authority: {},
    findings: [],
    supersedes: null,
    startedAt: '2026-09-02T11:59:00.000Z',
    completedAt: '2026-09-02T12:00:00.000Z',
    ...overrides,
  };
}

function reseal(entry) {
  const unsigned = { ...entry };
  delete unsigned.entryDigest;
  return { ...unsigned, entryDigest: digestObject(unsigned) };
}

describe('append-only audit evidence', () => {
  it('is idempotent for identical rows and denies same-id mutation', () => {
    const row = evidence();
    const once = appendEvidenceEntry([], row);
    assert.equal(appendEvidenceEntry(once, row), once);
    assert.throws(
      () => appendEvidenceEntry(once, { ...row, outcome: 'failed' }),
      /evidence-row-mutation-denied/
    );
    assert.throws(() => appendEvidenceEntry([], {}), /audit evidence schema/);
  });

  it('detaches and freezes accepted evidence from caller-owned objects', () => {
    const row = evidence({ outcome: 'failed' });
    const entries = appendEvidenceEntry([], row);
    row.outcome = 'satisfied';
    row.subject.artifactDigests.push(DIGEST);
    assert.equal(entries[0].evidence.outcome, 'failed');
    assert.deepEqual(entries[0].evidence.subject.artifactDigests, []);
    assert.equal(Object.isFrozen(entries[0].evidence.subject), true);
    assert.throws(
      () => appendEvidenceEntry(entries, row),
      /evidence-row-mutation-denied/
    );
  });

  it('accepts only forward supersession to an existing row', () => {
    const once = appendEvidenceEntry([], evidence());
    assert.equal(
      appendEvidenceEntry(
        once,
        evidence({
          evidenceId: 'evidence-2',
          eventId: 'event-2',
          supersedes: 'evidence-1',
        })
      ).length,
      2
    );
    assert.throws(
      () =>
        appendEvidenceEntry(
          [],
          evidence({ evidenceId: 'evidence-2', supersedes: 'missing' })
        ),
      /supersession-target-missing/
    );
  });

  it('rejects duplicate IDs, missing supersession targets, and tampered chains', () => {
    const first = appendEvidenceEntry([], evidence())[0];
    for (const broken of [
      reseal({ ...first, schema: 'wrong' }),
      reseal({ ...first, sequence: 2 }),
      reseal({ ...first, previousDigest: DIGEST }),
    ]) {
      assert.throws(
        () => readEvidenceLedger(serializeEvidenceLedger([broken])),
        /append-only-ledger-integrity-failure/
      );
    }
    const invalidEvidence = reseal({ ...first, evidence: {} });
    assert.throws(
      () => readEvidenceLedger(serializeEvidenceLedger([invalidEvidence])),
      /audit evidence schema/
    );
    assert.throws(() => readEvidenceLedger('{not-json}\n'), SyntaxError);
    const duplicate = reseal({
      schema: AUDIT_LEDGER_ENTRY_SCHEMA,
      sequence: 2,
      previousDigest: first.entryDigest,
      evidence: evidence(),
    });
    assert.throws(
      () => readEvidenceLedger(serializeEvidenceLedger([first, duplicate])),
      /duplicate-evidence-id/
    );
    const missingTarget = reseal({
      ...duplicate,
      evidence: evidence({ evidenceId: 'evidence-2', supersedes: 'missing' }),
    });
    assert.throws(
      () => readEvidenceLedger(serializeEvidenceLedger([first, missingTarget])),
      /supersession-target-missing/
    );
    assert.throws(
      () =>
        readEvidenceLedger(
          serializeEvidenceLedger([first]).replace('satisfied', 'failed')
        ),
      /append-only-ledger-integrity-failure/
    );
    assert.deepEqual(readEvidenceLedger(''), []);
  });

  it('persists and reads the same lineage after a fresh Node process', () => {
    const directory = mkdtempSync(join(tmpdir(), 'jovie-audit-ledger-'));
    const ledgerPath = join(directory, 'evidence.jsonl');
    try {
      appendEvidenceFile(ledgerPath, evidence());
      appendEvidenceFile(ledgerPath, evidence());
      const child = spawnSync(
        process.execPath,
        [
          '--input-type=module',
          '--eval',
          "import {readEvidenceLedgerFile} from './scripts/verification/append-only-ledger.mjs'; process.stdout.write(JSON.stringify(readEvidenceLedgerFile(process.argv[1])));",
          ledgerPath,
        ],
        { cwd: ROOT, encoding: 'utf8' }
      );
      assert.equal(child.status, 0, child.stderr);
      assert.deepEqual(
        JSON.parse(child.stdout),
        readEvidenceLedger(readFileSync(ledgerPath, 'utf8'))
      );
      writeFileSync(
        ledgerPath,
        readFileSync(ledgerPath, 'utf8').replace('satisfied', 'failed')
      );
      assert.throws(
        () =>
          appendEvidenceFile(
            ledgerPath,
            evidence({ evidenceId: 'evidence-2' })
          ),
        /append-only-ledger-integrity-failure/
      );
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it('fails closed while another writer owns the ledger lease', () => {
    const directory = mkdtempSync(join(tmpdir(), 'jovie-audit-ledger-lock-'));
    const ledgerPath = join(directory, 'evidence.jsonl');
    try {
      writeFileSync(`${ledgerPath}.lock`, 'other-writer\n');
      assert.throws(
        () => appendEvidenceFile(ledgerPath, evidence()),
        /append-only-ledger-writer-lock-unavailable/
      );
      assert.equal(
        readFileSync(`${ledgerPath}.lock`, 'utf8'),
        'other-writer\n'
      );
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
