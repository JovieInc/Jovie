import { setDefaultResultOrder } from 'node:dns';

// Gem hosts have seen unreachable IPv6 routes while IPv4 reaches Linear.
// Prefer IPv4 so the bounded fetch handles application failures, not
// avoidable dual-stack connection stalls.
setDefaultResultOrder('ipv4first');

export const LINEAR_API_KEY_ENV = 'LINEAR_API_KEY';
const API_URL = 'https://api.linear.app/graphql';
export const LINEAR_REQUEST_TIMEOUT_MS = 10_000;

/**
 * Summer's Linear coordination write contract (identities/summer/instructions.md):
 * explicit founder intent and provenance, then read the issue back before
 * claiming the coordination write. A Linear readback receipt is not execution
 * completion and not delivery acceptance.
 */
export type LinearIssueWriteReceipt = {
  readonly readbackVerified: true;
  readonly issue: {
    readonly id: string;
    readonly identifier: string;
    readonly title: string;
    readonly url: string;
  };
  readonly provenance: {
    readonly founderIntent: string;
    readonly sourceRef: string;
  };
};

export class LinearUnavailableError extends Error {
  constructor() {
    super('LINEAR_API_KEY not configured for this runtime');
    this.name = 'LinearUnavailableError';
    this.code = 'linear_unconfigured';
  }
  code: string;
}

export class LinearRequestError extends Error {
  constructor(
    message: string,
    readonly code:
      | 'auth'
      | 'schema'
      | 'rate_limit'
      | 'upstream'
      | 'network'
      | 'timeout'
  ) {
    // Diagnostics are deliberately metadata-only: never include request
    // bodies, GraphQL messages, or the API key.
    super(`Linear request failed (${code})`);
    this.name = 'LinearRequestError';
  }
}

export function linearApiKey(
  environment: Readonly<Record<string, string | undefined>> = process.env
): string | null {
  const key = environment[LINEAR_API_KEY_ENV]?.trim();
  return key ? key : null;
}

export type LinearFetchDeps = {
  readonly fetchImpl?: typeof fetch;
  readonly timeoutMs?: number;
};

async function boundedFetch(
  apiKey: string,
  body: string,
  deps: LinearFetchDeps
): Promise<Response> {
  const fetchImpl = deps.fetchImpl ?? globalThis.fetch;
  const timeoutMs = deps.timeoutMs ?? LINEAR_REQUEST_TIMEOUT_MS;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetchImpl(API_URL, {
      method: 'POST',
      headers: {
        Authorization: apiKey,
        'Content-Type': 'application/json',
      },
      body,
      signal: controller.signal,
    });
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new LinearRequestError('aborted', 'timeout');
    }
    throw new LinearRequestError('fetch failed', 'network');
  } finally {
    clearTimeout(timer);
  }
}

async function linearGraphql<T>(
  apiKey: string,
  query: string,
  variables: Readonly<Record<string, unknown>>,
  deps: LinearFetchDeps
): Promise<T> {
  const response = await boundedFetch(
    apiKey,
    JSON.stringify({ query, variables }),
    deps
  );
  if (response.status === 401 || response.status === 403) {
    throw new LinearRequestError('unauthenticated', 'auth');
  }
  if (response.status === 429) {
    throw new LinearRequestError('rate limited', 'rate_limit');
  }
  if (!response.ok) {
    throw new LinearRequestError('upstream status', 'upstream');
  }
  const contentType = response.headers.get('content-type') ?? '';
  if (!/application\/(?:json|graphql\+json)\b/i.test(contentType)) {
    throw new LinearRequestError('non-JSON upstream response', 'upstream');
  }
  let data: unknown;
  try {
    data = await response.json();
  } catch {
    throw new LinearRequestError(
      'malformed JSON upstream response',
      'upstream'
    );
  }
  const errors = (data as { errors?: unknown }).errors;
  if (Array.isArray(errors) && errors.length > 0) {
    const code = String(
      (errors[0] as { extensions?: { code?: string } })?.extensions?.code ?? ''
    ).toUpperCase();
    if (['UNAUTHENTICATED', 'FORBIDDEN', 'UNAUTHORIZED'].includes(code)) {
      throw new LinearRequestError('denied', 'auth');
    }
    throw new LinearRequestError('rejected', 'schema');
  }
  const payload = (data as { data?: T }).data;
  if (
    payload === undefined ||
    payload === null ||
    typeof payload !== 'object'
  ) {
    throw new LinearRequestError('missing data envelope', 'schema');
  }
  return payload;
}

