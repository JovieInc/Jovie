/**
 * Pen registry ledger — singular, mechanical, contradiction-free (JOV-4969).
 *
 * One authoritative status field per registry identity: `metadataStatus` on
 * the registry root record. The visible ledger row is never hand-authored; it
 * is rendered from the record by `renderLedgerLines`. Receipt precedence:
 * exact current-source evidence wins; a proof measured against any other
 * source SHA must be explicitly `expired: true` — or, for source-identity
 * receipts only, carry an explicit `currentThrough` compare proof — or the
 * audit fails closed.
 */

export const PEN_REGISTRY_LEDGER_SCHEMA = 'pen-registry-ledger/v1';
export const PEN_REGISTRY_AUDIT_SCHEMA = 'pen-registry-audit/v1';

export const LEDGER_STATUSES = ['SAFE', 'PARTIAL', 'BLOCKED', 'PROPOSAL'];

export const SAFE_RECEIPT_KINDS = [
  'source',
  'runtime-desktop',
  'runtime-narrow',
  'same-node-readback',
  'containing-production',
];

const RECEIPT_KINDS = new Set(SAFE_RECEIPT_KINDS);

function isNonEmptyString(value) {
  return typeof value === 'string' && value.length > 0;
}

function isIsoTimestamp(value) {
  return isNonEmptyString(value) && !Number.isNaN(Date.parse(value));
}

/**
 * A receipt proves against the current generation when any SHA it carries
 * matches the exact current source SHA. Source-identity receipts may
 * additionally stay current through an explicit compare proof
 * (`currentThrough`): the fleet distinguishes "source identity still current"
 * from "runtime generation receipt stale". Runtime, same-node, and
 * containing-production receipts are generation-bound and must be refreshed
 * at the exact current SHA. A receipt without a SHA is an unbound observation.
 */
function receiptProofCurrent(receipt, currentSourceSha) {
  if (!isNonEmptyString(receipt.sha)) return true;
  if (receipt.sha === currentSourceSha) return true;
  return (
    receipt.kind === 'source' && receipt.currentThrough === currentSourceSha
  );
}

/**
 * A receipt is valid proof only when it has not been explicitly expired and
 * its proof is current (see receiptProofCurrent).
 */
export function isReceiptValid(receipt, currentSourceSha) {
  if (receipt.expired === true) return false;
  return receiptProofCurrent(receipt, currentSourceSha);
}

/**
 * A receipt whose proof is not current is stale. Stale proof must be
 * explicitly expired, never silently retained.
 */
export function isReceiptStale(receipt, currentSourceSha) {
  return (
    receipt.expired !== true && !receiptProofCurrent(receipt, currentSourceSha)
  );
}

export function validReceiptKinds(record, currentSourceSha) {
  return new Set(
    (record.receipts ?? [])
      .filter(receipt => isReceiptValid(receipt, currentSourceSha))
      .map(receipt => receipt.kind)
  );
}

/**
 * Recompute the only status a record is entitled to. This is the mechanical
 * status function; `metadataStatus` must equal it or the audit fails.
 */
export function computeEntitledStatus(record, currentSourceSha) {
  if (record.sourceBacked === false) return 'PROPOSAL';
  const kinds = validReceiptKinds(record, currentSourceSha);
  const hasAllSafeEvidence = SAFE_RECEIPT_KINDS.every(kind => kinds.has(kind));
  if (hasAllSafeEvidence && !isNonEmptyString(record.blocker)) return 'SAFE';
  if (isNonEmptyString(record.blocker) || !kinds.has('source')) {
    return 'BLOCKED';
  }
  return 'PARTIAL';
}

export function missingSafeEvidence(record, currentSourceSha) {
  const kinds = validReceiptKinds(record, currentSourceSha);
  const missing = SAFE_RECEIPT_KINDS.filter(kind => !kinds.has(kind));
  if (isNonEmptyString(record.blocker)) missing.push('no-open-blocker');
  return missing;
}

function validateReceipt(receipt, recordLabel) {
  const problems = [];
  if (
    receipt === null ||
    typeof receipt !== 'object' ||
    Array.isArray(receipt)
  ) {
    return [`${recordLabel}: receipt must be an object`];
  }
  if (!RECEIPT_KINDS.has(receipt.kind)) {
    problems.push(
      `${recordLabel}: receipt kind must be one of ${SAFE_RECEIPT_KINDS.join(', ')}`
    );
  }
  if (!isIsoTimestamp(receipt.observedAt)) {
    problems.push(
      `${recordLabel}: receipt observedAt must be an ISO timestamp`
    );
  }
  if (
    'sha' in receipt &&
    receipt.sha !== null &&
    !isNonEmptyString(receipt.sha)
  ) {
    problems.push(
      `${recordLabel}: receipt sha must be a non-empty string or null`
    );
  }
  if ('currentThrough' in receipt) {
    if (!isNonEmptyString(receipt.currentThrough)) {
      problems.push(
        `${recordLabel}: receipt currentThrough must be a non-empty string`
      );
    }
    if (receipt.kind !== 'source') {
      problems.push(
        `${recordLabel}: currentThrough compare proof is only defined for source receipts`
      );
    }
  }
  if ('expired' in receipt && typeof receipt.expired !== 'boolean') {
    problems.push(`${recordLabel}: receipt expired must be a boolean`);
  }
  if (receipt.expired === true && !isNonEmptyString(receipt.expiredReason)) {
    problems.push(
      `${recordLabel}: expired receipt must carry an explicit expiredReason`
    );
  }
  return problems;
}

