/**
 * Per-run outcome verification (JOV-6051).
 *
 * After a cert/evidence run, bind claim vs evidence vs a single explicit
 * outcome. No silent green, no averaged failures, no model-written
 * certification. Only the executable harness may set `certified:true`.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  attachJevShadow,
  classifyJevShadow,
  evidenceFingerprint,
} from './jev-shadow.mjs';
import {
  runScreenCertification,
  SCREEN_CERT_GATE,
  SCREEN_CERT_INVARIANT_ID,
  SCREEN_CERT_SCHEMA,
} from './screen-certification.mjs';

export const RUN_OUTCOME_SCHEMA = 'run-outcome/v1';
export const RUN_OUTCOMES = Object.freeze(['pass', 'fail', 'unresolved']);
export const CERTIFIER_HARNESS = 'harness';
export {
  ALIGNMENT_CLASSES,
  GATEWAY_MODEL_ALLOWLIST,
  JEV_MODEL,
  JEV_SHADOW_SCHEMA,
} from './jev-shadow.mjs';

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function hasText(value) {
  return typeof value === 'string' && value.trim().length > 0;
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
 * @param {{ certifier: string, certified?: boolean }} input
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
    const failed = receipt.ok === false || receipt.certified !== true;
    return failed
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
      reason:
        receipt.status === 'not-applicable' ||
        receipt.status === 'source-registered' ||
        receipt.status === 'evidence-required'
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
 *   runId: string,
 *   claim: object,
 *   receipt?: object,
 *   receipts?: object[],
 *   persistTo?: string,
 *   includeShadow?: boolean,
 *   evaluate?: Function,
 *   model?: string,
 *   previous?: object | null,
 * }} input
 */
export function verifyRunOutcome({
  runId,
  claim,
  receipt,
  receipts,
  persistTo,
  includeShadow = true,
  evaluate,
  model,
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
  if (!isObject(resolvedReceipt)) {
    issues.push('screen-certification receipt is required');
  } else if (resolvedReceipt.schema !== SCREEN_CERT_SCHEMA) {
    issues.push(`receipt schema must be ${SCREEN_CERT_SCHEMA}`);
  }

  const evidence = evidenceFromReceipt(resolvedReceipt);
  const fingerprint = evidenceFingerprint({
    runId: hasText(runId) ? runId : null,
    claim: isObject(claim) ? { statement: claim.statement } : null,
    evidence,
  });

  if (
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
    claim: isObject(claim)
      ? Object.freeze({
          statement: claim.statement ?? null,
          kind: claim.kind ?? 'screen-certification',
          expectedOutcome: claim.expectedOutcome ?? null,
          expectedCertified:
            typeof claim.expectedCertified === 'boolean'
              ? claim.expectedCertified
              : null,
          screenIds: claimedScreens(claim),
        })
      : null,
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

  const withShadow = includeShadow
    ? attachJevShadow(
        record,
        classifyJevShadow({
          claim: record.claim,
          evidence: record.evidence,
          evaluate,
          model,
          previousShadow: previous?.shadow ?? null,
        })
      )
    : Object.freeze(record);

  if (persistTo) persistRunOutcome(withShadow, persistTo);
  return withShadow;
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
 */
export function verifyScreenCertRun({
  runId,
  claim,
  certOptions = {},
  persistTo,
  includeShadow = true,
  evaluate,
  model,
  previous = null,
} = {}) {
  const result = runScreenCertification(certOptions);
  return verifyRunOutcome({
    runId,
    claim,
    receipt: result.receipt,
    persistTo,
    includeShadow,
    evaluate,
    model,
    previous,
  });
}
