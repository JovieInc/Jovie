import { boundedFetch } from './bounded-fetch';

const LINEAR_GRAPHQL_URL = 'https://api.linear.app/graphql';

export const TASTE_INBOX_LABELS = ['needs:taste', 'needs:human'] as const;
export type TasteInboxLabel = (typeof TASTE_INBOX_LABELS)[number];

export interface TasteIssue {
  readonly id: string;
  readonly identifier: string;
  readonly title: string;
  readonly url: string;
  readonly label: TasteInboxLabel;
  readonly priority: number;
  readonly priorityLabel: string;
  readonly createdAt: string;
  readonly description: string | null;
  readonly blockingReason: string;
}

export interface TasteInboxResult {
  readonly issues: TasteIssue[];
  readonly fetchedAt: string;
  readonly available: boolean;
  readonly error?: string;
}

interface LinearLabelNode {
  id: string;
  name: string;
}

interface LinearIssueNode {
  id: string;
  identifier: string;
  title: string;
  url: string;
  priority: number;
  priorityLabel: string;
  createdAt: string;
  description: string | null;
  labels: { nodes: LinearLabelNode[] };
}

interface LinearGraphQLResponse {
  data?: {
    issues?: { nodes: LinearIssueNode[] };
  };
  errors?: Array<{ message: string }>;
}

function extractBlockingReason(description: string | null): string {
  if (!description) return '';
  const firstLine =
    description.split('\n').find(l => l.trim().length > 0) ?? '';
  return firstLine.slice(0, 140);
}

function detectLabel(nodes: LinearLabelNode[]): TasteInboxLabel | null {
  for (const n of nodes) {
    if (n.name === 'needs:taste' || n.name === 'needs:human') {
      return n.name as TasteInboxLabel;
    }
  }
  return null;
}

/**
 * Fetch all open issues labeled `needs:taste` or `needs:human` from Linear.
 * Returns an empty list if LINEAR_API_KEY is not set.
 */
export async function fetchTasteInbox(
  apiKey: string | undefined
): Promise<TasteInboxResult> {
  const fetchedAt = new Date().toISOString();

  if (!apiKey) {
    return {
      issues: [],
      fetchedAt,
      available: false,
      error: 'LINEAR_API_KEY not configured',
    };
  }

  const query = `
    query TasteInbox {
      issues(
        filter: {
          state: { type: { in: ["triage", "unstarted", "started"] } }
          labels: { name: { in: ["needs:taste", "needs:human"] } }
        }
        orderBy: priority
        first: 100
      ) {
        nodes {
          id
          identifier
          title
          url
          priority
          priorityLabel
          createdAt
          description
          labels { nodes { id name } }
        }
      }
    }
  `;

  let res: Response;
  try {
    res = await boundedFetch(LINEAR_GRAPHQL_URL, {
      method: 'POST',
      headers: {
        Authorization: apiKey,
        'Content-Type': 'application/json',
        'User-Agent': 'Jovie-Console/1.0',
      },
      body: JSON.stringify({ query }),
      timeoutMs: 10_000,
      context: 'linear.taste-inbox',
    });
  } catch (err) {
    return {
      issues: [],
      fetchedAt,
      available: false,
      error: err instanceof Error ? err.message : 'Network error',
    };
  }

  if (!res.ok) {
    return {
      issues: [],
      fetchedAt,
      available: false,
      error: `Linear API responded ${res.status}`,
    };
  }

  const payload = (await res.json()) as LinearGraphQLResponse;

  if (payload.errors && payload.errors.length > 0) {
    return {
      issues: [],
      fetchedAt,
      available: false,
      error: payload.errors[0]?.message ?? 'GraphQL error',
    };
  }

  const nodes = payload.data?.issues?.nodes ?? [];

  const issues: TasteIssue[] = nodes
    .map((n): TasteIssue | null => {
      const label = detectLabel(n.labels.nodes);
      if (!label) return null;
      return {
        id: n.id,
        identifier: n.identifier,
        title: n.title,
        url: n.url,
        label,
        priority: n.priority,
        priorityLabel: n.priorityLabel,
        createdAt: n.createdAt,
        description: n.description,
        blockingReason: extractBlockingReason(n.description),
      };
    })
    .filter((i): i is TasteIssue => i !== null);

  return { issues, fetchedAt, available: true };
}
