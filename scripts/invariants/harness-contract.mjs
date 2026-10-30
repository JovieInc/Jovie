// JOV-INV-024: compose the nine OpenAI harness-engineering principles into
// existing Jovie controls. canon/invariants.jsonl stays the sole authority
// ledger; this pure validator enforces the harness-specific contract shape on
// the JOV-INV-024 policy value inside the existing invariant validation
// process. It adds no service, polling loop, LLM judge, API call, workflow,
// required context, or CI job, and it runs in the same process as the
// existing registry validation.

import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const HARNESS_CONTRACT_INVARIANT_ID = 'JOV-INV-024';
export const HARNESS_CONTRACT_SCHEMA = 'jovie-harness-contract/v1';
export const HARNESS_RECEIPT_SCHEMA = 'jovie-harness-receipt/v1';
export const HARNESS_SOURCE_URL =
  'https://openai.com/index/harness-engineering/';
export const HARNESS_PRINCIPLE_COUNT = 9;
export const HARNESS_POLICY_OWNER = 'Summer';
export const HARNESS_RECEIPT_COMMAND =
  'node scripts/invariants/validate.mjs --harness-json';
export const HARNESS_STATUSES = Object.freeze(['enforced', 'partial']);

const DEFAULT_ROOT = fileURLToPath(new URL('../../', import.meta.url));

const EXPECTED_PRINCIPLE_IDS = Object.freeze(
  Array.from({ length: HARNESS_PRINCIPLE_COUNT }, (_, i) => `H-0${i + 1}`)
);

const REQUIRED_PRINCIPLE_FIELDS = Object.freeze([
  'principle',
  'title',
  'sourceSection',
  'executionOwner',
  'receipt',
  'status',
]);

/** @type {ReadonlyArray<readonly [string, ReadonlyArray<string>]>} */
const REQUIRED_NESTED_FIELDS = Object.freeze([
  ['trigger', ['event', 'cadence']],
  ['gate', ['name', 'path']],
  ['deliberateRed', ['path', 'name']],
  ['audience', ['router', 'scoped', 'operator']],
]);

const REQUIRED_EXCEPTION_FIELDS = Object.freeze([
  'id',
  'owner',
  'expires',
  'missingClosure',
  'nextAction',
]);

function hasText(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function utcDay(value) {
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    return new Date(
      Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate())
    );
  }
  if (!hasText(value)) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const day = new Date(`${match[0]}T00:00:00Z`);
  return Number.isNaN(day.getTime()) ? null : day;
}

export function harnessContractInvariant(registry) {
  if (!registry || !Array.isArray(registry.invariants)) return null;
  return (
    registry.invariants.find(
      item => item?.id === HARNESS_CONTRACT_INVARIANT_ID
    ) ?? null
  );
}

/**
 * Validate the JOV-INV-024 harness contract recorded in the canonical
 * registry. Returns a list of stable, greppable error strings; an empty list
 * means the contract holds. File access is injectable so deliberate-red
 * tests never touch the real tree.
 */
