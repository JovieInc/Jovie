/**
 * JOV-INV-041: capability-level reuse-first sourcing decisions (JOV-6212).
 *
 * Minimal deterministic validator for the capability sourcing policy locked in
 * canon/ENGINEERING.md. It composes into the existing invariant validation
 * entrypoint (scripts/invariants/validate.mjs) — no new service, workflow, CI
 * job, or control plane. The validator proves the canonical policy surfaces
 * route agents to the capability-first decision before new or materially
 * expanded commodity work, that the router surfaces the policy exactly once,
 * and that deliberate-red regressions (a dropped router row, a capability
 * decision that names no canonical implementation/owner, no lifetime-cost
 * consideration, no independent review for exceptions) fail closed.
 *
 * Check class: policy-surface-scan. Advisory-only classification of LLM or
 * diff content stays outside this gate; the shadow qualification rule in
 * canon/ENGINEERING.md governs any later promotion to blocking enforcement.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { readInvariantRegistry } from './registry.mjs';

export const CAPABILITY_SOURCING_INVARIANT_ID = 'JOV-INV-041';
export const CAPABILITY_SOURCING_SCHEMA = 'jovie-capability-sourcing/v1';
export const CANON_ENGINEERING_PATH = 'canon/ENGINEERING.md';
export const ROUTER_PATH = 'CLAUDE.md';
export const CODE_STYLE_RULE_PATH = '.claude/rules/code-style.md';
export const TOOL_DISCOVERY_SKILL_PATH =
  '.claude/skills/tool-discovery/SKILL.md';

const REPO_ROOT = fileURLToPath(new URL('../../', import.meta.url));

export const CANON_POLICY_MARKERS = Object.freeze([
  '## Capability Sourcing (JOV-6212)',
  'Minimize lifetime ownership of undifferentiated mechanisms',
  'classify each consequential capability',
  'canonical implementation/owner',
  'lifetime integration, maintenance, security updates',
  'One authoritative implementation per capability and scope',
  'The implementation author cannot approve their own exception',
]);

export const ROUTER_POLICY_MARKER =
  '| Capability sourcing, adopt/wrap/build (JOV-6212) | [.claude/rules/code-style.md](.claude/rules/code-style.md) → "Capability Sourcing (JOV-6212)" |';

export const CODE_STYLE_MARKER = '## Capability Sourcing (JOV-6212)';

export const TOOL_DISCOVERY_CAPABILITY_MARKER =
  '## Capability-first mode (JOV-6212)';

function readRepoText(repoRoot, relativePath) {
  return readFileSync(resolve(repoRoot, relativePath), 'utf8');
}

function policyValue(registry) {
  return registry?.invariants?.find(
    item => item?.id === CAPABILITY_SOURCING_INVARIANT_ID
  )?.policy?.value;
}

/**
 * Validate the canonical policy surfaces for JOV-INV-041.
 * @param {object} [options]
 * @param {string} [options.repoRoot]
 * @param {object} [options.registry] parsed canon/invariants.jsonl
 * @param {Record<string, string>} [options.files] injected file contents for tests
 * @returns {string[]} errors; empty means valid
 */
export function validateCapabilitySourcing({
  repoRoot = REPO_ROOT,
  registry = readInvariantRegistry(repoRoot),
  files = {},
} = {}) {
  const errors = [];
  const read = path => files[path] ?? readRepoText(repoRoot, path);

  const policy = policyValue(registry);
  if (!policy) {
    errors.push(
      `missing:${CAPABILITY_SOURCING_INVARIANT_ID} is absent from the invariant registry`
    );
    return errors;
  }
  if (policy.schema !== CAPABILITY_SOURCING_SCHEMA) {
    errors.push(`policy schema must be ${CAPABILITY_SOURCING_SCHEMA}`);
  }
  if (policy.checkClass !== 'policy-surface-scan') {
    errors.push('policy checkClass must be policy-surface-scan');
  }
  if (policy.canonicalPolicy !== CANON_ENGINEERING_PATH) {
    errors.push(
      `canonical policy must stay ${CANON_ENGINEERING_PATH}; no second authority`
    );
  }

  // One authority: canon/ENGINEERING.md carries the canonical policy.
  const canon = read(CANON_ENGINEERING_PATH);
  for (const marker of CANON_POLICY_MARKERS) {
    if (!canon.includes(marker)) {
      errors.push(
        `${CANON_ENGINEERING_PATH}: missing canonical policy marker "${marker}"`
      );
    }
  }

  // The entry-point router routes to the policy exactly once.
  const router = read(ROUTER_PATH);
  const routerMatches = router.split(ROUTER_POLICY_MARKER).length - 1;
  if (routerMatches !== 1) {
    errors.push(
      `${ROUTER_PATH}: the capability sourcing row must appear exactly once (found ${routerMatches})`
    );
  }

  // The scoped rule points back at the canonical section, not a second copy.
  const codeStyle = read(CODE_STYLE_RULE_PATH);
  if (!codeStyle.includes(CODE_STYLE_MARKER)) {
    errors.push(
      `${CODE_STYLE_RULE_PATH}: missing the Capability Sourcing section pointer`
    );
  }
  if (codeStyle.includes('Minimize lifetime ownership of undifferentiated')) {
    errors.push(
      `${CODE_STYLE_RULE_PATH}: duplicated canonical policy text; the scoped rule must route, not copy`
    );
  }

  // tool-discovery gains the capability-first mode that feeds the same
  // receipt through existing research paths — no competing skill tree.
  const toolDiscovery = read(TOOL_DISCOVERY_SKILL_PATH);
  if (!toolDiscovery.includes(TOOL_DISCOVERY_CAPABILITY_MARKER)) {
    errors.push(
      `${TOOL_DISCOVERY_SKILL_PATH}: missing the capability-first mode section`
    );
  }
  if (!toolDiscovery.includes(CANON_ENGINEERING_PATH)) {
    errors.push(
      `${TOOL_DISCOVERY_SKILL_PATH}: capability-first mode must bind ${CANON_ENGINEERING_PATH}`
    );
  }

  return errors;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const errors = validateCapabilitySourcing();
  if (errors.length > 0) {
    for (const error of errors)
      process.stderr.write(`capability-sourcing: ${error}\n`);
    process.exitCode = 1;
  } else {
    process.stdout.write('capability-sourcing-v1 policy surfaces clean\n');
  }
}