function validateRecord(record, index) {
  const label = `records[${index}]`;
  const problems = [];
  if (record === null || typeof record !== 'object' || Array.isArray(record)) {
    return [`${label}: record must be an object`];
  }
  if (!isNonEmptyString(record.registryId)) {
    problems.push(`${label}: registryId must be a non-empty string`);
  }
  if (!isNonEmptyString(record.rootNodeId)) {
    problems.push(`${label}: rootNodeId must be a non-empty string`);
  }
  if (!LEDGER_STATUSES.includes(record.metadataStatus)) {
    problems.push(
      `${label}: metadataStatus must be one of ${LEDGER_STATUSES.join(', ')}`
    );
  }
  if (!LEDGER_STATUSES.includes(record.visibleStatus)) {
    problems.push(
      `${label}: visibleStatus must be one of ${LEDGER_STATUSES.join(', ')}`
    );
  }
  if (typeof record.sourceBacked !== 'boolean') {
    problems.push(`${label}: sourceBacked must be a boolean`);
  }
  if (!Array.isArray(record.receipts)) {
    problems.push(`${label}: receipts must be an array`);
  } else {
    for (const receipt of record.receipts) {
      problems.push(...validateReceipt(receipt, label));
    }
  }
  for (const field of ['blocker', 'owner', 'issueId']) {
    if (record[field] !== null && !isNonEmptyString(record[field])) {
      problems.push(`${label}: ${field} must be a non-empty string or null`);
    }
  }
  if (
    record.metadataStatus === 'BLOCKED' &&
    !isNonEmptyString(record.blocker)
  ) {
    problems.push(`${label}: BLOCKED records must name a blocker`);
  }
  return problems;
}

/**
 * Validate export shape. Returns a list of structural problems; an empty list
 * means the export is well-formed enough to audit. Callers treat a non-empty
 * list as malformed input (exit 2), not as audit failures.
 */
export function validateLedgerExport(ledger) {
  const problems = [];
  if (ledger === null || typeof ledger !== 'object' || Array.isArray(ledger)) {
    return ['ledger export must be an object'];
  }
  if (ledger.schema !== PEN_REGISTRY_LEDGER_SCHEMA) {
    problems.push(`schema must be ${PEN_REGISTRY_LEDGER_SCHEMA}`);
  }
  if (!isIsoTimestamp(ledger.exportedAt)) {
    problems.push('exportedAt must be an ISO timestamp');
  }
  if (!isNonEmptyString(ledger.currentSourceSha)) {
    problems.push('currentSourceSha must be a non-empty string');
  }
  if (
    !Array.isArray(ledger.registeredIdentities) ||
    ledger.registeredIdentities.some(id => !isNonEmptyString(id))
  ) {
    problems.push('registeredIdentities must be an array of non-empty strings');
  }
  if (!Array.isArray(ledger.records)) {
    problems.push('records must be an array');
  } else {
    ledger.records.forEach((record, index) => {
      problems.push(...validateRecord(record, index));
    });
  }
  return problems;
}

function failure(code, registryId, detail) {
  return { code, registryId, detail };
}

/**
 * Audit a well-formed ledger export. Returns a `pen-registry-audit/v1`
 * receipt. Fail-closed: any contradiction makes verdict `fail`.
 *
 * `codeIdentities` (optional) is the registered-identity list derived from
 * the exact current code registry. When provided, the export's claimed
 * `registeredIdentities` must equal it exactly — the Pen document never
 * defines the denominator; drift fails with `registry-source-drift`.
 */
