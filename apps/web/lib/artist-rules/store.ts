import 'server-only';

import { and, desc, eq, inArray } from 'drizzle-orm';
import { db } from '@/lib/db';
import { artistRules } from '@/lib/db/schema/library-content-graph';
import type { ArtistRuleStrength, ArtistRuleView } from './types';

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

async function supersedeActiveArtistRules(input: {
  readonly creatorProfileId: string;
  readonly ruleIds: readonly string[];
  readonly updatedAt: Date;
}): Promise<void> {
  if (input.ruleIds.length === 0) return;

  await db
    .update(artistRules)
    .set({ status: 'superseded', updatedAt: input.updatedAt })
    .where(
      and(
        eq(artistRules.creatorProfileId, input.creatorProfileId),
        eq(artistRules.status, 'active'),
        inArray(artistRules.id, [...input.ruleIds])
      )
    );
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

export async function createConfirmedArtistRule(input: {
  readonly creatorProfileId: string;
  readonly actorUserId: string;
  readonly category: string;
  readonly ruleKey: string;
  readonly instruction: string;
  readonly strength: ArtistRuleStrength;
  readonly allowOverride: boolean;
}): Promise<ArtistRuleView> {
  const now = new Date();
  const previousRules = await db
    .select({ id: artistRules.id })
    .from(artistRules)
    .where(
      and(
        eq(artistRules.creatorProfileId, input.creatorProfileId),
        eq(artistRules.category, input.category),
        eq(artistRules.ruleKey, input.ruleKey),
        eq(artistRules.scope, 'artist'),
        eq(artistRules.status, 'active')
      )
    )
    .orderBy(desc(artistRules.createdAt));

  const [previous] = previousRules;
  const [created] = await db
    .insert(artistRules)
    .values({
      creatorProfileId: input.creatorProfileId,
      category: input.category,
      ruleKey: input.ruleKey,
      instruction: input.instruction,
      strength: input.strength,
      scope: 'artist',
      scopeValue: null,
      allowOverride: input.allowOverride,
      status: 'active',
      provenance: {
        source: 'artist',
        capturedAt: now.toISOString(),
      },
      confirmedBy: input.actorUserId,
      confirmedAt: now,
      effectiveAt: now,
      supersedesRuleId: previous?.id ?? null,
      createdAt: now,
      updatedAt: now,
    })
    .returning();

  if (!created) throw new Error('Artist rule insert failed');

  await supersedeActiveArtistRules({
    creatorProfileId: input.creatorProfileId,
    ruleIds: previousRules.map(rule => rule.id),
    updatedAt: now,
  });

  return toView(created);
}

export async function revokeArtistRule(input: {
  readonly creatorProfileId: string;
  readonly ruleId: string;
  readonly actorUserId: string;
}): Promise<boolean> {
  const [updated] = await db
    .update(artistRules)
    .set({
      status: 'revoked',
      confirmedBy: input.actorUserId,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(artistRules.id, input.ruleId),
        eq(artistRules.creatorProfileId, input.creatorProfileId),
        eq(artistRules.status, 'active')
      )
    )
    .returning({ id: artistRules.id });
  return Boolean(updated);
}

export async function activateSuggestedArtistRule(input: {
  readonly creatorProfileId: string;
  readonly ruleId: string;
  readonly actorUserId: string;
}): Promise<ArtistRuleView | null> {
  const [suggested] = await db
    .select()
    .from(artistRules)
    .where(
      and(
        eq(artistRules.id, input.ruleId),
        eq(artistRules.creatorProfileId, input.creatorProfileId),
        eq(artistRules.status, 'suggested')
      )
    )
    .limit(1);
  if (!suggested) return null;

  const previousRules = await db
    .select({ id: artistRules.id })
    .from(artistRules)
    .where(
      and(
        eq(artistRules.creatorProfileId, input.creatorProfileId),
        eq(artistRules.category, suggested.category),
        eq(artistRules.ruleKey, suggested.ruleKey),
        eq(artistRules.scope, suggested.scope),
        eq(artistRules.status, 'active')
      )
    );

  const now = new Date();
  const [activated] = await db
    .update(artistRules)
    .set({
      status: 'active',
      confirmedBy: input.actorUserId,
      confirmedAt: now,
      effectiveAt: now,
      updatedAt: now,
    })
    .where(
      and(
        eq(artistRules.id, input.ruleId),
        eq(artistRules.creatorProfileId, input.creatorProfileId),
        eq(artistRules.status, 'suggested')
      )
    )
    .returning();
  if (!activated) return null;

  await supersedeActiveArtistRules({
    creatorProfileId: input.creatorProfileId,
    ruleIds: previousRules.map(rule => rule.id),
    updatedAt: now,
  });

  return toView(activated);
}

export async function suggestArtistRuleFromMemory(input: {
  readonly creatorProfileId: string;
  readonly memoryId: string;
  readonly category: string;
  readonly ruleKey: string;
  readonly instruction: string;
  readonly strength: ArtistRuleStrength;
  readonly allowOverride: boolean;
}): Promise<ArtistRuleView> {
  const now = new Date();
  const [created] = await db
    .insert(artistRules)
    .values({
      creatorProfileId: input.creatorProfileId,
      category: input.category,
      ruleKey: input.ruleKey,
      instruction: input.instruction,
      strength: input.strength,
      allowOverride: input.allowOverride,
      status: 'suggested',
      provenance: {
        source: 'memory',
        sourceId: input.memoryId,
        capturedAt: now.toISOString(),
      },
      createdAt: now,
      updatedAt: now,
    })
    .returning();
  if (!created) throw new Error('Artist rule suggestion insert failed');
  return toView(created);
}
