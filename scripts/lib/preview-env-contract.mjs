/**
 * Canonical admission/receipt contract for hosted previews and ephemeral
 * databases (JOV-5941).
 *
 * Policy: the normal development path is local/CI proof -> main -> staging.
 * A PR never automatically creates a hosted Vercel preview or a Neon branch.
 * Hosted isolation exists only as an explicit, expiring exception admitted by
 * policy (`requires_preview` risk) or by manual dispatch, and every admitted
 * environment carries the full admission contract below plus a cleanup
 * receipt when it is torn down.
 */

export const PREVIEW_ENV_ADMISSION_SCHEMA = 'jovie-preview-env-admission/v1';
export const PREVIEW_ENV_CLEANUP_SCHEMA = 'jovie-preview-env-cleanup/v1';
export const PREVIEW_ENV_REGISTRY_SCHEMA = 'jovie-preview-env-registry/v1';
export const PREVIEW_ENV_REGISTRY_PATH = '.github/preview-env-registry.json';

/** Hosted isolation kinds that require an admission contract. */
export const EPHEMERAL_KINDS = ['vercel-preview', 'neon-branch'];

/** Standing surfaces are not exceptions and never require admission. */
export const STANDING_KINDS = ['staging', 'production', 'shadow'];

export const CLEANUP_TRIGGERS = [
  'pr-closed',
  'merged',
  'cancelled',
  'superseded',
  'terminal-proof',
  'ttl',
  'heartbeat-reconciliation',
];

const SHA_PATTERN = /^[0-9a-f]{40}$/;
const WORK_ID_PATTERN =
  /^(?:JOV|LYB)-\d+$|^manual-dispatch$|^scheduled-evidence$/;
const ISO_PATTERN =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:?\d{2})$/;

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function isIsoTimestamp(value) {
  return (
    isNonEmptyString(value) &&
    ISO_PATTERN.test(value) &&
    !Number.isNaN(Date.parse(value))
  );
}

/**
 * Validate an admission record. Returns a list of problems; an empty list
 * means the record satisfies the canonical admission contract.
 */
export function validatePreviewEnvAdmission(record) {
  const problems = [];
  if (!record || typeof record !== 'object' || Array.isArray(record)) {
    return ['admission record must be an object'];
  }
  if (record.schema !== PREVIEW_ENV_ADMISSION_SCHEMA) {
    problems.push(`schema must be ${PREVIEW_ENV_ADMISSION_SCHEMA}`);
  }
  if (!EPHEMERAL_KINDS.includes(record.kind)) {
    problems.push(`kind must be one of ${EPHEMERAL_KINDS.join(', ')}`);
  }
  if (
    !isNonEmptyString(record.workId) ||
    !WORK_ID_PATTERN.test(record.workId)
  ) {
    problems.push(
      'workId must be a Linear id (JOV-/LYB-), manual-dispatch, or scheduled-evidence'
    );
  }
  if (!isNonEmptyString(record.sha) || !SHA_PATTERN.test(record.sha)) {
    problems.push('sha must be the exact 40-hex commit the environment serves');
  }
  if (!isNonEmptyString(record.policy)) {
    problems.push('policy must name the admitting policy/action');
  }
  if (!isNonEmptyString(record.reason) || record.reason.trim().length < 10) {
    problems.push('reason must explain the request in at least 10 characters');
  }
  if (!isNonEmptyString(record.requiredEvidence)) {
    problems.push(
      'requiredEvidence must name evidence normal CI/staging cannot produce'
    );
  }
  if (!isNonEmptyString(record.owner)) {
    problems.push('owner must name the accountable system or person');
  }
  if (!isNonEmptyString(record.surface)) {
    problems.push('surface must name the affected product/data surface');
  }
  if (!isIsoTimestamp(record.createdAt)) {
    problems.push('createdAt must be an ISO-8601 timestamp');
  }
  if (!isIsoTimestamp(record.expiresAt)) {
    problems.push('expiresAt must be an ISO-8601 timestamp');
  }
  if (
    isIsoTimestamp(record.createdAt) &&
    isIsoTimestamp(record.expiresAt) &&
    Date.parse(record.expiresAt) <= Date.parse(record.createdAt)
  ) {
    problems.push('expiresAt must be after createdAt (hard expiration)');
  }
  if (
    !isNonEmptyString(record.cleanupTrigger) ||
    !CLEANUP_TRIGGERS.includes(record.cleanupTrigger)
  ) {
    problems.push(
      `cleanupTrigger must be one of ${CLEANUP_TRIGGERS.join(', ')}`
    );
  }
  if (!isNonEmptyString(record.cleanupProof)) {
    problems.push('cleanupProof must describe the expected cleanup evidence');
  }
  if (!isNonEmptyString(record.costBudget)) {
    problems.push('costBudget must bound the resource spend');
  }
  return problems;
}

/**
 * An environment only counts as certification evidence while its admission is
 * valid and unexpired. Expired or unknown environments never count.
 */
export function isLivePreviewEnvAdmission(record, { now = Date.now() } = {}) {
  if (validatePreviewEnvAdmission(record).length > 0) return false;
  return Date.parse(record.expiresAt) > now;
}