export function auditPenRegistryLedger(ledger, codeIdentities) {
  const currentSourceSha = ledger.currentSourceSha;
  const failures = [];
  const records = ledger.records;

  const byRegistryId = new Map();
  const byRootNodeId = new Map();
  for (const record of records) {
    if (byRegistryId.has(record.registryId)) {
      failures.push(
        failure(
          'duplicate-authoritative-record',
          record.registryId,
          `more than one authoritative status record for ${record.registryId} ` +
            `(roots ${byRegistryId.get(record.registryId)} and ${record.rootNodeId})`
        )
      );
    } else {
      byRegistryId.set(record.registryId, record.rootNodeId);
    }
    if (byRootNodeId.has(record.rootNodeId)) {
      failures.push(
        failure(
          'duplicate-root-node',
          record.registryId,
          `root node ${record.rootNodeId} is bound to both ` +
            `${byRootNodeId.get(record.rootNodeId)} and ${record.registryId}`
        )
      );
    } else {
      byRootNodeId.set(record.rootNodeId, record.registryId);
    }
  }

  for (const record of records) {
    if (record.visibleStatus !== record.metadataStatus) {
      failures.push(
        failure(
          'visible-status-mismatch',
          record.registryId,
          `visible status ${record.visibleStatus} differs from metadata status ` +
            `${record.metadataStatus} on root ${record.rootNodeId}`
        )
      );
    }

    for (const receipt of record.receipts) {
      if (isReceiptStale(receipt, currentSourceSha)) {
        const remedy =
          receipt.kind === 'source'
            ? 'must be explicitly expired or carry a currentThrough compare proof'
            : 'is generation-bound and must be refreshed at the exact current SHA or explicitly expired';
        failures.push(
          failure(
            'stale-proof-retained',
            record.registryId,
            `${receipt.kind} receipt at ${receipt.sha} is stale against ` +
              `current source ${currentSourceSha} and ${remedy}`
          )
        );
      }
    }

    const entitled = computeEntitledStatus(record, currentSourceSha);
    if (record.metadataStatus === 'SAFE' && entitled !== 'SAFE') {
      failures.push(
        failure(
          'unsafe-safe',
          record.registryId,
          `SAFE is not entitled; missing evidence: ` +
            missingSafeEvidence(record, currentSourceSha).join(', ')
        )
      );
    } else if (record.metadataStatus !== entitled) {
      failures.push(
        failure(
          'status-not-recomputable',
          record.registryId,
          `metadata status ${record.metadataStatus} does not equal the ` +
            `machine-recomputed status ${entitled}`
        )
      );
    }
  }

  const registered = new Set(ledger.registeredIdentities);

  if (codeIdentities !== undefined) {
    if (
      !Array.isArray(codeIdentities) ||
      codeIdentities.some(id => !isNonEmptyString(id))
    ) {
      failures.push(
        failure(
          'registry-source-drift',
          null,
          'code-derived registered identities must be an array of non-empty strings'
        )
      );
    } else {
      const code = new Set(codeIdentities);
      const staleInExport = [...registered].filter(id => !code.has(id));
      const missingInExport = [...code].filter(id => !registered.has(id));
      if (staleInExport.length > 0 || missingInExport.length > 0) {
        failures.push(
          failure(
            'registry-source-drift',
            null,
            `export claims ${registered.size} registered identities but the ` +
              `exact current code registry has ${code.size}` +
              (staleInExport.length > 0
                ? `; stale Pen-only rows: ${staleInExport.join(', ')}`
                : '') +
              (missingInExport.length > 0
                ? `; unregistered code identities: ${missingInExport.join(', ')}`
                : '')
          )
        );
      }
    }
  }

  for (const record of records) {
    if (record.sourceBacked === false) continue;
    if (!registered.has(record.registryId)) {
      failures.push(
        failure(
          'unknown-registered-identity',
          record.registryId,
          `${record.registryId} has a status record but is not a registered identity`
        )
      );
    }
  }
  const countedRecords = records.filter(
    record => record.sourceBacked !== false
  );
  const uniqueCountedIds = new Set(countedRecords.map(r => r.registryId));
  const missingIdentities = [...registered].filter(
    id => !uniqueCountedIds.has(id)
  );
  if (
    uniqueCountedIds.size !== registered.size ||
    missingIdentities.length > 0
  ) {
    failures.push(
      failure(
        'denominator-mismatch',
        null,
        `denominator ${uniqueCountedIds.size} does not equal the ` +
          `${registered.size} unique registered identities` +
          (missingIdentities.length > 0
            ? `; missing: ${missingIdentities.join(', ')}`
            : '')
      )
    );
  }

  const denominator = { SAFE: 0, PARTIAL: 0, BLOCKED: 0 };
  for (const record of countedRecords) {
    if (record.metadataStatus in denominator) {
      denominator[record.metadataStatus] += 1;
    }
  }

  return {
    schema: PEN_REGISTRY_AUDIT_SCHEMA,
    verdict: failures.length === 0 ? 'pass' : 'fail',
    currentSourceSha,
    registeredIdentities: registered.size,
    codeRegisteredIdentities:
      codeIdentities === undefined ? undefined : new Set(codeIdentities).size,
    denominator: {
      ...denominator,
      total: denominator.SAFE + denominator.PARTIAL + denominator.BLOCKED,
      proposals: records.length - countedRecords.length,
    },
    failures,
  };
}

/**
 * Mechanically render the visible ledger rows. This is the only sanctioned
 * way to produce visible status strings; sorted by registryId so output is
 * deterministic. Returns one line per registered (source-backed) record.
 */
export function renderLedgerLines(ledger) {
  return ledger.records
    .filter(record => record.sourceBacked !== false)
    .slice()
    .sort((a, b) => a.registryId.localeCompare(b.registryId))
    .map(
      record =>
        `${record.metadataStatus} | ${record.registryId} | root ${record.rootNodeId} | ` +
        `owner ${record.owner ?? 'unassigned'} | ` +
        `issue ${record.issueId ?? 'none'} | ` +
        `blocker ${record.blocker ?? 'none'}`
    );
}

export function exitCodeForAudit(receipt) {
  return receipt.verdict === 'pass' ? 0 : 1;
}
