/**
 * GitHub Issues-first tracker client for Hermes-Air.
 *
 * Files issues via `gh issue create`. Linear remains an optional mirror while
 * TRACKER_GITHUB_ONLY is unset; set TRACKER_GITHUB_ONLY=1 to drop the mirror.
 */

import { execFileSync } from 'node:child_process';
import { appendFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

import { HERMES_PATHS } from './hermes-paths';
import { withRetry } from './retry';

const LINEAR_API = 'https://api.linear.app/graphql';

export interface FileIssueInput {
  readonly title: string;
  readonly description: string;
  readonly labels?: ReadonlyArray<string>;
  readonly source: string;
  readonly teamKey?: string;
}

export interface FileIssueResult {
  readonly success: boolean;
  readonly id?: string;
  readonly identifier?: string;
  readonly url?: string;
  readonly queued?: boolean;
  readonly mirrored?: boolean;
  readonly error?: string;
}

function shouldMirrorLinear(): boolean {
  return process.env.TRACKER_GITHUB_ONLY !== '1';
}

function ghExec(args: ReadonlyArray<string>, input?: string): string {
  const repo = process.env.GH_REPO;
  const withRepo = repo ? [...args, '--repo', repo] : [...args];
  return execFileSync('gh', withRepo, {
    encoding: 'utf8',
    input,
    timeout: 30_000,
  }).trim();
}

function parseIssueNumber(url: string): number | null {
  const match = /\/issues\/(\d+)\s*$/.exec(url);
  return match ? Number(match[1]) : null;
}

function fileGithubIssue(input: FileIssueInput): FileIssueResult {
  const labels = [...(input.labels ?? [])];
  try {
    let url: string;
    try {
      url = ghExec(
        [
          'issue',
          'create',
          '--title',
          input.title,
          '--body-file',
          '-',
          ...labels.flatMap(label => ['--label', label]),
        ],
        input.description
      );
    } catch {
      if (labels.length === 0) throw new Error('gh issue create failed');
      url = ghExec(
        ['issue', 'create', '--title', input.title, '--body-file', '-'],
        input.description
      );
    }
    const number = parseIssueNumber(url);
    return {
      success: true,
      id: number ? String(number) : url,
      identifier: number ? `#${number}` : url,
      url,
    };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

function queueForRetry(input: FileIssueInput, error: string): boolean {
  try {
    mkdirSync(dirname(HERMES_PATHS.linearQueue), { recursive: true });
    appendFileSync(
      HERMES_PATHS.linearQueue,
      `${JSON.stringify({ input, error, ts: new Date().toISOString(), tracker: 'github' })}\n`
    );
    return true;
  } catch {
    return false;
  }
}

async function gql<T>(
  query: string,
  variables: Record<string, unknown>,
  caller: string
): Promise<T> {
  const key = process.env.LINEAR_API_KEY;
  if (!key) throw new Error('LINEAR_API_KEY missing');
  return withRetry(
    async () => {
      const response = await fetch(LINEAR_API, {
        method: 'POST',
        headers: {
          Authorization: key,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ query, variables }),
        signal: AbortSignal.timeout(15_000),
      });
      if (response.status === 429 || response.status >= 500) {
        throw new Error(`Linear ${response.status}`);
      }
      if (!response.ok) {
        const body = await response.text().catch(() => '');
        const err = new Error(`Linear ${response.status}: ${body}`);
        (err as Error & { permanent?: boolean }).permanent = true;
        throw err;
      }
      const json = (await response.json()) as {
        data?: T;
        errors?: ReadonlyArray<unknown>;
      };
      if (json.errors && json.errors.length > 0) {
        throw new Error(
          `Linear GraphQL errors: ${JSON.stringify(json.errors)}`
        );
      }
      if (!json.data) throw new Error('Linear: empty response');
      return json.data;
    },
    { caller: `linear.${caller}`, attempts: 3 }
  );
}

async function mirrorLinearIssue(
  input: FileIssueInput
): Promise<FileIssueResult | null> {
  if (!shouldMirrorLinear()) return null;
  const teamKey = input.teamKey ?? 'JOV';
  try {
    const teamData = await gql<{
      teams: { nodes: ReadonlyArray<{ id: string; key: string }> };
    }>(`query Teams { teams { nodes { id key } } }`, {}, 'findTeamId');
    const team = teamData.teams.nodes.find(t => t.key === teamKey);
    if (!team) throw new Error(`Linear team not found: ${teamKey}`);

    const labelData = await gql<{
      team: { labels: { nodes: ReadonlyArray<{ id: string; name: string }> } };
    }>(
      `query TeamLabels($id: String!) {
        team(id: $id) { labels { nodes { id name } } }
      }`,
      { id: team.id },
      'findLabelIds'
    );
    const wanted = new Set(input.labels ?? []);
    const labelIds = labelData.team.labels.nodes
      .filter(n => wanted.has(n.name))
      .map(n => n.id);

    const data = await gql<{
      issueCreate: {
        success: boolean;
        issue: { id: string; identifier: string; url: string };
      };
    }>(
      `mutation Create($input: IssueCreateInput!) {
        issueCreate(input: $input) {
          success
          issue { id identifier url }
        }
      }`,
      {
        input: {
          teamId: team.id,
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
      mirrored: true,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { success: false, error: msg, mirrored: true };
  }
}

export async function fileIssue(
  input: FileIssueInput
): Promise<FileIssueResult> {
  const github = fileGithubIssue(input);
  if (!github.success) {
    const queued = queueForRetry(input, github.error ?? 'github create failed');
    return { ...github, queued };
  }

  const mirror = await mirrorLinearIssue(input);
  return {
    ...github,
    mirrored: mirror?.success === true,
    error: mirror && !mirror.success ? mirror.error : undefined,
  };
}

/**
 * Canonical follow-up issue body per .claude/rules/linear.md.
 */
export function buildFollowUpBody(args: {
  readonly source: string;
  readonly sourceUrl?: string;
  readonly followUp: string;
  readonly whyItMatters: string;
  readonly classification: 'Required' | 'Candidate';
  readonly acceptanceCriteria: string;
  readonly dependency?: string;
}): string {
  return [
    '## Source',
    `- Filed by: hermes-air`,
    `- Origin: ${args.source}`,
    args.sourceUrl ? `- Reference: ${args.sourceUrl}` : null,
    '',
    '## Follow-up',
    args.followUp,
    '',
    '## Why it matters',
    args.whyItMatters,
    '',
    '## Classification',
    args.classification,
    '',
    `## ${args.classification === 'Required' ? 'Acceptance criteria' : 'Triage question'}`,
    args.acceptanceCriteria,
    '',
    '## Dependency',
    args.dependency ?? 'None',
  ]
    .filter((line): line is string => line !== null)
    .join('\n');
}
