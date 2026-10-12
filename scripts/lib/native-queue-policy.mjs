import { readFileSync } from 'node:fs';
import { load as loadYaml } from 'js-yaml';

export const NATIVE_QUEUE_POLICY_SOURCE = new URL(
  '../../.github/rulesets/branch-protection.yml',
  import.meta.url
);

export const NATIVE_QUEUE_POLICY_FIELDS = Object.freeze([
  'check_response_timeout_minutes',
  'grouping_strategy',
  'max_entries_to_build',
  'max_entries_to_merge',
  'merge_method',
  'min_entries_to_merge',
  'min_entries_to_merge_wait_minutes',
]);

function policySourceError(message) {
  throw new Error(`Invalid native merge-queue source policy: ${message}`);
}

/**
 * Read the native queue parameters from the checked-in GitHub ruleset source.
 * This is deliberately the only owner of the expected live values; admission
 * and readback import the result instead of carrying a second literal copy.
 *
 * @param {string} source
 */
export function parseNativeQueuePolicySource(source) {
  let document;
  try {
    document = loadYaml(source);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    policySourceError(`YAML parse failed: ${reason}`);
  }
  if (!document || typeof document !== 'object' || Array.isArray(document)) {
    policySourceError('document must be an object');
  }
  const queueRules = Array.isArray(document.rules)
    ? document.rules.filter(rule => rule?.type === 'merge_queue')
    : [];
  if (queueRules.length !== 1) {
    policySourceError('rules must contain exactly one merge_queue entry');
  }
  const parameters = queueRules[0].parameters;
  if (
    !parameters ||
    typeof parameters !== 'object' ||
    Array.isArray(parameters)
  ) {
    policySourceError('merge_queue parameters must be an object');
  }
  const actualFields = Object.keys(parameters).sort();
  const expectedFields = [...NATIVE_QUEUE_POLICY_FIELDS].sort();
  if (JSON.stringify(actualFields) !== JSON.stringify(expectedFields)) {
    policySourceError(
      `merge_queue parameters must contain exactly: ${expectedFields.join(', ')}`
    );
  }

  const policy = Object.fromEntries(
    NATIVE_QUEUE_POLICY_FIELDS.map(field => [field, parameters[field]])
  );
  for (const field of [
    'check_response_timeout_minutes',
    'max_entries_to_build',
    'max_entries_to_merge',
    'min_entries_to_merge',
  ]) {
    if (!Number.isSafeInteger(policy[field]) || policy[field] < 1) {
      policySourceError(`${field} must be a positive integer`);
    }
  }
  if (
    !Number.isSafeInteger(policy.min_entries_to_merge_wait_minutes) ||
    policy.min_entries_to_merge_wait_minutes < 0
  ) {
    policySourceError(
      'min_entries_to_merge_wait_minutes must be a non-negative integer'
    );
  }
  if (!['ALLGREEN', 'HEADGREEN'].includes(policy.grouping_strategy)) {
    policySourceError('grouping_strategy must be ALLGREEN or HEADGREEN');
  }
  if (!['MERGE', 'REBASE', 'SQUASH'].includes(policy.merge_method)) {
    policySourceError('merge_method must be MERGE, REBASE, or SQUASH');
  }
  return policy;
}

export const NATIVE_QUEUE_POLICY = Object.freeze(
  parseNativeQueuePolicySource(readFileSync(NATIVE_QUEUE_POLICY_SOURCE, 'utf8'))
);
