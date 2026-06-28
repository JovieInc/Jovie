/**
 * Review queue routing for flagged prod traces (needs:eval-review).
 */

import type { FailureMode } from '@/lib/eval/failure-modes';
import { failureModeLabel } from '@/lib/eval/failure-modes';

export const EVAL_REVIEW_LABEL = 'needs:eval-review' as const;

export interface EvalReviewQueueInput {
  readonly traceId: string;
  readonly caseName: string;
  readonly userPrompt: string;
  readonly assistantResponse: string;
  readonly failureModes: readonly FailureMode[];
  readonly flaggedAt?: string;
}

export interface EvalReviewQueueResult {
  readonly enqueued: boolean;
  readonly label: typeof EVAL_REVIEW_LABEL;
  readonly issueTitle: string;
  readonly issueBody: string;
  readonly reason?: string;
}

export function buildEvalReviewIssueTitle(input: EvalReviewQueueInput): string {
  const modes = input.failureModes.map(failureModeLabel).join(', ');
  return `Eval review: ${input.traceId} (${modes || 'flagged'})`;
}

export function buildEvalReviewIssueBody(input: EvalReviewQueueInput): string {
  const flaggedAt = input.flaggedAt ?? new Date().toISOString();
  const modes =
    input.failureModes.length > 0
      ? input.failureModes
          .map(mode => `- ${failureModeLabel(mode)} (${mode})`)
          .join('\n')
      : '- (unclassified)';

  return [
    '## Online scorer flag',
    '',
    `Trace \`${input.traceId}\` was flagged by online scorers at ${flaggedAt}.`,
    '',
    '### Failure modes',
    modes,
    '',
    '### User prompt',
    '```',
    input.userPrompt.trim().slice(0, 2_000),
    '```',
    '',
    '### Assistant response',
    '```',
    input.assistantResponse.trim().slice(0, 2_000),
    '```',
    '',
    `Label: \`${EVAL_REVIEW_LABEL}\``,
  ].join('\n');
}

export function enqueueEvalReview(
  input: EvalReviewQueueInput
): EvalReviewQueueResult {
  if (input.failureModes.length === 0) {
    return {
      enqueued: false,
      label: EVAL_REVIEW_LABEL,
      issueTitle: buildEvalReviewIssueTitle(input),
      issueBody: buildEvalReviewIssueBody(input),
      reason: 'No failure modes to route',
    };
  }

  return {
    enqueued: true,
    label: EVAL_REVIEW_LABEL,
    issueTitle: buildEvalReviewIssueTitle(input),
    issueBody: buildEvalReviewIssueBody(input),
  };
}

interface LinearLabelNode {
  readonly id: string;
  readonly name: string;
}

interface LinearIssueNode {
  readonly id: string;
  readonly identifier: string;
}

/**
 * Creates a Linear issue with `needs:eval-review` when API credentials exist.
 * Fail-open: returns null when Linear is unavailable.
 */
export async function createLinearEvalReviewIssue(params: {
  readonly apiKey: string | undefined;
  readonly teamId: string | undefined;
  readonly input: EvalReviewQueueInput;
}): Promise<LinearIssueNode | null> {
  const queued = enqueueEvalReview(params.input);
  if (!queued.enqueued || !params.apiKey || !params.teamId) {
    return null;
  }

  const labelId = await resolveLinearLabelId(params.apiKey, EVAL_REVIEW_LABEL);
  if (!labelId) {
    return null;
  }

  const mutation = `
    mutation CreateEvalReviewIssue($input: IssueCreateInput!) {
      issueCreate(input: $input) {
        success
        issue { id identifier }
      }
    }
  `;

  const response = await fetch('https://api.linear.app/graphql', {
    method: 'POST',
    headers: {
      Authorization: params.apiKey,
      'Content-Type': 'application/json',
      'User-Agent': 'Jovie-Eval-Scorers/1.0',
    },
    body: JSON.stringify({
      query: mutation,
      variables: {
        input: {
          teamId: params.teamId,
          title: queued.issueTitle,
          description: queued.issueBody,
          labelIds: [labelId],
        },
      },
    }),
    signal: AbortSignal.timeout(10_000),
  });

  if (!response.ok) return null;

  const payload = (await response.json()) as {
    data?: {
      issueCreate?: {
        success?: boolean;
        issue?: LinearIssueNode;
      };
    };
  };

  if (!payload.data?.issueCreate?.success) return null;
  return payload.data.issueCreate.issue ?? null;
}

async function resolveLinearLabelId(
  apiKey: string,
  labelName: string
): Promise<string | null> {
  const query = `
    query ResolveLabel($name: String!) {
      issueLabels(filter: { name: { eq: $name } }, first: 1) {
        nodes { id name }
      }
    }
  `;

  const response = await fetch('https://api.linear.app/graphql', {
    method: 'POST',
    headers: {
      Authorization: apiKey,
      'Content-Type': 'application/json',
      'User-Agent': 'Jovie-Eval-Scorers/1.0',
    },
    body: JSON.stringify({ query, variables: { name: labelName } }),
    signal: AbortSignal.timeout(10_000),
  });

  if (!response.ok) return null;

  const payload = (await response.json()) as {
    data?: { issueLabels?: { nodes: LinearLabelNode[] } };
  };

  return payload.data?.issueLabels?.nodes[0]?.id ?? null;
}
