import { fileURLToPath } from 'node:url';

import { readInvariantRegistry } from './registry.mjs';

export const DESIGN_AGENT_CONTRACT_INVARIANT_ID = 'JOV-INV-019';
export const DESIGN_AGENT_CONTRACT_POLICY_KEY =
  'design.agent-contract.invariants';
export const DESIGN_AGENT_CONTRACT_SCHEMA = 'jovie.design-agent-contract/v1';

const DEFAULT_REPO_ROOT = fileURLToPath(new URL('../../', import.meta.url));
const DESIGN_INVARIANT_ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function hasText(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

export function parseDesignAgentContract(registry) {
  const invariant = registry?.invariants?.find(
    item => item.id === DESIGN_AGENT_CONTRACT_INVARIANT_ID
  );
  if (!invariant || invariant.lifecycle?.state !== 'adopted') {
    throw new Error(
      `invariant ${DESIGN_AGENT_CONTRACT_INVARIANT_ID} is not adopted`
    );
  }
  if (invariant.policy?.key !== DESIGN_AGENT_CONTRACT_POLICY_KEY) {
    throw new Error(
      `${DESIGN_AGENT_CONTRACT_INVARIANT_ID} must use policy key ${DESIGN_AGENT_CONTRACT_POLICY_KEY}`
    );
  }

  const contract = invariant.policy.value;
  if (contract?.schema !== DESIGN_AGENT_CONTRACT_SCHEMA) {
    throw new Error(
      `${DESIGN_AGENT_CONTRACT_INVARIANT_ID} must use schema ${DESIGN_AGENT_CONTRACT_SCHEMA}`
    );
  }
  if (!Array.isArray(contract.invariants) || contract.invariants.length === 0) {
    throw new Error(
      `${DESIGN_AGENT_CONTRACT_INVARIANT_ID} must define design invariants`
    );
  }

  const ids = new Set();
  for (const entry of contract.invariants) {
    if (!DESIGN_INVARIANT_ID_PATTERN.test(entry?.id ?? '')) {
      throw new Error(
        `invalid design invariant id: ${entry?.id ?? '<missing>'}`
      );
    }
    if (!hasText(entry?.statement)) {
      throw new Error(`design invariant ${entry.id} requires a statement`);
    }
    if (ids.has(entry.id)) {
      throw new Error(`duplicate design invariant projection: ${entry.id}`);
    }
    ids.add(entry.id);
  }

  return contract;
}

export function readDesignAgentContract(repoRoot = DEFAULT_REPO_ROOT) {
  return parseDesignAgentContract(readInvariantRegistry(repoRoot));
}

export function formatDesignInvariantLines(contract) {
  return contract.invariants.map(
    ({ id, statement }) => `- \`${id}\` — ${statement}`
  );
}

export function findDesignInvariantProjectionViolations(manifest, contract) {
  const heading = '## Canonical Invariants';
  const headingIndex = manifest.indexOf(heading);
  if (headingIndex === -1) {
    return ['design manifest is missing the Canonical Invariants section'];
  }

  const sectionStart = headingIndex + heading.length;
  const nextHeading = manifest.indexOf('\n## ', sectionStart);
  const section = manifest.slice(
    sectionStart,
    nextHeading === -1 ? manifest.length : nextHeading
  );
  const actual = section
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(line => line.startsWith('- `'));
  const expected = formatDesignInvariantLines(contract);
  if (
    actual.length === expected.length &&
    actual.every((line, index) => line === expected[index])
  ) {
    return [];
  }

  return [
    `design manifest invariant projection differs from ${DESIGN_AGENT_CONTRACT_INVARIANT_ID}: expected ${expected.length} exact entries, found ${actual.length}`,
  ];
}
