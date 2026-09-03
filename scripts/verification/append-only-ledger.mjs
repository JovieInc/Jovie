import {
  closeSync,
  existsSync,
  fsyncSync,
  openSync,
  readFileSync,
  unlinkSync,
  writeSync,
} from 'node:fs';
import { validateAuditEvidenceShape } from './audit-registry.mjs';
import { AUDIT_LEDGER_ENTRY_SCHEMA, digestObject } from './contracts.mjs';

function entryDigest(entry) {
  const unsigned = { ...entry };
  delete unsigned.entryDigest;
  return digestObject(unsigned);
}

function evidenceContentId(evidence) {
  const unsigned = { ...evidence };
  delete unsigned.evidenceId;
  return `evidence-${digestObject(unsigned)}`;
}

function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}

function validateEntries(entries) {
  let previousDigest = null;
  const evidenceIds = new Set();
  for (const [index, entry] of entries.entries()) {
    if (
      entry.schema !== AUDIT_LEDGER_ENTRY_SCHEMA ||
      entry.sequence !== index + 1 ||
      entry.previousDigest !== previousDigest ||
      entry.entryDigest !== entryDigest(entry)
    ) {
      throw new Error('append-only-ledger-integrity-failure');
    }
    const errors = validateAuditEvidenceShape(entry.evidence);
    if (errors.length > 0) throw new Error(errors.join('\n'));
    if (entry.evidence.evidenceId !== evidenceContentId(entry.evidence)) {
      throw new Error('evidence-content-address-mismatch');
    }
    if (evidenceIds.has(entry.evidence.evidenceId)) {
      throw new Error('duplicate-evidence-id');
    }
    if (
      entry.evidence.supersedes &&
      !evidenceIds.has(entry.evidence.supersedes)
    ) {
      throw new Error('supersession-target-missing');
    }
    evidenceIds.add(entry.evidence.evidenceId);
    previousDigest = entry.entryDigest;
  }
}

export function appendEvidenceEntry(entries, evidence) {
  validateEntries(entries);
  const errors = validateAuditEvidenceShape(evidence);
  if (errors.length > 0) throw new Error(errors.join('\n'));
  if (evidence.evidenceId !== evidenceContentId(evidence)) {
    throw new Error('evidence-content-address-mismatch');
  }

  const existing = entries.find(
    entry => entry.evidence.evidenceId === evidence.evidenceId
  );
  if (existing) return entries;
  if (
    evidence.supersedes &&
    !entries.some(entry => entry.evidence.evidenceId === evidence.supersedes)
  ) {
    throw new Error('supersession-target-missing');
  }

  const previousDigest = entries.at(-1)?.entryDigest ?? null;
  const entry = {
    schema: AUDIT_LEDGER_ENTRY_SCHEMA,
    sequence: entries.length + 1,
    previousDigest,
    evidence: structuredClone(evidence),
  };
  const sealedEntry = deepFreeze({
    ...entry,
    entryDigest: entryDigest(entry),
  });
  return Object.freeze([...entries, sealedEntry]);
}

export function serializeEvidenceLedger(entries) {
  return (
    entries.map(entry => JSON.stringify(entry)).join('\n') +
    (entries.length > 0 ? '\n' : '')
  );
}

export function readEvidenceLedger(text) {
  const entries = text
    .split('\n')
    .filter(Boolean)
    .map(line => JSON.parse(line));
  validateEntries(entries);
  return deepFreeze(entries);
}

export function readEvidenceLedgerFile(path) {
  return readEvidenceLedger(existsSync(path) ? readFileSync(path, 'utf8') : '');
}

export function appendEvidenceFile(path, evidence) {
  const lockPath = `${path}.lock`;
  let lock;
  try {
    lock = openSync(lockPath, 'wx', 0o600);
  } catch (error) {
    if (error?.code === 'EEXIST') {
      throw new Error('append-only-ledger-writer-lock-unavailable');
    }
    throw error;
  }
  try {
    writeSync(lock, `${process.pid}\n`);
    fsyncSync(lock);
    const current = readEvidenceLedgerFile(path);
    const next = appendEvidenceEntry(current, evidence);
    if (next.length > current.length) {
      const ledger = openSync(path, 'a', 0o600);
      try {
        writeSync(ledger, `${JSON.stringify(next.at(-1))}\n`);
        fsyncSync(ledger);
      } finally {
        closeSync(ledger);
      }
    }
    return next;
  } finally {
    closeSync(lock);
    unlinkSync(lockPath);
  }
}
