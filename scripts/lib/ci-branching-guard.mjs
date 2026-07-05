#!/usr/bin/env node

import { readFileSync } from 'node:fs';

/** @typedef {'pass' | 'warn' | 'error'} CiBranchingLevel */

const AGENT_BRANCH_PREFIXES = [
  'linear/',
  'claude/',
  'codegen-bot/',
  'codex/',
  'tim/',
  'agent/',
];

const INTEGRATION_BRANCH_PREFIX = 'integration/loop-';

const INTEGRATION_DOMAINS = ['auth', 'ui', 'library', 'chat', 'infra'];

/**
 * @param {string} headRef
 */
export function isAgentBranch(headRef) {
  if (!headRef) return false;
  if (AGENT_BRANCH_PREFIXES.some(prefix => headRef.startsWith(prefix))) {
    return true;
  }
  return headRef.includes('/jov-') || headRef.includes('jov-');
}

/**
 * @param {{ headRef: string, labels?: string[] }} input
 */
export function isExemptFromIntegrationTarget({ headRef, labels = [] }) {
  const normalizedLabels = labels.map(label => label.toLowerCase());
  if (headRef.startsWith('hotfix/')) return true;
  if (headRef.startsWith('train/')) return true;
  if (headRef.startsWith(INTEGRATION_BRANCH_PREFIX)) return true;
  if (headRef.startsWith('dependabot/')) return true;
  if (headRef.startsWith('screenshots/')) return true;
  if (normalizedLabels.includes('needs-human')) return true;
  return false;
}

/**
 * @param {string} headRef
 */
export function suggestIntegrationBranch(headRef) {
  const lower = headRef.toLowerCase();
  if (
    /auth|clerk|signin|signup|entitlement|proxy|onboarding|turnstile/.test(
      lower
    )
  ) {
    return `${INTEGRATION_BRANCH_PREFIX}auth`;
  }
  if (/library|upload|waveform|share-drop|approval/.test(lower)) {
    return `${INTEGRATION_BRANCH_PREFIX}library`;
  }
  if (/chat|composer|audio|voice|messaging/.test(lower)) {
    return `${INTEGRATION_BRANCH_PREFIX}chat`;
  }
  if (
    /design-system|surface|dashboard|ui|shell|onboarding|profile/.test(lower)
  ) {
    return `${INTEGRATION_BRANCH_PREFIX}ui`;
  }
  if (/ci|workflow|harness|hook|script|infra|agent/.test(lower)) {
    return `${INTEGRATION_BRANCH_PREFIX}infra`;
  }
  return `${INTEGRATION_BRANCH_PREFIX}ui`;
}

/**
 * @param {{
 *   baseRef: string,
 *   headRef: string,
 *   labels?: string[],
 *   mode?: 'warn' | 'error',
 * }} input
 */
export function evaluateCiBranching({
  baseRef,
  headRef,
  labels = [],
  mode = 'warn',
}) {
  if (baseRef !== 'main') {
    return {
      ok: true,
      level: 'pass',
      message: 'Non-main PR base — integration policy not applied.',
    };
  }

  if (!isAgentBranch(headRef)) {
    return {
      ok: true,
      level: 'pass',
      message: 'Non-agent branch — integration policy not applied.',
    };
  }

  if (isExemptFromIntegrationTarget({ headRef, labels })) {
    return {
      ok: true,
      level: 'pass',
      message: 'Exempt agent branch may target main.',
    };
  }

  const recommended = suggestIntegrationBranch(headRef);
  const message = [
    `Agent branch "${headRef}" targets main.`,
    `Retarget to ${recommended} via scripts/loop-integration-ship.sh,`,
    'or add needs-human / use hotfix/* for production incidents.',
    'See .claude/rules/ci-branching.md.',
  ].join(' ');

  if (mode === 'error') {
    return { ok: false, level: 'error', message, recommended };
  }

  return { ok: true, level: 'warn', message, recommended };
}

/**
 * @param {string} policyPath
 */
export function validateCiBranchingPolicyDoc(policyPath) {
  const errors = [];
  if (!policyPath) {
    errors.push('Policy path is required.');
    return { ok: false, errors };
  }

  let contents = '';
  try {
    contents = readFileSync(policyPath, 'utf8');
  } catch {
    errors.push(`Missing CI branching policy doc: ${policyPath}`);
    return { ok: false, errors };
  }

  for (const domain of INTEGRATION_DOMAINS) {
    if (!contents.includes(`integration/loop-${domain}`)) {
      errors.push(`Policy doc missing integration domain: loop-${domain}`);
    }
  }

  if (!contents.includes('loop-integration-ship.sh')) {
    errors.push('Policy doc must reference scripts/loop-integration-ship.sh');
  }

  return { ok: errors.length === 0, errors };
}
