import 'server-only';

import { and, eq } from 'drizzle-orm';
import { CONNECTOR_PROVIDERS } from '@/lib/connectors/registry';
import { db } from '@/lib/db';
import { connectorAccounts } from '@/lib/db/schema/connectors';
import { creatorProfiles } from '@/lib/db/schema/profiles';
import type {
  ConnectorEnrichmentAccountContext,
  ConnectorEnrichmentScope,
} from './types';

async function resolveCreatorProfileId(
  userId: string,
  connectorProfileId: string | null
): Promise<string | null> {
  if (connectorProfileId) return connectorProfileId;

  const [profile] = await db
    .select({ id: creatorProfiles.id })
    .from(creatorProfiles)
    .where(eq(creatorProfiles.userId, userId))
    .limit(1);

  return profile?.id ?? null;
}

export async function resolveConnectorEnrichmentContext(
  userId: string
): Promise<ConnectorEnrichmentAccountContext | null> {
  const accounts = await db
    .select({
      id: connectorAccounts.id,
      provider: connectorAccounts.provider,
      creatorProfileId: connectorAccounts.creatorProfileId,
    })
    .from(connectorAccounts)
    .where(
      and(
        eq(connectorAccounts.userId, userId),
        eq(connectorAccounts.status, 'connected')
      )
    );

  const gmail = accounts.find(
    row => row.provider === CONNECTOR_PROVIDERS.gmail
  );
  const calendar = accounts.find(
    row => row.provider === CONNECTOR_PROVIDERS.google_calendar
  );

  const creatorProfileId = await resolveCreatorProfileId(
    userId,
    gmail?.creatorProfileId ?? calendar?.creatorProfileId ?? null
  );

  if (!creatorProfileId) {
    return null;
  }

  const scope: ConnectorEnrichmentScope = {
    userId,
    creatorProfileId,
  };

  return {
    scope,
    gmailAccountId: gmail?.id ?? null,
    calendarAccountId: calendar?.id ?? null,
  };
}
