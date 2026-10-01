#!/usr/bin/env node
/**
 * JOV-INV-035: capability-sourcing-receipt-v1 validator (shadow, advisory).
 *
 * Check class: capability-sourcing
 * Mode: advisory — this is the nonblocking shadow qualification required by
 * canon/ENGINEERING.md ("Qualify delivery gates in shadow before
 * enforcement"). It composes into scripts/invariants/validate.mjs and adds
 * no service, workflow, required context, or CI job.
 *
 * The gate checks the receipt CONTRACT SHAPE only (fields present, IDs
 * stable, versions/dates real values, rejected-alternative reasons stated,
 * exceptions carry an independent reviewer distinct from the author). It
 * does not fetch the web, does not judge whether a specific tool choice was
 * CORRECT, and does not block shipping while shadow-qualified — the founder
 * 2026-09-09 rule forbids a new gate from freezing otherwise qualified
 * delivery before promotion receipts exist.
 *
 * Receipts are recorded in canon/sourcing-receipts.jsonl, extending the
 * existing evidence-receipt family (JOV-6212 "extend an existing receipt,
 * not a parallel ledger").
 */

import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { readInvariantRegistry } from './registry.mjs';

export const CAPABILITY_SOURCING_INVARIANT_ID = 'JOV-INV-035';
export const CAPABILITY_SOURCING_SCHEMA =
  'jovie-capability-sourcing-receipt/v1';
export const CAPABILITY_SOURCING_SLUG =
  'jovie/coordination/capability-sourcing-receipt-v1';
export const CAPABILITY_SOURCING_CHECK_CLASS = 'capability-sourcing';
export const RECEIPTS_PATH = 'canon/sourcing-receipts.jsonl';

/** Receipt fields that must be present and non-empty on every row. */
export const REQUIRED_RECEIPT_FIELDS = Object.freeze([
  'id',
  'outcome',
  'capability',
  'canonicalOwner',
  'disposition',
  'binding',
]);

/** String-valued receipt fields; object fields type-check in their own blocks. */
const STRING_FIELDS = new Set([
  'id',
  'outcome',
  'capability',
  'canonicalOwner',
  'disposition',
]);

const DISPOSITIONS = new Set([
  'reuse',
  'configure',
  'adopt',
  'buy',
  'extend',
  'fork',
  'build',
]);

const REQUIRED_BINDING_FIELDS = Object.freeze(['repository', 'policyVersion']);

/** Dispositions that must state a concrete unmet hard requirement. */
const CUSTOM_DISPOSITIONS = new Set(['build', 'fork', 'extend']);

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const SEMVER_RE = /^\d+(\.\d+){0,3}([+.-][\w.+-]+)?$/;

const DEFAULT_ROOT = fileURLToPath(new URL('../../', import.meta.url));

