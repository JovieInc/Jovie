/**
 * Per-run outcome verification (JOV-6051).
 *
 * After a cert/evidence run, bind claim vs evidence vs a single explicit
 * outcome. No silent green, no averaged failures, no model-written
 * certification. Only the executable harness may set `certified:true`.
 */

import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  runScreenCertification,
  SCREEN_CERT_GATE,
  SCREEN_CERT_INVARIANT_ID,
  SCREEN_CERT_SCHEMA,
  SCREEN_REGISTRATION_GATE,
} from './screen-certification.mjs';

export const RUN_OUTCOME_SCHEMA = 'run-outcome/v1';
export const RUN_OUTCOMES = Object.freeze(['pass', 'fail', 'unresolved']);
export const CERTIFIER_HARNESS = 'harness';

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function hasText(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function stableSerialize(value) {
  if (Array.isArray(value)) return `[${value.map(stableSerialize).join(',')}]`;
  if (isObject(value)) {
    return `{${Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${stableSerialize(item)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

export function evidenceFingerprint(value) {
  return `sha256:${createHash('sha256').update(stableSerialize(value)).digest('hex')}`;
}

function exactSha(value) {
  return typeof value === 'string' && /^[0-9a-f]{40}$/i.test(value)
    ? value.toLowerCase()
    : null;
}

export function canSetCertified(certifier) {
  return certifier === CERTIFIER_HARNESS;
}

/**
 * The only writable certification path. Models, including Jev, always get false.
 *
 * @param {{ certifier?: string, certified?: boolean }} [input]
 */
export function applyCertifiedBit({ certifier, certified } = {}) {
  return canSetCertified(certifier) && certified === true;
}

function evidenceFromReceipt(receipt) {
  if (!isObject(receipt)) return null;
  return Object.freeze({
    schema: receipt.schema ?? null,
    gate: receipt.gate ?? null,
    invariant: receipt.invariant ?? null,
    headSha: receipt.headSha ?? null,
    baseSha: receipt.baseSha ?? null,
    ok: receipt.ok === true,
    certified: receipt.certified === true,
    registrationOnly: receipt.registrationOnly === true,
    status: hasText(receipt.status) ? receipt.status : null,
    issues: Array.isArray(receipt.issues) ? [...receipt.issues] : [],
    changedScreens: Array.isArray(receipt.changedScreens)
      ? receipt.changedScreens.map(row =>
          isObject(row)
            ? {
                id: row.id ?? null,
                verdict: row.verdict ?? null,
                findings: Array.isArray(row.findings) ? [...row.findings] : [],
                artifactDigest: row.artifactDigest ?? null,
                rendererRunUrl: row.rendererRunUrl ?? null,
              }
            : row
        )
      : [],
  });
}

function claimedScreens(claim) {
  if (!isObject(claim) || !Array.isArray(claim.screenIds)) return [];
  return claim.screenIds.filter(id => hasText(id));
}

const UNRESOLVED_RECEIPT_STATUSES = new Set([
  'not-applicable',
  'source-registered',
  'evidence-required',
]);
const SCREEN_VERDICTS = new Set(['pass', 'block', 'evidence-required']);

function normalizeClaim(claim) {
  const source = isObject(claim) ? claim : {};
  return {
    statement: source.statement ?? null,
    kind: source.kind ?? 'screen-certification',
    expectedOutcome: RUN_OUTCOMES.includes(source.expectedOutcome)
      ? source.expectedOutcome
      : null,
    expectedCertified:
      typeof source.expectedCertified === 'boolean'
        ? source.expectedCertified
        : null,
    screenIds: claimedScreens(source),
  };
}

function validateScreenCertificationReceipt(receipt) {
  if (!isObject(receipt)) return ['screen-certification receipt is required'];

  const issues = [];
  const required = [
    [
      receipt.schema === SCREEN_CERT_SCHEMA,
      `receipt schema must be ${SCREEN_CERT_SCHEMA}`,
    ],
    [exactSha(receipt.headSha), 'receipt must bind an exact-head headSha'],
    [
      receipt.baseSha === null || exactSha(receipt.baseSha),
      'receipt baseSha must be null or an exact commit SHA',
    ],
    [
      receipt.gate === SCREEN_CERT_GATE ||
        receipt.gate === SCREEN_REGISTRATION_GATE,
      `receipt gate must be ${SCREEN_CERT_GATE} or ${SCREEN_REGISTRATION_GATE}`,
    ],
    [
      receipt.invariant === SCREEN_CERT_INVARIANT_ID,
      `receipt invariant must be ${SCREEN_CERT_INVARIANT_ID}`,
    ],
    [hasText(receipt.status), 'receipt status is required'],
  ];
  issues.push(
    ...required.filter(([valid]) => !valid).map(([, issue]) => issue)
  );
  for (const field of ['ok', 'certified', 'registrationOnly']) {
    if (typeof receipt[field] !== 'boolean')
      issues.push(`receipt ${field} must be boolean`);
  }
  for (const field of [
    'issues',
    'changedScreens',
    'excludedChanges',
    'fixtures',
    'sweeps',
  ]) {
    if (!Array.isArray(receipt[field])) {
      issues.push(`receipt ${field} must be an array`);
    }
  }

  if (
    receipt.gate === SCREEN_REGISTRATION_GATE &&
    receipt.registrationOnly !== true
  ) {
    issues.push('registration gate requires registrationOnly:true');
  }

  const changedScreens = Array.isArray(receipt.changedScreens)
    ? receipt.changedScreens
    : [];
  for (const row of changedScreens) {
    if (!isObject(row)) {
      issues.push('changed screen evidence must be an object');
      continue;
    }
    if (!hasText(row.id)) issues.push('changed screen evidence needs an id');
    if (!SCREEN_VERDICTS.has(row.verdict)) {
      issues.push(
        `changed screen ${row.id ?? '<unknown>'} has an invalid verdict`
      );
    }
    if (!Array.isArray(row.findings)) {
      issues.push(
        `changed screen ${row.id ?? '<unknown>'} findings must be an array`
      );
    }
    if (
      receipt.ok === true &&
      receipt.certified === true &&
      row.verdict === 'pass'
    ) {
      if (Array.isArray(row.findings) && row.findings.length > 0) {
        issues.push(
          `changed screen ${row.id ?? '<unknown>'} pass has findings`
        );
      }
      if (
        typeof row.artifactDigest !== 'string' ||
        !/^sha256:[0-9a-f]{64}$/i.test(row.artifactDigest)
      ) {
        issues.push(
          `changed screen ${row.id ?? '<unknown>'} pass needs an artifact digest`
        );
      }
      if (
        typeof row.rendererRunUrl !== 'string' ||
        !/^https:\/\/[^\s]+$/i.test(row.rendererRunUrl)
      ) {
        issues.push(
          `changed screen ${row.id ?? '<unknown>'} pass needs renderer provenance`
        );
      }
    }
  }

  if (
    receipt.ok === true &&
    receipt.certified === true &&
    !receipt.registrationOnly
  ) {
    if (receipt.gate !== SCREEN_CERT_GATE)
      issues.push('certified receipt must use the certification gate');
    if (receipt.status !== 'certified')
      issues.push('certified receipt must have status:certified');
    if (changedScreens.length === 0)
      issues.push('certified receipt needs changed screen evidence');
    if (changedScreens.some(row => row?.verdict !== 'pass')) {
      issues.push(
        'certified receipt needs pass verdicts for every changed screen'
      );
    }
    if (Array.isArray(receipt.issues) && receipt.issues.length > 0) {
      issues.push('certified receipt cannot contain issues');
    }
  }

  return issues;
}

function decideOutcome({ claim, receipt, issues }) {
  if (issues.length > 0) {
    return {
      outcome: 'unresolved',
      certified: false,
      reason: issues[0],
    };
  }

  const expectedOutcome = RUN_OUTCOMES.includes(claim.expectedOutcome)
    ? claim.expectedOutcome
    : null;
  const expectedCertified =
    typeof claim.expectedCertified === 'boolean'
      ? claim.expectedCertified
      : null;
  const screens = claimedScreens(claim);
  const receivedIds = new Set(
    (receipt.changedScreens ?? []).map(row => row?.id).filter(Boolean)
  );

  if (receipt.certified === true && receipt.ok !== true) {
    return {
      outcome: 'fail',
      certified: false,
      reason: 'harness certified bit is inconsistent with ok:false',
    };
  }

  if (receipt.certified === true && receipt.registrationOnly === true) {
    return {
      outcome: 'fail',
      certified: false,
      reason: 'registration-only audit cannot mint certified:true',
    };
  }

  if (screens.length > 0) {
    const missing = screens.filter(id => !receivedIds.has(id));
    if (missing.length > 0) {
      return {
        outcome: 'unresolved',
        certified: false,
        reason: `receipt is missing claimed screen evidence: ${missing.join(', ')}`,
      };
    }
    const blocked = (receipt.changedScreens ?? []).filter(
      row => screens.includes(row.id) && row.verdict !== 'pass'
    );
    if (blocked.length > 0 && expectedOutcome !== 'fail') {
      return {
        outcome: receipt.ok === false ? 'fail' : 'unresolved',
        certified: false,
        reason: `claimed screens did not all pass: ${blocked
          .map(row => row.id)
          .join(', ')}`,
      };
    }
  }

  if (expectedCertified === true && receipt.certified !== true) {
    return {
      outcome: 'fail',
      certified: false,
      reason: 'claim expected certified:true but harness did not certify',
    };
  }

  if (expectedCertified === false && receipt.certified === true) {
    return {
      outcome: 'fail',
      certified: false,
      reason: 'claim expected certified:false but harness certified',
    };
  }

  if (expectedOutcome === 'fail') {
    const confirmedFailure =
      receipt.ok === false ||
      receipt.status === 'blocked' ||
      receipt.changedScreens.some(row => row?.verdict === 'block');
    if (!confirmedFailure && receipt.certified !== true) {
      return {
        outcome: 'unresolved',
        certified: false,
        reason: UNRESOLVED_RECEIPT_STATUSES.has(receipt.status)
          ? `harness status ${receipt.status} is not a confirmed failure`
          : 'harness evidence does not confirm the expected failure',
      };
    }
    return confirmedFailure
      ? {
          outcome: 'pass',
          certified: false,
          reason: 'failure claim matched harness evidence',
        }
      : {
          outcome: 'fail',
          certified: false,
          reason: 'failure claim was contradicted by a certified harness pass',
        };
  }

  if (expectedOutcome === 'unresolved') {
    return {
      outcome: 'unresolved',
      certified: false,
      reason: 'claim declared the run unresolved',
    };
  }

  if (receipt.certified === true && receipt.ok === true) {
    return {
      outcome: 'pass',
      certified: true,
      reason: 'harness certified the exact-head evidence for this run',
    };
  }

  if (expectedOutcome === 'pass') {
    return {
      outcome: 'fail',
      certified: false,
      reason: 'claim expected pass but harness did not certify',
    };
  }

  // ok without certification is not silent green.
  if (receipt.ok === true && receipt.certified !== true) {
    return {
      outcome: 'unresolved',
      certified: false,
      reason: UNRESOLVED_RECEIPT_STATUSES.has(receipt.status)
        ? `harness status ${receipt.status} is not a certified acceptance`
        : 'harness ok without certified is not a verified acceptance',
    };
  }

  return {
    outcome: 'fail',
    certified: false,
    reason: hasText(receipt.issues?.[0])
      ? receipt.issues[0]
      : 'harness blocked the run',
  };
}

/**
 * Verify one cert/evidence run. `receipts` with more than one entry is refused
 * so failures cannot be averaged. Unchanged evidence cannot be retried into a
 * better outcome.
 *
 * @param {{
 *   runId?: string,
 *   claim?: object,
 *   receipt?: object,
 *   receipts?: object[],
 *   persistTo?: string,
 *   previous?: object | null,
 *   includeShadow?: boolean,
 * }} [input]
 */
export function verifyRunOutcome({
  runId,
  claim,
  receipt,
  receipts,
  persistTo,
  previous = null,
} = {}) {
  const issues = [];
  if (!hasText(runId)) issues.push('runId is required');
  if (!isObject(claim) || !hasText(claim.statement)) {
    issues.push('claim.statement is required');
  }
  if (Array.isArray(receipts) && receipts.length !== 1) {
    issues.push('one run only; averaging multiple receipts is forbidden');
  }
  const resolvedReceipt = Array.isArray(receipts) ? receipts[0] : receipt;
  issues.push(...validateScreenCertificationReceipt(resolvedReceipt));

  const evidence = evidenceFromReceipt(resolvedReceipt);
  const normalizedClaim = isObject(claim) ? normalizeClaim(claim) : null;
  const fingerprint = evidenceFingerprint({
    runId: hasText(runId) ? runId : null,
    claim: normalizedClaim,
    evidence,
  });

  if (
    issues.length === 0 &&
    isObject(previous) &&
    previous.schema === RUN_OUTCOME_SCHEMA &&
    previous.evidenceFingerprint === fingerprint &&
    RUN_OUTCOMES.includes(previous.outcome)
  ) {
    const locked = Object.freeze({
      ...previous,
      issues: Object.freeze([
        ...(Array.isArray(previous.issues) ? previous.issues : []),
        'unchanged evidence cannot be retried for a better verdict',
      ]),
    });
    if (persistTo) persistRunOutcome(locked, persistTo);
    return locked;
  }

  const decision = decideOutcome({
    claim: isObject(claim) ? claim : {},
    receipt: evidence ?? {},
    issues,
  });
  const certified = applyCertifiedBit({
    certifier: CERTIFIER_HARNESS,
    certified: decision.certified,
  });

  const record = {
    schema: RUN_OUTCOME_SCHEMA,
    runId: hasText(runId) ? runId : null,
    invariant: SCREEN_CERT_INVARIANT_ID,
    gate: SCREEN_CERT_GATE,
    headSha: exactSha(evidence?.headSha) ?? evidence?.headSha ?? null,
    claim: normalizedClaim ? Object.freeze(normalizedClaim) : null,
    evidence,
    outcome: decision.outcome,
    reason: decision.reason,
    certified,
    certifier: certified ? CERTIFIER_HARNESS : null,
    shipBlocking: false,
    evidenceFingerprint: fingerprint,
    issues: Object.freeze([...issues, decision.reason].filter(Boolean)),
    shadow: null,
  };

  const frozen = Object.freeze(record);
  if (persistTo) persistRunOutcome(frozen, persistTo);
  return frozen;
}

export function persistRunOutcome(record, filePath) {
  if (!isObject(record) || record.schema !== RUN_OUTCOME_SCHEMA) {
    throw new Error(`persist requires ${RUN_OUTCOME_SCHEMA}`);
  }
  if (!hasText(record.runId)) {
    throw new Error('persist requires a single runId');
  }
  if (Array.isArray(record.runs) || Array.isArray(record.receipts)) {
    throw new Error('persist refuses averaged or multi-run records');
  }
  writeFileSync(
    resolve(filePath),
    `${JSON.stringify(record, null, 2)}\n`,
    'utf8'
  );
  return resolve(filePath);
}

export function readRunOutcome(filePath) {
  const parsed = JSON.parse(readFileSync(resolve(filePath), 'utf8'));
  if (Array.isArray(parsed)) {
    throw new Error('run-outcome file must contain exactly one run');
  }
  if (!isObject(parsed) || parsed.schema !== RUN_OUTCOME_SCHEMA) {
    throw new Error(`run-outcome file must be ${RUN_OUTCOME_SCHEMA}`);
  }
  if (!hasText(parsed.runId)) {
    throw new Error('run-outcome file is missing runId');
  }
  if (Array.isArray(parsed.runs)) {
    throw new Error('run-outcome file must not average multiple runs');
  }
  return parsed;
}

/**
 * Run the existing screen-certification harness, then verify that one receipt.
 *
 * @param {{
 *   runId?: string,
 *   claim?: object,
 *   certOptions?: object,
 *   persistTo?: string,
 *   previous?: object | null,
 *   includeShadow?: boolean,
 * }} [input]
 */
export function verifyScreenCertRun({
  runId,
  claim,
  certOptions = {},
  persistTo,
  previous = null,
} = {}) {
  const result = runScreenCertification(certOptions);
  return verifyRunOutcome({
    runId,
    claim,
    receipt: result.receipt,
    persistTo,
    previous,
  });
}
