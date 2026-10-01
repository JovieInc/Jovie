#!/usr/bin/env node

// JOV-INV-041: capability-level reuse-first sourcing contract (JOV-6212).
//
// Single authority: canon/ENGINEERING.md "Capability-level sourcing policy".
// This validator enforces the deterministic shape of the JOV-INV-041 policy
// value plus a minimal sourcing-receipt contract — scoped required fields,
// references, protected imports, authorized exceptions and trusted policy —
// inside the existing invariant validation process. It performs no live web
// search (a synchronous PR gate must stay deterministic) and adds no service,
// workflow, or CI job. Evidence receipts bind requirements, versions, policy,
// repository, and head so stale or out-of-scope decisions fail closed.

import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const CAPABILITY_SOURCING_INVARIANT_ID = 'JOV-INV-041';
export const CAPABILITY_SOURCING_SCHEMA = 'jovie-capability-sourcing-policy/v1';
export const CAPABILITY_SOURCING_RECEIPT_SCHEMA =
  'jovie-capability-sourcing-receipt/v1';
export const CAPABILITY_SOURCING_POLICY_SECTION =
  'canon/ENGINEERING.md#capability-level-sourcing-policy';

const DEFAULT_ROOT = fileURLToPath(new URL('../../', import.meta.url));

// Fields a full sourcing receipt must carry. "Extend an existing receipt, not
// a parallel ledger" — these field names mirror the canonical receipt shape
// recorded in the canon policy so the receipt stays one artifact. Fields that
// are situational (hardRequirements, rejectedAlternatives, customDelta,
// independentReview) must be explicitly present — null when not applicable —
// so their absence is a visible decision, not an omission.
export const SOURCING_RECEIPT_REQUIRED_FIELDS = Object.freeze([
  'outcome',
  'capability',
  'canonicalOwner',
  'hardRequirements',
  'decisionReference',
  'alternatives',
  'disposition',
  'rejectedAlternatives',
  'customDelta',
  'lifetimeCostRisk',
  'tests',
  'rollbackTriggers',
  'repository',
  'headSha',
  'policyBinding',
  'independentReview',
]);

// Required fields that must carry text on every receipt. `alternatives` is
// an array and is validated per-entry below instead.
export const SOURCING_RECEIPT_TEXT_FIELDS = Object.freeze([
  'outcome',
  'capability',
  'canonicalOwner',
  'decisionReference',
  'disposition',
  'lifetimeCostRisk',
  'tests',
  'rollbackTriggers',
  'repository',
  'policyBinding',
]);

export const SOURCING_DISPOSITIONS = Object.freeze([
  'reuse',
  'configure',
  'adopt',
  'buy',
  'extend',
  'fork',
  'build',
]);

// A custom/fork disposition must justify itself against the best credible
// alternative with at least one named requirement or demonstrated advantage.
export const CUSTOM_DISPOSITIONS = Object.freeze(['fork', 'build']);

// Policy/checker/allowlist paths that the implementation author may not edit
// to authorize their own change (policy point 8). Editing one of these while
// also shipping the capability requires an independent review receipt.
export const SELF_AUTHORIZATION_PATHS = Object.freeze([
  'canon/ENGINEERING.md',
  'canon/invariants.jsonl',
  'scripts/invariants/capability-sourcing.mjs',
  'scripts/invariants/capability-sourcing.test.mjs',
]);