async function resolveTeamId(
  apiKey: string,
  teamKey: string,
  deps: LinearFetchDeps
): Promise<string> {
  const data = await linearGraphql<{
    teams: { nodes: ReadonlyArray<{ id: string; key: string }> };
  }>(
    apiKey,
    `query($key: String!) {
      teams(filter: { key: { eq: $key } }, first: 1) {
        nodes { id key }
      }
    }`,
    { key: teamKey },
    deps
  );
  const team = data.teams.nodes.find(
    node => node.key === teamKey.toUpperCase()
  );
  if (!team) throw new LinearRequestError('team not found', 'schema');
  return team.id;
}

export type LinearIssueCreateInput = {
  readonly teamKey: string;
  readonly title: string;
  readonly description: string;
};

async function createIssue(
  apiKey: string,
  input: LinearIssueCreateInput,
  deps: LinearFetchDeps
): Promise<{ id: string; identifier: string }> {
  const teamId = await resolveTeamId(apiKey, input.teamKey, deps);
  const data = await linearGraphql<{
    issueCreate: {
      success: boolean;
      issue: { id: string; identifier: string };
    };
  }>(
    apiKey,
    `mutation($input: IssueCreateInput!) {
      issueCreate(input: $input) {
        success
        issue { id identifier }
      }
    }`,
    {
      input: {
        teamId,
        title: input.title,
        description: input.description,
      },
    },
    deps
  );
  if (!data.issueCreate.success || !data.issueCreate.issue) {
    throw new LinearRequestError('issueCreate returned no issue', 'upstream');
  }
  return data.issueCreate.issue;
}

async function readbackIssue(
  apiKey: string,
  teamKey: string,
  identifier: string,
  deps: LinearFetchDeps
): Promise<{ id: string; identifier: string; title: string; url: string }> {
  const data = await linearGraphql<{
    issues: {
      nodes: ReadonlyArray<{
        id: string;
        identifier: string;
        title: string;
        url: string;
      }>;
    };
  }>(
    apiKey,
    `query($teamKey: String!, $number: Float!) {
      issues(
        filter: { team: { key: { eq: $teamKey } }, number: { eq: $number } }
        first: 1
      ) { nodes { id identifier title url } }
    }`,
    {
      teamKey: teamKey.toUpperCase(),
      number: Number(identifier.split('-')[1]),
    },
    deps
  );
  const issue = data.issues.nodes[0];
  if (!issue)
    throw new LinearRequestError('readback found no issue', 'upstream');
  return issue;
}

/**
 * Create one Linear issue and read it back before returning the receipt.
 * Throws LinearUnavailableError when the runtime has no API key and
 * LinearRequestError on any API failure — callers must not claim a
 * coordination write that did not happen.
 */
export async function openLinearIssueWithReadback(
  input: LinearIssueCreateInput & {
    readonly founderIntent: string;
    readonly sourceRef: string;
  },
  deps: LinearFetchDeps & {
    readonly environment?: Readonly<Record<string, string | undefined>>;
  } = {}
): Promise<LinearIssueWriteReceipt> {
  const env = deps.environment ?? process.env;
  const apiKey = linearApiKey(env);
  if (!apiKey) throw new LinearUnavailableError();
  const created = await createIssue(apiKey, input, deps);
  const readback = await readbackIssue(
    apiKey,
    input.teamKey,
    created.identifier,
    deps
  );
  if (
    readback.id !== created.id ||
    readback.identifier !== created.identifier
  ) {
    throw new LinearRequestError('readback mismatch', 'upstream');
  }
  return {
    readbackVerified: true,
    issue: readback,
    provenance: {
      founderIntent: input.founderIntent,
      sourceRef: input.sourceRef,
    },
  };
}
