import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { fileLinearIssue } from '../qa-swarm/linear.mjs';
import { getRecipe, READ_ONLY_CONTRACT } from './collect.mjs';

const REPO_ROOT = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '../..'
);

/**
 * @typedef {object} DesignAuditFinding
 * @property {string} id
 * @property {string} recipeId
 * @property {string} title
 * @property {string} summary
 * @property {'P0' | 'P1' | 'P2'} priority
 * @property {string} kind
 * @property {readonly string[]} evidencePaths
 * @property {string} [surface]
 */

function buildRunId() {
  return `design-audit-${new Date().toISOString().replaceAll(/[:.]/g, '-')}-${Math.random().toString(36).slice(2, 8)}`;
}

function getPaths(repoRoot = REPO_ROOT) {
  const contextRoot = path.join(repoRoot, '.context', 'design-audit-swarm');
  return { runsRoot: path.join(contextRoot, 'runs') };
}

/** @param {DesignAuditFinding} finding @param {object} context */
function buildIssueBody(finding, context) {
  const recipe = getRecipe(finding.recipeId);
  const evidence =
    finding.evidencePaths.length > 0
      ? finding.evidencePaths.map(item => `- ${item}`).join('\n')
      : '- None';
  return [
    '## Source',
    `- Current issue: ${context.sourceIssue ?? 'JOV-13850'}`,
    `- Filed by: design-audit-swarm (${recipe.id})`,
    `- Run id: \`${context.runId}\``,
    '',
    '## Follow-up',
    `${finding.title}: ${finding.summary}`,
    '',
    '## Why it matters',
    `Read-only design audit (${recipe.title}). Fix via write swarm — this path must not change Pen.`,
    '',
    '## Classification',
    finding.priority === 'P0' ? 'Required' : 'Candidate',
    '',
    '## Acceptance criteria or triage question',
    'Reproduce with the collector, then land an atomic fix outside this audit path.',
    '',
    '## Dependency',
    'None',
    '',
    '## Design audit enrichment',
    `- Recipe: ${recipe.title} (\`${recipe.id}\`)`,
    `- Priority: ${finding.priority}`,
    `- Kind: ${finding.kind}`,
    finding.surface ? `- Surface: ${finding.surface}` : null,
    `- Contract: mutatesPen=${READ_ONLY_CONTRACT.mutatesPen}`,
    '',
    '### Evidence',
    evidence,
  ]
    .filter(Boolean)
    .join('\n');
}

/**
 * @param {object} input
 * @param {readonly DesignAuditFinding[]} input.findings
 * @param {boolean} [input.dryRun]
 * @param {string} [input.runId]
 * @param {string} [input.sourceIssue]
 * @param {string} [input.repoRoot]
 */
export async function proposeDesignAuditFindings(input) {
  const dryRun = input.dryRun ?? false;
  const runId = input.runId ?? buildRunId();
  const { runsRoot } = getPaths(input.repoRoot);
  const runDir = path.join(runsRoot, runId);
  mkdirSync(runDir, { recursive: true });
  writeFileSync(
    path.join(runDir, 'findings.json'),
    `${JSON.stringify({ findings: input.findings, runId, dryRun }, null, 2)}\n`
  );

  /** @type {Array<Record<string, unknown>>} */
  const proposed = [];
  for (const item of input.findings) {
    const recipe = getRecipe(item.recipeId);
    const title =
      item.priority === 'P0'
        ? `P0 design audit: ${item.title}`
        : `Design audit (${recipe.id}): ${item.title}`;
    const linear = dryRun
      ? { success: true, identifier: 'DRY-RUN', url: null, dryRun: true }
      : await fileLinearIssue({
          title,
          description: buildIssueBody(item, {
            runId,
            sourceIssue: input.sourceIssue,
          }),
          labels: [...recipe.labels],
          source: `design-audit-swarm:${recipe.id}`,
        });
    proposed.push({
      findingId: item.id,
      recipeId: item.recipeId,
      priority: item.priority,
      linear,
    });
  }

  const summary = {
    runId,
    dryRun,
    contract: READ_ONLY_CONTRACT,
    findingCount: input.findings.length,
    proposedCount: proposed.length,
    proposed,
  };
  writeFileSync(
    path.join(runDir, 'summary.json'),
    `${JSON.stringify(summary, null, 2)}\n`
  );
  return summary;
}
