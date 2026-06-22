import { appendFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';

import { getQaSwarmPaths } from './paths.mjs';
import { getRecipe } from './registry.mjs';

const LINEAR_API = 'https://api.linear.app/graphql';

/**
 * @param {import('./types.mjs').QaSwarmFinding} finding
 * @param {object} context
 * @param {string} context.recipeId
 * @param {string} [context.runId]
 * @param {string} [context.sourceIssue]
 * @param {string} [context.sourcePr]
 * @param {string} [context.branch]
 * @param {string} [context.gbrainSlug]
 */
export function buildEnrichedIssueBody(finding, context) {
  const recipe = getRecipe(context.recipeId);
  const classification = finding.priority === 'P0' ? 'Required' : 'Candidate';
  const acceptanceHeading =
    classification === 'Required' ? 'Acceptance criteria' : 'Triage question';

  const evidenceBlock =
    finding.evidencePaths.length > 0
      ? finding.evidencePaths.map(item => `- ${item}`).join('\n')
      : '- None attached';

  const enrichment = [
    '## QA swarm enrichment',
    `- Recipe: ${recipe.title} (\`${recipe.id}\`)`,
    `- Command: \`${recipe.skillInvocation}\``,
    `- Finding id: \`${finding.id}\``,
    `- Priority: ${finding.priority}`,
    `- Kind: ${finding.kind}`,
    context.runId ? `- Run id: \`${context.runId}\`` : null,
    context.gbrainSlug ? `- gbrain: \`${context.gbrainSlug}\`` : null,
    finding.surface ? `- Surface: ${finding.surface}` : null,
    typeof finding.polishScore === 'number'
      ? `- Polish score: ${finding.polishScore}/10`
      : null,
    finding.referenceComp ? `- Reference comp: ${finding.referenceComp}` : null,
    finding.reproduction ? `- Reproduction: ${finding.reproduction}` : null,
    '',
    '### Evidence',
    evidenceBlock,
  ]
    .filter(line => line !== null)
    .join('\n');

  return [
    '## Source',
    `- Current issue: ${context.sourceIssue ?? 'ad-hoc'}`,
    `- Source PR: ${context.sourcePr ?? 'not opened yet'}`,
    `- Source branch/session: ${context.branch ?? 'qa-swarm'}`,
    `- Filed by: qa-swarm (${recipe.id})`,
    '',
    '## Follow-up',
    `${finding.title}: ${finding.summary}`,
    '',
    '## Why it matters',
    `Objective QA finding from the ${recipe.title} recipe. ${finding.priority === 'P0' ? 'Breaking or revenue-impacting behavior requires immediate remediation.' : 'Improves product quality and reduces manual QA load.'}`,
    '',
    '## Classification',
    classification,
    '',
    `## ${acceptanceHeading}`,
    finding.priority === 'P0'
      ? 'Reproduce the failure, land a focused fix with regression coverage, and re-run the recipe verification commands.'
      : 'Confirm the finding still reproduces, decide ship vs taste queue, and split if the fix spans multiple surfaces.',
    '',
    '## Dependency',
    context.sourceIssue && context.sourceIssue !== 'ad-hoc'
      ? `Blocked by ${context.sourceIssue} only when the finding depends on in-flight work.`
      : 'None',
    '',
    enrichment,
    classification === 'Candidate'
      ? '\n> Pickup agent must first judge whether to implement, close, or split this.'
      : '',
  ]
    .filter(Boolean)
    .join('\n');
}

/**
 * @param {object} input
 * @param {string} input.title
 * @param {string} input.description
 * @param {readonly string[]} [input.labels]
 * @param {string} [input.source]
 * @param {string | Error} error
 */
function queueLinearIssue(input, error) {
  const { contextRoot } = getQaSwarmPaths();
  mkdirSync(contextRoot, { recursive: true });
  appendFileSync(
    path.join(contextRoot, 'linear-queue.jsonl'),
    `${JSON.stringify({
      input,
      error,
      ts: new Date().toISOString(),
    })}\n`
  );
  return true;
}

async function linearGql(query, variables, caller) {
  const key = process.env.LINEAR_API_KEY;
  if (!key) {
    throw new Error('LINEAR_API_KEY missing');
  }

  const response = await fetch(LINEAR_API, {
    method: 'POST',
    headers: {
      Authorization: key,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query, variables }),
    signal: AbortSignal.timeout(15_000),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`Linear ${response.status} (${caller}): ${body}`);
  }

  const json = await response.json();
  if (json.errors?.length) {
    throw new Error(
      `Linear GraphQL errors (${caller}): ${JSON.stringify(json.errors)}`
    );
  }
  if (!json.data) {
    throw new Error(`Linear empty response (${caller})`);
  }
  return json.data;
}

async function findTeamId(teamKey = 'JOV') {
  const data = await linearGql(
    `query Teams { teams { nodes { id key } } }`,
    {},
    'findTeamId'
  );
  const team = data.teams.nodes.find(node => node.key === teamKey);
  if (!team) {
    throw new Error(`Linear team not found: ${teamKey}`);
  }
  return team.id;
}

/**
 * @param {string} teamId
 * @param {readonly string[]} names
 */
async function findLabelIds(teamId, names) {
  if (names.length === 0) {
    return [];
  }
  const data = await linearGql(
    `query TeamLabels($id: String!) {
      team(id: $id) { labels { nodes { id name } } }
    }`,
    { id: teamId },
    'findLabelIds'
  );
  const wanted = new Set(names);
  return data.team.labels.nodes
    .filter(node => wanted.has(node.name))
    .map(node => node.id);
}

/**
 * @param {object} input
 * @param {string} input.title
 * @param {string} input.description
 * @param {readonly string[]} [input.labels]
 * @param {string} [input.source]
 */
export async function fileLinearIssue(input) {
  try {
    const teamId = await findTeamId('JOV');
    const labelIds = await findLabelIds(teamId, input.labels ?? []);
    const data = await linearGql(
      `mutation Create($input: IssueCreateInput!) {
        issueCreate(input: $input) {
          success
          issue { id identifier url }
        }
      }`,
      {
        input: {
          teamId,
          title: input.title,
          description: input.description,
          ...(labelIds.length > 0 ? { labelIds } : {}),
        },
      },
      'issueCreate'
    );

    if (!data.issueCreate.success) {
      throw new Error('issueCreate returned success=false');
    }

    return {
      success: true,
      id: data.issueCreate.issue.id,
      identifier: data.issueCreate.issue.identifier,
      url: data.issueCreate.issue.url,
      queued: false,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const queued = queueLinearIssue(input, message);
    return {
      success: false,
      queued,
      error: message,
    };
  }
}
