import type {
  DesignTasteConsensusFinding,
  DesignTasteFiledIssue,
  DesignTasteIssueDraft,
  DesignTasteJuryQueueTag,
} from '@/lib/agent-os/design-taste-jury/types';
import { logger } from '@/lib/utils/logger';

const LINEAR_GRAPHQL_URL = 'https://api.linear.app/graphql';
const TIM_ACTION_REQUIRED_LABEL_ID = '518b8d3f-30b4-46ad-85e7-b5cd2546a85f';
const DEFAULT_LINEAR_TEAM_KEY = 'JOV';

async function linearGraphql<T>(
  query: string,
  variables: Record<string, unknown>
): Promise<T> {
  const apiKey = process.env.LINEAR_API_KEY;
  if (!apiKey) {
    throw new Error('LINEAR_API_KEY is not configured');
  }

  const response = await fetch(LINEAR_GRAPHQL_URL, {
    method: 'POST',
    headers: {
      Authorization: apiKey,
      'Content-Type': 'application/json',
      'User-Agent': 'Jovie-DesignTasteJury/1.0',
    },
    body: JSON.stringify({ query, variables }),
    signal: AbortSignal.timeout(10_000),
  });

  if (!response.ok) {
    throw new Error(`Linear API error (${response.status})`);
  }

  const payload = (await response.json()) as {
    data?: T;
    errors?: Array<{ message: string }>;
  };

  if (payload.errors && payload.errors.length > 0) {
    throw new Error(payload.errors[0]?.message ?? 'Linear GraphQL error');
  }

  if (!payload.data) {
    throw new Error('Linear GraphQL returned empty data');
  }

  return payload.data;
}

function buildIssueDescription(
  finding: DesignTasteConsensusFinding,
  runId: string
): string {
  const benchmarkLines = finding.benchmarkRefs
    .map(reference => `- ${reference}`)
    .join('\n');

  const compLine = finding.compArtifactPath
    ? `\n## Reference comp\n${finding.compArtifactPath}`
    : '';

  return [
    '## Source',
    `- Design taste jury run: ${runId}`,
    `- Surface: ${finding.surfaceId}`,
    `- Consensus rank: ${finding.rank}`,
    '',
    '## Finding',
    finding.summary,
    '',
    '## Benchmarks',
    benchmarkLines,
    compLine,
    '',
    '## Classification',
    finding.queueTag === 'ship' ? 'Required (objective)' : 'Candidate (taste)',
    '',
    '## Acceptance criteria',
    finding.queueTag === 'ship'
      ? 'Fix the objective visual defect and attach before/after comps in Visual QA.'
      : 'Tim reviews the taste direction against benchmark comps and accepts or rejects.',
  ]
    .filter(part => part.length > 0)
    .join('\n');
}

export function buildDesignTasteIssueDrafts(params: {
  readonly findings: readonly DesignTasteConsensusFinding[];
  readonly runId: string;
  readonly queueTag?: DesignTasteJuryQueueTag;
}): DesignTasteIssueDraft[] {
  const queueFilter = params.queueTag ?? null;

  return params.findings
    .filter(finding => (queueFilter ? finding.queueTag === queueFilter : true))
    .map(finding => ({
      queueTag: finding.queueTag,
      title:
        finding.queueTag === 'ship'
          ? `Visual QA: ${finding.title}`
          : `Taste review: ${finding.title}`,
      description: buildIssueDescription(finding, params.runId),
      benchmarkRefs: finding.benchmarkRefs,
      compArtifactPath: finding.compArtifactPath,
      surfaceId: finding.surfaceId,
      findingId: finding.id,
    }));
}

async function resolveJovieTeamId(): Promise<string | null> {
  const query = `
    query Teams {
      teams {
        nodes {
          id
          key
        }
      }
    }
  `;

  try {
    const data = await linearGraphql<{
      teams: { nodes: Array<{ id: string; key: string }> };
    }>(query, {});

    const jovieTeam = data.teams.nodes.find(
      team => team.key === DEFAULT_LINEAR_TEAM_KEY
    );

    return jovieTeam?.id ?? null;
  } catch (error) {
    logger.warn('[design-taste-jury/linear] Failed to resolve team id', {
      error,
    });
    return null;
  }
}

async function fileLinearIssue(
  draft: DesignTasteIssueDraft
): Promise<{ identifier: string | null; url: string | null }> {
  const teamId = await resolveJovieTeamId();
  if (!teamId) {
    throw new Error('Unable to resolve Linear team for issue filing.');
  }

  const mutation = `
    mutation CreateIssue($input: IssueCreateInput!) {
      issueCreate(input: $input) {
        success
        issue {
          identifier
          url
        }
      }
    }
  `;

  const labelIds =
    draft.queueTag === 'taste' ? [TIM_ACTION_REQUIRED_LABEL_ID] : [];

  const data = await linearGraphql<{
    issueCreate: {
      success: boolean;
      issue: { identifier: string; url: string } | null;
    };
  }>(mutation, {
    input: {
      teamId,
      title: draft.title,
      description: draft.description,
      labelIds,
    },
  });

  if (!data.issueCreate.success || !data.issueCreate.issue) {
    throw new Error('Linear issueCreate returned unsuccessful result.');
  }

  return {
    identifier: data.issueCreate.issue.identifier,
    url: data.issueCreate.issue.url,
  };
}

export async function fileDesignTasteIssues(params: {
  readonly drafts: readonly DesignTasteIssueDraft[];
  readonly dryRun: boolean;
}): Promise<DesignTasteFiledIssue[]> {
  if (params.dryRun || !process.env.LINEAR_API_KEY) {
    return params.drafts.map(draft => ({
      draft,
      filed: false,
      identifier: null,
      url: null,
      error: params.dryRun
        ? 'Dry run — issue not filed.'
        : 'LINEAR_API_KEY not configured.',
    }));
  }

  const results: DesignTasteFiledIssue[] = [];

  for (const draft of params.drafts) {
    try {
      const filed = await fileLinearIssue(draft);
      results.push({
        draft,
        filed: true,
        identifier: filed.identifier,
        url: filed.url,
        error: null,
      });
    } catch (error) {
      logger.error('[design-taste-jury/linear] Failed to file issue', {
        title: draft.title,
        error,
      });
      results.push({
        draft,
        filed: false,
        identifier: null,
        url: null,
        error: error instanceof Error ? error.message : 'Unknown filing error',
      });
    }
  }

  return results;
}