export function validateHarnessContract(registry, options = {}) {
  const repoRoot = options.repoRoot ?? DEFAULT_ROOT;
  const now = utcDay(options.now ?? new Date()) ?? new Date();
  const fileExists =
    options.fileExists ?? (path => existsSync(resolve(repoRoot, path)));
  const readFile =
    options.readFile ?? (path => readFileSync(resolve(repoRoot, path), 'utf8'));

  const errors = [];
  const invariant = harnessContractInvariant(registry);
  if (!invariant) {
    return [
      `harness-contract-missing: ${HARNESS_CONTRACT_INVARIANT_ID} is absent from canon/invariants.jsonl`,
    ];
  }
  if (invariant.lifecycle?.state !== 'adopted') {
    errors.push(
      `harness-contract-not-adopted: ${HARNESS_CONTRACT_INVARIANT_ID} must be adopted`
    );
  }
  const policy = invariant.policy?.value;
  if (policy?.schema !== HARNESS_CONTRACT_SCHEMA) {
    errors.push(
      `harness-contract-schema: policy.value.schema must be ${HARNESS_CONTRACT_SCHEMA}`
    );
  }
  if (policy?.source?.url !== HARNESS_SOURCE_URL) {
    errors.push(
      `harness-source-not-canonical: source.url must be ${HARNESS_SOURCE_URL}`
    );
  }

  const principles = Array.isArray(policy?.principles) ? policy.principles : [];
  if (principles.length !== HARNESS_PRINCIPLE_COUNT) {
    errors.push(
      `harness-principles-count: expected ${HARNESS_PRINCIPLE_COUNT}, found ${principles.length}`
    );
  }
  const seen = new Set();
  for (const principle of principles) {
    if (!hasText(principle?.id)) continue;
    if (seen.has(principle.id)) {
      errors.push(`harness-principle-duplicate: ${principle.id}`);
    }
    seen.add(principle.id);
  }
  for (const id of EXPECTED_PRINCIPLE_IDS) {
    if (!seen.has(id)) errors.push(`harness-principle-missing: ${id}`);
  }

  for (const principle of principles) {
    const id = hasText(principle?.id) ? principle.id : '<unknown>';
    if (!hasText(principle?.id)) {
      errors.push(`harness-principle-incomplete:${id}:id`);
    }
    for (const field of REQUIRED_PRINCIPLE_FIELDS) {
      if (!hasText(principle?.[field])) {
        errors.push(`harness-principle-incomplete:${id}:${field}`);
      }
    }
    for (const [key, fields] of REQUIRED_NESTED_FIELDS) {
      for (const field of fields) {
        if (!hasText(principle?.[key]?.[field])) {
          errors.push(`harness-principle-incomplete:${id}:${key}.${field}`);
        }
      }
    }
    if (principle?.policyOwner !== HARNESS_POLICY_OWNER) {
      errors.push(
        `harness-policy-owner:${id}: policy owner must be ${HARNESS_POLICY_OWNER}`
      );
    }
    if (hasText(principle?.gate?.path) && !fileExists(principle.gate.path)) {
      errors.push(
        `harness-gate-missing:${id}: gate ${principle.gate.path} does not exist`
      );
    }
    if (
      hasText(principle?.deliberateRed?.path) &&
      hasText(principle?.deliberateRed?.name)
    ) {
      if (!fileExists(principle.deliberateRed.path)) {
        errors.push(
          `harness-deliberate-red:${id}: fixture ${principle.deliberateRed.path} does not exist`
        );
      } else if (
        !readFile(principle.deliberateRed.path).includes(
          principle.deliberateRed.name
        )
      ) {
        errors.push(
          `harness-deliberate-red:${id}: fixture ${principle.deliberateRed.path} does not name ${principle.deliberateRed.name}`
        );
      }
    }
    if (!HARNESS_STATUSES.includes(principle?.status)) {
      errors.push(`harness-status:${id}: status must be enforced or partial`);
    }
    if (
      !hasText(principle?.receipt) ||
      !principle.receipt.includes('--harness-json')
    ) {
      errors.push(
        `harness-receipt:${id}: receipt must name the deterministic receipt command (${HARNESS_RECEIPT_COMMAND})`
      );
    }

    const exception = principle?.exception ?? null;
    if (principle?.status === 'enforced' && exception) {
      errors.push(
        `harness-exception-unexpected:${id}: enforced principle carries an exception`
      );
    }
    if (principle?.status === 'partial') {
      if (!exception) {
        errors.push(
          `harness-exception-missing:${id}: partial principle needs a Summer-owned expiring exception`
        );
      } else {
        for (const field of REQUIRED_EXCEPTION_FIELDS) {
          if (!hasText(exception[field])) {
            errors.push(`harness-exception-incomplete:${id}:${field}`);
          }
        }
        const expectedExceptionId = id.replace(/^H-/, 'H-EX-');
        if (hasText(exception.id) && exception.id !== expectedExceptionId) {
          errors.push(
            `harness-exception-id:${id}: exception id must be ${expectedExceptionId}`
          );
        }
        if (
          hasText(exception.owner) &&
          exception.owner !== HARNESS_POLICY_OWNER
        ) {
          errors.push(
            `harness-exception-owner:${id}: exception owner must be ${HARNESS_POLICY_OWNER}`
          );
        }
        if (hasText(exception.expires)) {
          const expiry = utcDay(exception.expires);
          if (!expiry) {
            errors.push(
              `harness-exception-expiry-format:${id}: expires must be YYYY-MM-DD`
            );
          } else if (now.getTime() > expiry.getTime()) {
            errors.push(
              `harness-exception-expired:${id}: ${exception.id} expired on ${exception.expires}; ${HARNESS_POLICY_OWNER} must close or renew it`
            );
          }
        }
      }
    }
  }
  return errors;
}

/**
 * Build the deterministic JSON receipt emitted by
 * `node scripts/invariants/validate.mjs --harness-json`.
 */
export function buildHarnessReceipt(registry, options = {}) {
  const now = utcDay(options.now ?? new Date()) ?? new Date();
  const policy = harnessContractInvariant(registry)?.policy?.value ?? {};
  const principles = Array.isArray(policy.principles) ? policy.principles : [];
  const exceptions = principles
    .filter(principle => principle?.status === 'partial')
    .map(principle => ({
      exception: principle.exception?.id ?? null,
      principle: principle.id,
      owner: principle.exception?.owner ?? null,
      expires: principle.exception?.expires ?? null,
      nextAction: principle.exception?.nextAction ?? null,
    }));
  return {
    schema: HARNESS_RECEIPT_SCHEMA,
    invariant: HARNESS_CONTRACT_INVARIANT_ID,
    source: HARNESS_SOURCE_URL,
    receiptDay: now.toISOString().slice(0, 10),
    principles: principles.length,
    enforced: principles.filter(item => item?.status === 'enforced').length,
    partial: exceptions.length,
    exceptions,
    overhead: {
      addedProcesses: 0,
      addedCiJobs: 0,
      apiCalls: 0,
      llmCalls: 0,
      dollarCost: 0,
    },
  };
}
