import 'server-only';

import { and, desc, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { libraryRelationships } from '@/lib/db/schema/library-content-graph';
import type { LibraryRelationshipView } from './graph-types';

function toView(
  relationship: typeof libraryRelationships.$inferSelect
): LibraryRelationshipView {
  return {
    id: relationship.id,
    kind: relationship.kind,
    subjectType: relationship.subjectType,
    subjectId: relationship.subjectId,
    objectType: relationship.objectType,
    objectId: relationship.objectId,
    status: relationship.status,
    createdAt: relationship.createdAt.toISOString(),
  };
}

export async function listLibraryRelationshipsForProfile(
  creatorProfileId: string
): Promise<LibraryRelationshipView[]> {
  const rows = await db
    .select()
    .from(libraryRelationships)
    .where(
      and(
        eq(libraryRelationships.creatorProfileId, creatorProfileId),
        eq(libraryRelationships.status, 'active')
      )
    )
    .orderBy(desc(libraryRelationships.createdAt));
  return rows.map(toView);
}
