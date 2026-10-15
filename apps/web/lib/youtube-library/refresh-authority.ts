import 'server-only';

import { and, eq } from 'drizzle-orm';
import { CONNECTOR_PROVIDERS } from '@/lib/connectors/registry';
import { db } from '@/lib/db';
import { connectorAccounts } from '@/lib/db/schema/connectors';
import { getCreatorEntitlementsWithOwner } from '@/lib/entitlements/creator-plan';
import type { StaleChannelRef } from './repository';

/** Fresh server evidence on every call; no caller-supplied capability flags. */
export async function canRefreshYouTubeChannel(
  channel: StaleChannelRef
): Promise<boolean> {
  const { entitlements, ownerUserId } = await getCreatorEntitlementsWithOwner(
    channel.creatorProfileId
  );
  if (!entitlements.booleans.canAutoCreateLinks || !ownerUserId) return false;

  const [account] = await db
    .select({ id: connectorAccounts.id })
    .from(connectorAccounts)
    .where(
      and(
        eq(connectorAccounts.userId, ownerUserId),
        eq(connectorAccounts.creatorProfileId, channel.creatorProfileId),
        eq(connectorAccounts.provider, CONNECTOR_PROVIDERS.youtube),
        eq(connectorAccounts.providerAccountId, channel.channelId),
        eq(connectorAccounts.status, 'connected')
      )
    )
    .limit(1);
  return Boolean(account);
}
