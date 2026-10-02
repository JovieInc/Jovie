import 'server-only';

import { listPendingDesignProposals } from '@/lib/agent-os/design-lab/proposals';
import { listVisualQaReviewRuns } from '@/lib/agent-os/visual-qa/review';
import { fetchTimActionIssues } from '@/lib/hud/linear-actions';
import { readOvieCertificationInventory } from './certifications/inventory.server';
import { projectOvieInbox } from './inbox';
import { listSummerCards } from './summer-cards.server';

export async function readOvieInbox() {
  const [proposals, cards, inventory, visualRuns, linear] =
    await Promise.allSettled([
      listPendingDesignProposals(),
      listSummerCards({ status: 'pending', limit: 100 }),
      readOvieCertificationInventory(),
      listVisualQaReviewRuns(Number.POSITIVE_INFINITY),
      fetchTimActionIssues(),
    ]);
  const result = projectOvieInbox(
    proposals.status === 'fulfilled' ? proposals.value : [],
    cards.status === 'fulfilled' ? cards.value : [],
    inventory.status === 'fulfilled' ? inventory.value : null,
    visualRuns.status === 'fulfilled' ? visualRuns.value : [],
    linear.status === 'fulfilled' ? linear.value : undefined
  );
  const sources = [proposals, cards, inventory, visualRuns, linear];
  const labels = [
    'Design decisions',
    'Company decisions',
    'Certification evidence',
    'Screenshot reviews',
    'Requested work',
  ];
  return {
    ...result,
    issues: [
      ...result.issues,
      ...(cards.status === 'fulfilled' && cards.value.length === 100
        ? ['Company decisions are limited to the newest 100 pending items.']
        : []),
      ...(linear.status === 'fulfilled' && linear.value.issues.length === 50
        ? ['Requested work is limited to the newest 50 pending items.']
        : []),
      ...sources.flatMap((source, index) =>
        source.status === 'rejected'
          ? [
              `${labels[index]} could not be loaded. Retry to check this source.`,
            ]
          : []
      ),
    ],
  };
}
