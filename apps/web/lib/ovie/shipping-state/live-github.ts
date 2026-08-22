import { SHIPPING_SOURCE_SCHEMAS } from './contract';
import { parseTimestamp } from './envelope';
import { type AuthorityRead, disconnectedRead } from './sources';

export const GITHUB_GRAPHQL_URL = 'https://api.github.com/graphql';
export const GITHUB_API_URL = 'https://api.github.com';

export type GithubIo = {
  readonly fetch: (url: string, init?: RequestInit) => Promise<Response>;
  readonly githubToken?: string;
  readonly githubOwner?: string;
  readonly githubRepo?: string;
};

const MERGE_QUEUE_QUERY = `query ShippingStateMergeQueue($owner:String!,$name:String!){repository(owner:$owner,name:$name){mergeQueue(branch:"main"){entries(first:20){pageInfo{hasNextPage}nodes{id position state pullRequest{number headRefOid}}}}}}`;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export async function readMergeQueue(io: GithubIo): Promise<AuthorityRead> {
  if (!io.githubToken || !io.githubOwner || !io.githubRepo) {
    return {
      sourceId: 'github-native-merge-queue',
      status: 'unavailable',
      schema: null,
      payload: null,
      truncated: false,
      sourceTimestamp: null,
      sourceRevision: null,
      sequence: null,
      eventId: null,
      errorCode: 'unavailable',
      errorMessage: 'GitHub merge queue credentials are not configured',
    };
  }
  try {
    const response = await io.fetch(GITHUB_GRAPHQL_URL, {
      method: 'POST',
      headers: {
        accept: 'application/vnd.github+json',
        authorization: `Bearer ${io.githubToken}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        query: MERGE_QUEUE_QUERY,
        variables: { owner: io.githubOwner, name: io.githubRepo },
      }),
      signal: AbortSignal.timeout(2500),
    });
    if (response.status === 401 || response.status === 403) {
      return {
        sourceId: 'github-native-merge-queue',
        status: 'unauthorized',
        schema: null,
        payload: null,
        truncated: false,
        sourceTimestamp: null,
        sourceRevision: null,
        sequence: null,
        eventId: null,
        errorCode: 'unauthorized',
        errorMessage: `GitHub GraphQL returned ${response.status}`,
      };
    }
    const body: unknown = await response.json();
    const data = isRecord(body) && isRecord(body.data) ? body.data : null;
    const repository =
      data && isRecord(data.repository) ? data.repository : null;
    const queue =
      repository && isRecord(repository.mergeQueue)
        ? repository.mergeQueue
        : null;
    const entries = queue && isRecord(queue.entries) ? queue.entries : null;
    const nodes = entries && Array.isArray(entries.nodes) ? entries.nodes : [];
    const truncated =
      isRecord(entries?.pageInfo) && entries.pageInfo.hasNextPage === true;
    return {
      sourceId: 'github-native-merge-queue',
      status: 'ok',
      schema: SHIPPING_SOURCE_SCHEMAS['github-native-merge-queue'],
      payload: { entries: nodes, truncated },
      truncated,
      sourceTimestamp: null,
      sourceRevision:
        nodes.length > 0 && isRecord(nodes[0])
          ? String(nodes[0].id ?? '')
          : 'empty',
      sequence: null,
      eventId: null,
      measuredMeanings: { queued: nodes.length > 0 },
    };
  } catch (error) {
    return disconnectedRead(
      'github-native-merge-queue',
      error instanceof Error ? error.message : 'merge queue unreachable'
    );
  }
}

export async function readWorkflow(
  io: GithubIo,
  sourceId: 'exact-sha-ci' | 'production-controller',
  workflow: string
): Promise<AuthorityRead> {
  if (!io.githubToken || !io.githubOwner || !io.githubRepo) {
    return {
      sourceId,
      status: 'unavailable',
      schema: null,
      payload: null,
      truncated: false,
      sourceTimestamp: null,
      sourceRevision: null,
      sequence: null,
      eventId: null,
      errorCode: 'unavailable',
      errorMessage: 'GitHub Actions credentials are not configured',
    };
  }
  const url = `${GITHUB_API_URL}/repos/${encodeURIComponent(io.githubOwner)}/${encodeURIComponent(io.githubRepo)}/actions/workflows/${encodeURIComponent(workflow)}/runs?per_page=5&exclude_pull_requests=true`;
  try {
    const response = await io.fetch(url, {
      headers: {
        accept: 'application/vnd.github+json',
        authorization: `Bearer ${io.githubToken}`,
      },
      signal: AbortSignal.timeout(2500),
    });
    if (response.status === 401 || response.status === 403) {
      return {
        sourceId,
        status: 'unauthorized',
        schema: null,
        payload: null,
        truncated: false,
        sourceTimestamp: null,
        sourceRevision: null,
        sequence: null,
        eventId: null,
        errorCode: 'unauthorized',
        errorMessage: `GitHub Actions returned ${response.status}`,
      };
    }
    if (!response.ok) {
      return {
        sourceId,
        status: 'unavailable',
        schema: null,
        payload: null,
        truncated: false,
        sourceTimestamp: null,
        sourceRevision: null,
        sequence: null,
        eventId: null,
        errorCode: `http-${response.status}`,
        errorMessage: `GitHub Actions returned ${response.status}`,
      };
    }
    const body: unknown = await response.json();
    const runs =
      isRecord(body) && Array.isArray(body.workflow_runs)
        ? body.workflow_runs
        : [];
    const latest = runs.find(isRecord) ?? null;
    if (latest == null) {
      return {
        sourceId,
        status: 'ok',
        schema: SHIPPING_SOURCE_SCHEMAS[sourceId],
        payload: { workflow_runs: [] },
        truncated: false,
        sourceTimestamp: null,
        sourceRevision: 'empty',
        sequence: null,
        eventId: null,
      };
    }
    const sha = typeof latest.head_sha === 'string' ? latest.head_sha : null;
    const conclusion =
      typeof latest.conclusion === 'string' ? latest.conclusion : null;
    const verified =
      sourceId === 'production-controller' &&
      typeof latest.name === 'string' &&
      latest.name.includes('Production Verified');
    const green = conclusion === 'success';
    return {
      sourceId,
      status: 'ok',
      schema: SHIPPING_SOURCE_SCHEMAS[sourceId],
      payload: latest,
      truncated: runs.length >= 5,
      sourceTimestamp: parseTimestamp(latest.updated_at),
      sourceRevision: sha,
      sequence:
        typeof latest.run_number === 'number' ? latest.run_number : null,
      eventId: latest.id != null ? String(latest.id) : null,
      correlation: {
        sha,
        ciRunId: latest.id != null ? String(latest.id) : null,
        deploymentId: verified && green ? String(latest.id) : null,
      },
      errorCode: green ? undefined : 'ci-not-green',
      errorMessage: green ? undefined : (conclusion ?? 'ci-not-green'),
      measuredMeanings:
        sourceId === 'exact-sha-ci'
          ? { ciGreen: green }
          : { productionVerified: Boolean(verified && green) },
    };
  } catch (error) {
    return disconnectedRead(
      sourceId,
      error instanceof Error ? error.message : 'workflow unreachable'
    );
  }
}
