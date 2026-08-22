import { pathToFileURL } from 'node:url';

/**
 * @typedef {object} PolicyGate
 * @property {string} id
 * @property {string} transition
 * @property {string} mode
 * @property {string[]} [requires]
 * @property {string[]} [dependsOn]
 * @property {string} [reason]
 * @property {string} [owner]
 * @property {string} [remedy]
 * @property {string} [evidenceSource]
 */

/**
 * @typedef {object} PolicyGateConfiguration
 * @property {Record<string, string[]>} blockingAllowlist
 * @property {PolicyGate[]} gates
 */

export const POLICY_STAGES = Object.freeze([
  'pre-draft',
  'draft-publication',
  'fast-ci',
  'remediation',
  'promotion',
  'landing',
  'runtime-proof',
]);

export const POLICY_EVIDENCE = Object.freeze({
  'branch-ref': 'pre-draft',
  'committed-diff': 'pre-draft',
  'local-hook-policy': 'pre-draft',
  'local-secret-scan': 'pre-draft',
  'github-pr-metadata': 'draft-publication',
  'exact-head-ci': 'fast-ci',
  'remediation-receipt': 'remediation',
  'coverage-security-policy': 'promotion',
  'production-runtime-proof': 'landing',
});

/** @type {PolicyGateConfiguration} */
export const DEFAULT_POLICY_GATES = Object.freeze({
  blockingAllowlist: {
    'draft-publication': [
      'diff-integrity',
      'publication-secret-scan',
      'hook-policy',
    ],
    promotion: ['exact-head-green'],
    landing: ['promotion-evidence'],
    'runtime-proof': ['landed-build'],
  },
  gates: [
    {
      id: 'branch-recommendation',
      transition: 'draft-publication',
      mode: 'advisory',
      requires: ['branch-ref'],
    },
    ...[
      ['diff-integrity', 'committed-diff', 'CI', 'repair the committed diff'],
      [
        'publication-secret-scan',
        'local-secret-scan',
        'Security',
        'remove or rotate the exposed secret',
      ],
      [
        'hook-policy',
        'local-hook-policy',
        'Developer Experience',
        'repair the publication hook policy',
      ],
    ].map(([id, evidenceSource, owner, remedy]) => ({
      id,
      transition: 'draft-publication',
      mode: 'blocking',
      requires: [evidenceSource],
      reason: 'prevent unsafe draft publication',
      owner,
      remedy,
      evidenceSource,
    })),
    {
      id: 'exact-head-green',
      transition: 'promotion',
      mode: 'blocking',
      requires: ['exact-head-ci', 'remediation-receipt'],
      reason: 'promote only the repaired exact head',
      owner: 'Gem',
      remedy: 'repair and rerun the exact failing lane',
      evidenceSource: 'GitHub checks and rolling CI receipt',
    },
    {
      id: 'promotion-evidence',
      transition: 'landing',
      mode: 'blocking',
      requires: ['coverage-security-policy'],
      reason: 'land only fully qualified changes',
      owner: 'Gem',
      remedy: 'complete required coverage, security, and policy checks',
      evidenceSource: 'required exact-head checks',
    },
    {
      id: 'landed-build',
      transition: 'runtime-proof',
      mode: 'blocking',
      requires: ['production-runtime-proof'],
      reason: 'prove the deployed exact build',
      owner: 'Summer',
      remedy: 'repair deployment or runtime verification',
      evidenceSource: 'production controller receipt',
    },
  ],
});

/** @param {PolicyGateConfiguration} policy */
export function validatePolicyGates(policy = DEFAULT_POLICY_GATES) {
  const errors = [];
  const byId = new Map(policy.gates.map(gate => [gate.id, gate]));
  const visiting = new Set();
  const visited = new Set();
  const visit = id => {
    if (visiting.has(id)) return errors.push(`policy cycle detected at ${id}`);
    if (visited.has(id)) return;
    visiting.add(id);
    for (const dependency of byId.get(id)?.dependsOn ?? []) visit(dependency);
    visiting.delete(id);
    visited.add(id);
  };
  for (const gate of policy.gates) visit(gate.id);

  for (const gate of policy.gates) {
    const transition = POLICY_STAGES.indexOf(gate.transition);
    if (transition < 1) errors.push(`${gate.id}: invalid guarded transition`);
    if (gate.mode === 'blocking') {
      if (
        !(policy.blockingAllowlist[gate.transition] ?? []).includes(gate.id)
      ) {
        errors.push(
          `${gate.id}: blocker is not allowlisted for ${gate.transition}`
        );
      }
      for (const field of ['reason', 'owner', 'remedy', 'evidenceSource']) {
        if (!gate[field])
          errors.push(`${gate.id}: blocking gate requires ${field}`);
      }
    } else if (gate.mode !== 'advisory') {
      errors.push(`${gate.id}: recommendations default to advisory`);
    }
    for (const evidence of gate.requires ?? []) {
      const available = POLICY_STAGES.indexOf(POLICY_EVIDENCE[evidence]);
      if (available < 0 || available >= transition) {
        errors.push(
          `${gate.id}: ${evidence} is not available before ${gate.transition}`
        );
      }
    }
    for (const dependency of gate.dependsOn ?? []) {
      const dependencyStage = POLICY_STAGES.indexOf(
        byId.get(dependency)?.transition
      );
      if (!byId.has(dependency) || dependencyStage >= transition) {
        errors.push(
          `${gate.id}: dependency ${dependency} is not strictly earlier`
        );
      }
    }
  }
  return { ok: errors.length === 0, errors };
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const result = validatePolicyGates();
  if (!result.ok) {
    console.error(result.errors.join('\n'));
    process.exitCode = 1;
  } else {
    console.log('Policy gates are bootstrap-safe, acyclic, and monotonic.');
  }
}