/** Validate a cleanup receipt. Returns a list of problems (empty = valid). */
export function validatePreviewEnvCleanupReceipt(record) {
  const problems = [];
  if (!record || typeof record !== 'object' || Array.isArray(record)) {
    return ['cleanup receipt must be an object'];
  }
  if (record.schema !== PREVIEW_ENV_CLEANUP_SCHEMA) {
    problems.push(`schema must be ${PREVIEW_ENV_CLEANUP_SCHEMA}`);
  }
  if (!EPHEMERAL_KINDS.includes(record.kind)) {
    problems.push(`kind must be one of ${EPHEMERAL_KINDS.join(', ')}`);
  }
  if (!isNonEmptyString(record.environment)) {
    problems.push(
      'environment must identify the exact environment that was cleaned'
    );
  }
  if (
    !isNonEmptyString(record.cleanupTrigger) ||
    !CLEANUP_TRIGGERS.includes(record.cleanupTrigger)
  ) {
    problems.push(
      `cleanupTrigger must be one of ${CLEANUP_TRIGGERS.join(', ')}`
    );
  }
  if (!isIsoTimestamp(record.cleanedAt)) {
    problems.push('cleanedAt must be an ISO-8601 timestamp');
  }
  if (!isNonEmptyString(record.cleanupProof)) {
    problems.push('cleanupProof must record the observed cleanup evidence');
  }
  if (!isNonEmptyString(record.cleanedBy)) {
    problems.push('cleanedBy must name the workflow/job that ran cleanup');
  }
  return problems;
}

/** Build a validated admission record. Throws on contract violations. */
export function buildPreviewEnvAdmission(fields) {
  const record = { schema: PREVIEW_ENV_ADMISSION_SCHEMA, ...fields };
  const problems = validatePreviewEnvAdmission(record);
  if (problems.length > 0) {
    throw new Error(`Invalid preview-env admission: ${problems.join('; ')}`);
  }
  return record;
}

/** Build a validated cleanup receipt. Throws on contract violations. */
export function buildPreviewEnvCleanupReceipt(fields) {
  const record = { schema: PREVIEW_ENV_CLEANUP_SCHEMA, ...fields };
  const problems = validatePreviewEnvCleanupReceipt(record);
  if (problems.length > 0) {
    throw new Error(
      `Invalid preview-env cleanup receipt: ${problems.join('; ')}`
    );
  }
  return record;
}

/**
 * Validate the canonical registry of hosted-environment creation sites.
 * Every workflow that creates a preview/ephemeral database must be covered
 * by an entry; ephemeral entries must carry the full admission binding.
 * Returns a list of problems (empty = valid).
 */
export function validatePreviewEnvRegistry(registry) {
  const problems = [];
  if (!registry || typeof registry !== 'object' || Array.isArray(registry)) {
    return ['registry must be an object'];
  }
  if (registry.schema !== PREVIEW_ENV_REGISTRY_SCHEMA) {
    problems.push(`schema must be ${PREVIEW_ENV_REGISTRY_SCHEMA}`);
  }
  if (!Array.isArray(registry.entries) || registry.entries.length === 0) {
    problems.push('entries must be a non-empty array');
    return problems;
  }
  const ids = new Set();
  registry.entries.forEach((entry, index) => {
    const where = `entries[${index}]`;
    if (!entry || typeof entry !== 'object') {
      problems.push(`${where}: entry must be an object`);
      return;
    }
    if (!isNonEmptyString(entry.id)) {
      problems.push(`${where}: id is required`);
    } else if (ids.has(entry.id)) {
      problems.push(`${where}: duplicate id ${entry.id}`);
    } else {
      ids.add(entry.id);
    }
    if (
      !isNonEmptyString(entry.workflow) ||
      !entry.workflow.startsWith('.github/workflows/')
    ) {
      problems.push(`${where}: workflow must be a .github/workflows/ path`);
    }
    const kinds = [...EPHEMERAL_KINDS, ...STANDING_KINDS];
    if (!kinds.includes(entry.kind)) {
      problems.push(`${where}: kind must be one of ${kinds.join(', ')}`);
    }
    if (typeof entry.ephemeral !== 'boolean') {
      problems.push(`${where}: ephemeral must be a boolean`);
    }
    if (entry.ephemeral === true) {
      if (!EPHEMERAL_KINDS.includes(entry.kind)) {
        problems.push(`${where}: ephemeral entries must use an ephemeral kind`);
      }
      const admission = entry.admission;
      if (!admission || typeof admission !== 'object') {
        problems.push(
          `${where}: ephemeral entries require an admission binding`
        );
      } else {
        for (const field of [
          'policy',
          'reason',
          'evidencePurpose',
          'owner',
          'surface',
          'cleanupTrigger',
          'cleanupProof',
          'costBudget',
        ]) {
          if (!isNonEmptyString(admission[field])) {
            problems.push(`${where}: admission.${field} is required`);
          }
        }
        if (
          !Number.isInteger(admission.ttlHours) ||
          admission.ttlHours < 1 ||
          admission.ttlHours > 24 * 14
        ) {
          problems.push(
            `${where}: admission.ttlHours must be an integer between 1 and 336`
          );
        }
      }
    }
    if (entry.ephemeral === false && !isNonEmptyString(entry.reason)) {
      problems.push(
        `${where}: standing entries must record why they are not an exception`
      );
    }
  });
  return problems;
}