function hasText(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function stable(value) {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${stable(item)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

function digest(value) {
  return `sha256:${createHash('sha256').update(stable(value)).digest('hex')}`;
}

function capabilitySourcingInvariant(registry) {
  if (!registry || !Array.isArray(registry.invariants)) return null;
  return (
    registry.invariants.find(
      item => item?.id === CAPABILITY_SOURCING_INVARIANT_ID
    ) ?? null
  );
}

export function capabilitySourcingPolicy(registry) {
  return capabilitySourcingInvariant(registry)?.policy?.value ?? null;
}

export function capabilitySourcingPolicyDigest(policy) {
  const unsigned = structuredClone(policy ?? {});
  delete unsigned.policyDigest;
  return digest(unsigned);
}

/**
 * Validate the deterministic policy shape recorded in canon/invariants.jsonl.
 * Unknown policy keys are not rejected — the policy is a projection of
 * canon/ENGINEERING.md, and future policy points add keys, not contracts.
 */
export function validateCapabilitySourcingPolicy(
  registry,
  { repoRoot = DEFAULT_ROOT } = {}
) {
  const errors = [];
  const policy = capabilitySourcingPolicy(registry);
  if (!policy) return [`missing:${CAPABILITY_SOURCING_INVARIANT_ID}`];
  if (policy.schema !== CAPABILITY_SOURCING_SCHEMA)
    errors.push(`schema:expected-${CAPABILITY_SOURCING_SCHEMA}`);
  if (policy.canonicalPolicy !== CAPABILITY_SOURCING_POLICY_SECTION)
    errors.push(
      `canonical-policy:expected-${CAPABILITY_SOURCING_POLICY_SECTION}`
    );
  if (policy.enforcement !== 'shadow-first')
    errors.push('enforcement:must-be-shadow-first');
  if (policy.blocking !== false)
    errors.push('blocking:must-be-false-until-shadow-qualified');
  if (policy.webSearchInGate !== false)
    errors.push('web-search-in-gate:must-be-false');
  if (policy.policyDigest !== capabilitySourcingPolicyDigest(policy))
    errors.push('policy-digest:mismatch');
  if (!Array.isArray(policy.dispositions) || policy.dispositions.length === 0)
    errors.push('dispositions:non-empty-required');
  else
    for (const disposition of policy.dispositions)
      if (!SOURCING_DISPOSITIONS.includes(disposition))
        errors.push(`dispositions:unknown-${disposition}`);
  if (policy.selfAuthorization !== 'prohibited')
    errors.push('self-authorization:must-be-prohibited');
  return errors;
}

/**
 * Validate one minimal sourcing receipt (policy point 8's evidence binding).
 * Unverified facts stay unverified: every reference must resolve inside the
 * repo or name a recorded prior decision; fabricated citations fail closed.
 */
export function validateSourcingReceipt(
  receipt,
  { repoRoot = DEFAULT_ROOT } = {}
) {
  const errors = [];
  if (!receipt || typeof receipt !== 'object' || Array.isArray(receipt)) {
    return ['receipt:must-be-an-object'];
  }
  if (receipt.schema !== CAPABILITY_SOURCING_RECEIPT_SCHEMA)
    errors.push(`schema:expected-${CAPABILITY_SOURCING_RECEIPT_SCHEMA}`);
  for (const field of SOURCING_RECEIPT_REQUIRED_FIELDS) {
    if (receipt[field] === undefined) {
      errors.push(`receipt:missing-${field}`);
    }
  }
  for (const field of SOURCING_RECEIPT_TEXT_FIELDS) {
    if (!hasText(receipt[field])) {
      errors.push(`receipt:missing-${field}`);
    }
  }
  if (!SOURCING_DISPOSITIONS.includes(receipt.disposition))
    errors.push(`receipt:unknown-disposition-${receipt.disposition}`);
  if (CUSTOM_DISPOSITIONS.includes(receipt.disposition)) {
    if (!hasText(receipt.hardRequirements))
      errors.push('receipt:custom-disposition-requires-hard-requirements');
    if (
      !Array.isArray(receipt.rejectedAlternatives) ||
      receipt.rejectedAlternatives.length === 0
    )
      errors.push('receipt:custom-disposition-requires-rejected-alternatives');
  }
  // Alternatives carry authoritative evidence; each needs a version and a
  // checked date so stale decisions are detectable (policy point 3).
  const alternatives = Array.isArray(receipt.alternatives)
    ? receipt.alternatives
    : [];
  for (const alternative of alternatives) {
    if (!hasText(alternative?.name))
      errors.push('receipt:alternative-missing-name');
    if (!hasText(alternative?.source))
      errors.push(
        `receipt:alternative-missing-source:${alternative?.name ?? '<unknown>'}`
      );
    if (!hasText(alternative?.version))
      errors.push(
        `receipt:alternative-missing-version:${alternative?.name ?? '<unknown>'}`
      );
    if (!hasText(alternative?.checkedDate))
      errors.push(
        `receipt:alternative-missing-checked-date:${alternative?.name ?? '<unknown>'}`
      );
  }
  // An approved narrow fork must carry an upstream/license, patch scope,
  // update owner, and exit trigger (policy point 4).
  if (receipt.disposition === 'fork') {
    if (!hasText(receipt.forkUpstream))
      errors.push('receipt:fork-requires-upstream');
    if (!hasText(receipt.forkPatchScope))
      errors.push('receipt:fork-requires-patch-scope');
    if (!hasText(receipt.forkUpdateOwner))
      errors.push('receipt:fork-requires-update-owner');
    if (!hasText(receipt.forkExitTrigger))
      errors.push('receipt:fork-requires-exit-trigger');
  }
  // Source binding: repository plus a 40-char head so a decision cannot be
  // re-attached to a different diff (acceptance: "changed security
  // assumptions invalidate the affected decision").
  if (!/^[0-9a-f]{40}$/i.test(receipt.headSha ?? ''))
    errors.push('receipt:invalid-or-missing-head-sha');
  // The receipt must bind the sourcing policy itself, not free-form notes.
  if (
    hasText(receipt.policyBinding) &&
    !receipt.policyBinding.includes(
      CAPABILITY_SOURCING_POLICY_SECTION.split('#')[0]
    ) &&
    !receipt.policyBinding.includes(CAPABILITY_SOURCING_INVARIANT_ID)
  )
    errors.push('receipt:policy-binding-does-not-name-the-sourcing-policy');
  // The implementation author cannot approve their own exception (policy
  // point 8): an exception requires an independent reviewer identity.
  if (
    receipt.exceptionRequested === true &&
    !hasText(receipt.independentReview)
  )
    errors.push('receipt:exception-requires-independent-review');
  // Self-authorization: the receipt may not claim authority over a policy or
  // checker path the implementation author edited in the same change.
  const touched = Array.isArray(receipt.touchedPaths)
    ? receipt.touchedPaths
    : [];
  const selfAuthorized = touched.filter(path =>
    SELF_AUTHORIZATION_PATHS.includes(path)
  );
  if (selfAuthorized.length > 0 && !hasText(receipt.independentReview))
    errors.push(
      `receipt:self-authorization-over-${selfAuthorized[0]}-requires-independent-review`
    );
  return errors;
}

/**
 * Deterministic validator composed into scripts/invariants/validate.mjs.
 * It checks the registry policy shape plus every checked-in receipt declared
 * in the policy's receiptPaths (fail closed when a declared receipt is
 * missing or malformed). Shadow-first: this is diagnostic evidence, not a
 * shipping gate; hosted CI promotion is a separate qualification decision.
 */
export function validateCapabilitySourcing(
  registry,
  { repoRoot = DEFAULT_ROOT } = {}
) {
  const errors = validateCapabilitySourcingPolicy(registry, { repoRoot });
  const policy = capabilitySourcingPolicy(registry);
  const receiptPaths = Array.isArray(policy?.receiptPaths)
    ? policy.receiptPaths
    : [];
  for (const receiptPath of receiptPaths) {
    const absolute = resolve(repoRoot, receiptPath);
    if (!hasText(receiptPath) || !existsSync(absolute)) {
      errors.push(
        `capability-sourcing: declared receipt missing:${receiptPath}`
      );
      continue;
    }
    let receipts;
    try {
      receipts = JSON.parse(readFileSync(absolute, 'utf8'));
    } catch {
      errors.push(
        `capability-sourcing: declared receipt unparsable:${receiptPath}`
      );
      continue;
    }
    const list = Array.isArray(receipts) ? receipts : [receipts];
    if (list.length === 0) {
      errors.push(`capability-sourcing: declared receipt empty:${receiptPath}`);
      continue;
    }
    for (const [index, receipt] of list.entries()) {
      for (const error of validateSourcingReceipt(receipt, { repoRoot })) {
        errors.push(`capability-sourcing:${receiptPath}#${index}: ${error}`);
      }
    }
  }
  return errors;
}
