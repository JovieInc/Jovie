import 'server-only';

import { and, desc, eq } from 'drizzle-orm';
import { isMissingConnectorSchemaError } from '@/lib/connectors/schema-errors';
import { db } from '@/lib/db';
import { getUserByClerkId } from '@/lib/db/queries/shared';
import { suggestedActions } from '@/lib/db/schema/connectors';
import { buildOpportunityInboxData } from './opportunity-inbox-mapper';
import type { OpportunityInboxData } from './opportunity-inbox-types';

const EMPTY_INBOX_DATA = buildOpportunityInboxData([]);

export async function loadOpportunityInboxData(
  clerkUserId: string
): Promise<OpportunityInboxData | null> {
  const dbUser = await getUserByClerkId(db, clerkUserId);

  if (!dbUser) {
    return null;
  }

  try {
    const rows = await db
      .select({
        id: suggestedActions.id,
        kind: suggestedActions.kind,
        payload: suggestedActions.payload,
        rationale: suggestedActions.rationale,
        createdAt: suggestedActions.createdAt,
      })
      .from(suggestedActions)
      .where(
        and(
          eq(suggestedActions.userId, dbUser.id),
          eq(suggestedActions.status, 'pending')
        )
      )
      .orderBy(desc(suggestedActions.createdAt))
      .limit(50);

    return buildOpportunityInboxData(rows);
  } catch (error) {
    if (isMissingConnectorSchemaError(error)) {
      return EMPTY_INBOX_DATA;
    }
    throw error;
  }
}
