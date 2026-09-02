import { appendFileSync, existsSync, readFileSync } from 'node:fs';
import { validateAuditEvidenceShape } from './audit-registry.mjs';
import { AUDIT_LEDGER_ENTRY_SCHEMA, digestObject } from './contracts.mjs';

function entryDigest(entry) {
  const unsigned = { ...entry };
  delete unsigned.entryDigest;
  return digestObject(unsigned);
}

export function appendEvidenceEntry(entries, evidence) {
  const errors = validateAuditEvidenceShape(evidence);
  if (errors.length > 0) throw new Error(errors.join('\n'));

  const existing = entries.find(
    entry => entry.evidence.evidenceId === evidence.evidenceId
  );
  if (existing) {
    if (digestObject(existing.evidence) === digestObject(evidence))
      return entries;
    throw new Error('evidence-row-mutation-denied');
  }
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
    evidence,
  };
  return [...entries, { ...entry, entryDigest: entryDigest(entry) }];
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
  return entries;
}

export function readEvidenceLedgerFile(path) {
  return readEvidenceLedger(existsSync(path) ? readFileSync(path, 'utf8') : '');
}

export function appendEvidenceFile(path, evidence) {
  const current = readEvidenceLedgerFile(path);
  const next = appendEvidenceEntry(current, evidence);
  if (next.length > current.length) {
    appendFileSync(path, `${JSON.stringify(next.at(-1))}\n`, 'utf8');
  }
  return next;
}
