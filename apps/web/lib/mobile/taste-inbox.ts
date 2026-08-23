import 'server-only';

import { listPendingDesignProposals } from '@/lib/agent-os/design-lab/proposals';
import { env } from '@/lib/env-server';
import { serverFetch } from '@/lib/http/server-fetch';
import { logger } from '@/lib/utils/logger';
import type { MobileInboxResponse } from './action-loop-inbox';

const LINEAR_GRAPHQL_URL = 'https://api.linear.app/graphql';
const TASTE_INBOX_LABELS = ['needs:taste', 'needs:human'] as const;

const OV_INBOX_CHAT_PROMPT =
  'Ask Summer which taste cards and stills need a decision.';

type TasteInboxLabel = (typeof TASTE_INBOX_LABELS)[number];

interface LinearLabelNode {
  readonly id: string;
  readonly name: string;
}

interface LinearIssueNode {
  readonly id: string;
  readonly identifier: string;
  readonly title: string;
  readonly url: string;
  readonly priority: number;
  readonly priorityLabel: string;
  readonly createdAt: string;
  readonly description: string | null;
  readonly labels: { readonly nodes: readonly LinearLabelNode[] };
}

interface LinearGraphQLResponse {
  readonly data?: {
    readonly issues?: { readonly nodes: readonly LinearIssueNode[] };
  };
  readonly errors?: ReadonlyArray<{ readonly message: string }>;
}

function extractBlockingReason(description: string | null): string {
  if (!description) return '';
  const firstLine =
    description.split('\n').find(line => line.trim().length > 0) ?? '';
  return firstLine.slice(0, 140);
}

function detectTasteLabel(
  nodes: readonly LinearLabelNode[]
): TasteInboxLabel | null {
  for (const node of nodes) {
    if (node.name === 'needs:taste' || node.name === 'needs:human') {
      return node.name;
    }
  }
  return null;
}

function isHttpUrl(value: string): boolean {
  return value.startsWith('https://') || value.startsWith('http://');
}

async function fetchTasteIssues(): Promise<
  ReadonlyArray<{
    readonly id: string;
    readonly identifier: string;
    readonly title: string;
    readonly url: string;
    readonly label: TasteInboxLabel;
    readonly createdAt: string;
    readonly blockingReason: string;
  }>
> {
  const apiKey = env.LINEAR_API_KEY;
  if (!apiKey) {
    return [];
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

  try {
    const response = await serverFetch(LINEAR_GRAPHQL_URL, {
      method: 'POST',
      headers: {
        Authorization: apiKey,
        'Content-Type': 'application/json',
        'User-Agent': 'Jovie-Mobile/1.0',
      },
      body: JSON.stringify({ query }),
      timeoutMs: 10_000,
      context: 'mobile taste inbox',
    });

    if (!response.ok) {
      logger.warn('[mobile/taste-inbox] Linear API error', response.status);
      return [];
    }

    const payload = (await response.json()) as LinearGraphQLResponse;
    if (payload.errors && payload.errors.length > 0) {
      logger.warn(
        '[mobile/taste-inbox] Linear GraphQL error',
        payload.errors[0]?.message
      );
      return [];
    }

    return (payload.data?.issues?.nodes ?? []).flatMap(node => {
      const label = detectTasteLabel(node.labels.nodes);
      if (!label) return [];
      return [
        {
          id: node.id,
          identifier: node.identifier,
          title: node.title,
          url: node.url,
          label,
          createdAt: node.createdAt,
          blockingReason: extractBlockingReason(node.description),
        },
      ];
    });
  } catch (error) {
    logger.warn('[mobile/taste-inbox] Linear fetch failed', error);
    return [];
  }
}

/**
 * Admin-only Ovie inbox: Taste issues + Design Lab cards/stills.
 * Never includes the artist action-loop.
 */
export async function buildMobileTasteInbox(): Promise<MobileInboxResponse> {
  const [tasteIssues, proposals] = await Promise.all([
    fetchTasteIssues(),
    listPendingDesignProposals(),
  ]);

  const tasteItems = tasteIssues.map(issue => ({
    id: `taste:${issue.id}`,
    typeLabel: issue.label === 'needs:taste' ? 'Taste' : 'Human',
    createdAt: issue.createdAt,
    title: `${issue.identifier} ${issue.title}`,
    why: issue.blockingReason || 'Needs a founder taste decision.',
    primaryActionLabel: 'Review',
    status: 'pending' as const,
    imageUrl: null,
  }));

  const proposalItems = proposals.map(proposal => {
    const stillUrl = proposal.assetRefs.find(isHttpUrl) ?? null;
    return {
      id: `proposal:${proposal.dayBucket ?? 'none'}:${proposal.id}`,
      typeLabel: stillUrl ? 'Still' : 'Card',
      createdAt: proposal.createdAt,
      title: proposal.surfaceName,
      why: proposal.proposalText,
      primaryActionLabel: 'Review',
      status: 'pending' as const,
      imageUrl: stillUrl,
    };
  });

  const items = [...tasteItems, ...proposalItems].toSorted((left, right) =>
    right.createdAt.localeCompare(left.createdAt)
  );

  return {
    pendingCount: items.length,
    items,
    emptyActionCards: [],
    chatPrompt: OV_INBOX_CHAT_PROMPT,
  };
}
