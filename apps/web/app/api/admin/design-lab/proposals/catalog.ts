import 'server-only';

import { PROPOSED_SECTIONS } from '@/data/marketing';
import {
  getDesignProposal,
  saveDesignProposal,
} from '@/lib/agent-os/design-lab/proposals';
import {
  type DesignProposal,
  DesignProposalSchema,
} from '@/lib/agent-os/design-lab/types';

const CATALOG_DAY_BUCKET = '2026-07-11';

export function catalogDesignProposals(): readonly DesignProposal[] {
  return PROPOSED_SECTIONS.map(record =>
    DesignProposalSchema.parse({
      id: record.id,
      kind: 'section-gap',
      surfaceId: `section-gap:${record.sectionType}`,
      surfaceName: record.proposedSectionName,
      proposalText: record.problem,
      assetRefs: [],
      scoring: null,
      linearIssueId: 'UNASSIGNED',
      linearIssueUrl: null,
      status: record.status,
      designGap: record,
      createdAt: `${record.comments[0]?.date ?? CATALOG_DAY_BUCKET}T00:00:00.000Z`,
      reviewedAt: null,
      reviewer: null,
      reviewNotes: null,
      reviewDecision: null,
      dispatchId: null,
      dayBucket: CATALOG_DAY_BUCKET,
    })
  );
}

export function mergeCatalogDesignProposals(
  persisted: readonly DesignProposal[]
): readonly DesignProposal[] {
  const merged = new Map(
    catalogDesignProposals().map(proposal => [proposal.id, proposal])
  );
  for (const proposal of persisted) merged.set(proposal.id, proposal);
  return [...merged.values()].sort((left, right) =>
    left.id.localeCompare(right.id)
  );
}

export async function getOrMaterializeCatalogProposal(
  dayBucket: string,
  proposalId: string
): Promise<DesignProposal | null> {
  const persisted = await getDesignProposal(dayBucket, proposalId);
  if (persisted) return persisted;
  const catalog = catalogDesignProposals().find(item => item.id === proposalId);
  if (!catalog || catalog.dayBucket !== dayBucket) return null;
  await saveDesignProposal(catalog);
  return catalog;
}