function hasText(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

/**
 * @param {ReturnType<typeof readInvariantRegistry>} registry
 */
export function capabilitySourcingInvariant(registry) {
  if (!registry || !Array.isArray(registry.invariants)) return null;
  return (
    registry.invariants.find(
      item => item?.id === CAPABILITY_SOURCING_INVARIANT_ID
    ) ?? null
  );
}

/**
 * Validate the JOV-INV-035 policy value recorded in the canonical
 * invariant registry. Returns a list of stable, greppable error strings.
 */
export function validateCapabilitySourcingContract(registry) {
  const invariant = capabilitySourcingInvariant(registry);
  if (!invariant) {
    return [
      `capability-sourcing: ${CAPABILITY_SOURCING_INVARIANT_ID} is missing from the registry`,
    ];
  }
  const policy = invariant.policy?.value ?? {};
  const errors = [];
  if (policy.schema !== CAPABILITY_SOURCING_SCHEMA) {
    errors.push(
      `capability-sourcing: policy schema must be ${CAPABILITY_SOURCING_SCHEMA}`
    );
  }
  if (policy.gbrainSlug !== CAPABILITY_SOURCING_SLUG) {
    errors.push(
      `capability-sourcing: gbrain slug must be ${CAPABILITY_SOURCING_SLUG}`
    );
  }
  if (policy.checkClass !== CAPABILITY_SOURCING_CHECK_CLASS) {
    errors.push(
      `capability-sourcing: checkClass must be ${CAPABILITY_SOURCING_CHECK_CLASS}`
    );
  }
  if (policy.inventFacts !== false) {
    errors.push('capability-sourcing: must refuse invented facts');
  }
  if (policy.enforcement !== 'shadow-advisory') {
    errors.push(
      'capability-sourcing: enforcement must stay shadow-advisory until promotion receipts exist (founder 2026-09-09 rule)'
    );
  }
  if (policy.receiptsPath !== RECEIPTS_PATH) {
    errors.push(`capability-sourcing: receiptsPath must be ${RECEIPTS_PATH}`);
  }
  return errors;
}

/**
 * Validate one parsed sourcing receipt row. Returns a list of error strings
 * prefixed with the row id (or `<unknown>`).
 * @param {unknown} row
 * @returns {string[]}
 */
export function validateSourcingReceipt(row) {
  const errors = [];
  const receipt = row && typeof row === 'object' ? row : {};
  const id = hasText(receipt.id) ? receipt.id : '<unknown>';

  for (const field of REQUIRED_RECEIPT_FIELDS) {
    if (receipt[field] === undefined) {
      errors.push(`capability-sourcing ${id}: missing ${field}`);
    } else if (STRING_FIELDS.has(field) && !hasText(receipt[field])) {
      errors.push(`capability-sourcing ${id}: ${field} must be non-empty`);
    }
  }
  if (!/^jovie-sourcing-receipt-[0-9]{3}$/.test(receipt.id ?? '')) {
    errors.push(
      `capability-sourcing ${id}: id must match jovie-sourcing-receipt-NNN`
    );
  }
  if (!DISPOSITIONS.has(receipt.disposition)) {
    errors.push(
      `capability-sourcing ${id}: disposition must be one of ${[...DISPOSITIONS].join('|')}`
    );
  }
  if (CUSTOM_DISPOSITIONS.has(receipt.disposition)) {
    const hard = receipt.hardRequirement;
    if (!hasText(hardRequirementValue(hard))) {
      errors.push(
        `capability-sourcing ${id}: ${receipt.disposition} requires a concrete unmet hard requirement or demonstrated net advantage`
      );
    }
  }
  if (receipt.alternatives !== undefined) {
    if (
      !Array.isArray(receipt.alternatives) ||
      receipt.alternatives.length === 0
    ) {
      errors.push(
        `capability-sourcing ${id}: alternatives must be a non-empty array when present`
      );
    } else {
      for (const alternative of receipt.alternatives) {
        if (!hasText(alternative?.name)) {
          errors.push(
            `capability-sourcing ${id}: every alternative needs a name`
          );
        }
        if (!hasText(alternative?.source)) {
          errors.push(
            `capability-sourcing ${id}: every alternative needs an authoritative source`
          );
        }
        if (!DATE_RE.test(String(alternative?.checkedDate ?? ''))) {
          errors.push(
            `capability-sourcing ${id}: alternative ${alternative?.name ?? '<unknown>'} needs a checked date (YYYY-MM-DD)`
          );
        }
      }
    }
  }
  const binding = receipt.binding;
  if (binding && typeof binding === 'object') {
    for (const field of REQUIRED_BINDING_FIELDS) {
      if (!hasText(binding[field])) {
        errors.push(`capability-sourcing ${id}: binding.${field} is required`);
      }
    }
    if (
      binding.checkedDate !== undefined &&
      !DATE_RE.test(String(binding.checkedDate))
    ) {
      errors.push(
        `capability-sourcing ${id}: binding.checkedDate must be YYYY-MM-DD`
      );
    }
  } else {
    errors.push(`capability-sourcing ${id}: binding must be an object`);
  }
  if (receipt.versions !== undefined) {
    if (!Array.isArray(receipt.versions) || receipt.versions.length === 0) {
      errors.push(
        `capability-sourcing ${id}: versions must be a non-empty array when present`
      );
    } else {
      for (const entry of receipt.versions) {
        if (
          !entry ||
          !hasText(entry.name) ||
          !SEMVER_RE.test(String(entry.version ?? ''))
        ) {
          errors.push(
            `capability-sourcing ${id}: version entries need a name and a real version`
          );
        }
      }
    }
  }
  if (receipt.exception === true) {
    const exception = receipt.exceptionReview;
    if (
      !exception ||
      typeof exception !== 'object' ||
      !hasText(exception.reviewer) ||
      !hasText(exception.decision)
    ) {
      errors.push(
        `capability-sourcing ${id}: exception=true requires an independent exceptionReview with reviewer and decision`
      );
    }
    if (
      exception &&
      typeof exception === 'object' &&
      hasText(exception.reviewer) &&
      hasText(receipt.author) &&
      exception.reviewer === receipt.author
    ) {
      errors.push(
        `capability-sourcing ${id}: the implementation author cannot review their own exception`
      );
    }
  }
  return errors;
}

function hardRequirementValue(hard) {
  if (hasText(hard)) return hard;
  if (Array.isArray(hard)) return hard.filter(hasText).join('; ');
  return '';
}

/**
 * Load and validate the checked-in receipt ledger. Returns
 * { receipts, errors }. A missing ledger is not an error (no receipts yet);
 * an unparsable or duplicate-ledger one is.
 * @param {string} repoRoot
 */
export function loadSourcingReceipts(repoRoot = DEFAULT_ROOT) {
  const path = resolve(repoRoot, RECEIPTS_PATH);
  if (!existsSync(path)) return { receipts: [], errors: [] };
  let receipts;
  try {
    receipts = readFileSync(path, 'utf8')
      .split(/\r?\n/)
      .filter(Boolean)
      .map(line => JSON.parse(line));
  } catch (error) {
    return {
      receipts: [],
      errors: [
        `capability-sourcing: ${RECEIPTS_PATH} is not valid JSONL (${error instanceof Error ? error.message : String(error)})`,
      ],
    };
  }
  const errors = [];
  const byId = new Set();
  for (const receipt of receipts) {
    errors.push(...validateSourcingReceipt(receipt));
    if (hasText(receipt?.id)) {
      if (byId.has(receipt.id)) {
        errors.push(
          `capability-sourcing ${receipt.id}: duplicate receipt identity`
        );
      } else {
        byId.add(receipt.id);
      }
    }
  }
  return { receipts, errors };
}

/**
 * Compose the JOV-INV-035 validation into the existing invariant
 * validation process. Pure function; no network, no service.
 * @param {string} repoRoot
 * @param {{ registry?: ReturnType<typeof readInvariantRegistry> }} [options]
 */
export function validateCapabilitySourcing(
  repoRoot = DEFAULT_ROOT,
  { registry = readInvariantRegistry(repoRoot) } = {}
) {
  return [
    ...validateCapabilitySourcingContract(registry),
    ...loadSourcingReceipts(repoRoot).errors,
  ];
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const errors = validateCapabilitySourcing();
  if (errors.length) {
    for (const error of errors) process.stderr.write(`${error}\n`);
    process.exitCode = 1;
  } else {
    process.stdout.write('capability-sourcing-receipt-v1 shadow gate clean\n');
  }
}
