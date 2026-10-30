import 'server-only';

import { desc, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { artistRules } from '@/lib/db/schema/library-content-graph';
import type { ArtistRuleView } from './types';

function provenanceSource(
  provenance: (typeof artistRules.$inferSelect)['provenance']
): string | null {
  const source = provenance.source;
  return typeof source === 'string' ? source : null;
}

function toView(rule: typeof artistRules.$inferSelect): ArtistRuleView {
  return {
    id: rule.id,
    category: rule.category,
    ruleKey: rule.ruleKey,
    instruction: rule.instruction,
    strength: rule.strength,
    scope: rule.scope,
    scopeValue: rule.scopeValue,
    allowOverride: rule.allowOverride,
    status: rule.status,
    provenanceSource: provenanceSource(rule.provenance),
    confirmedAt: rule.confirmedAt?.toISOString() ?? null,
    createdAt: rule.createdAt.toISOString(),
  };
}

export async function listArtistRulesForProfile(
  creatorProfileId: string
): Promise<ArtistRuleView[]> {
  const rules = await db
    .select()
    .from(artistRules)
    .where(eq(artistRules.creatorProfileId, creatorProfileId))
    .orderBy(desc(artistRules.createdAt));
  return rules.map(toView);
}
