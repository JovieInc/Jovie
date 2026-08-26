import 'server-only';

import { linearGraphql } from '@/lib/agent-os/design-lab/linear';
import { listPendingDesignProposals } from '@/lib/agent-os/design-lab/proposals';
import { logger } from '@/lib/utils/logger';
import type { MobileInboxResponse } from './action-loop-inbox';

const OV_INBOX_CHAT_PROMPT =
  'Ask Summer which taste cards and stills need a decision.';

type TasteLabel = 'needs:taste' | 'needs:human';

function tasteLabel(names: readonly string[]): TasteLabel | null {
  if (names.includes('needs:taste')) return 'needs:taste';
  if (names.includes('needs:human')) return 'needs:human';
  return null;
}

async function fetchTasteIssues() {
  try {
    const data = await linearGraphql<{
      issues: {
        nodes: ReadonlyArray<{
          id: string;
          identifier: string;
          title: string;
          createdAt: string;
          description: string | null;
          labels: { nodes: ReadonlyArray<{ name: string }> };
        }>;
      };
    }>(
      'query MobileTasteCards{issues(filter:{state:{type:{in:["triage","unstarted","started"]}},labels:{name:{in:["needs:taste","needs:human"]}}},orderBy:priority,first:100){nodes{id identifier title createdAt description labels{nodes{name}}}}}',
      {}
    );
    return data.issues.nodes.flatMap(node => {
      const label = tasteLabel(node.labels.nodes.map(item => item.name));
      return label ? [{ ...node, label }] : [];
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

  const items = [
    ...tasteIssues.map(issue => ({
      id: `taste:${issue.id}`,
      typeLabel: issue.label === 'needs:taste' ? 'Taste' : 'Human',
      createdAt: issue.createdAt,
      title: `${issue.identifier} ${issue.title}`,
      why:
        issue.description
          ?.split('\n')
          .find(line => line.trim().length > 0)
          ?.slice(0, 140) || 'Needs a founder taste decision.',
      primaryActionLabel: 'Review',
      status: 'pending' as const,
      imageUrl: null,
    })),
    ...proposals.map(proposal => {
      const stillUrl =
        proposal.assetRefs.find(
          ref => ref.startsWith('https://') || ref.startsWith('http://')
        ) ?? null;
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
    }),
  ].toSorted((left, right) => right.createdAt.localeCompare(left.createdAt));

  return {
    pendingCount: items.length,
    items,
    emptyActionCards: [],
    chatPrompt: OV_INBOX_CHAT_PROMPT,
  };
}
