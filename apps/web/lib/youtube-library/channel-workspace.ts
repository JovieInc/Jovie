import 'server-only';

import { and, desc, eq } from 'drizzle-orm';
import { CONNECTOR_PROVIDERS } from '@/lib/connectors/registry';
import { db } from '@/lib/db';
import { connectorAccounts } from '@/lib/db/schema/connectors';
import {
  type ChannelVideoLedgerItem,
  listChannelVideoLedgerForProfile,
} from './queries';

export type AuthorizedYouTubeChannelWorkspace =
  | {
      readonly state: 'auth-required';
      readonly videos: readonly [];
      readonly errorMessage: string | null;
    }
  | {
      readonly state: 'ambiguous-channel';
      readonly videos: readonly [];
      readonly errorMessage: string;
    }
  | {
      readonly state: 'connected';
      readonly authorizedChannelId: string;
      readonly scopes: readonly string[];
      readonly lastSyncAt: string | null;
      readonly videos: readonly ChannelVideoLedgerItem[];
      readonly errorMessage: string | null;
    };

/**
 * Fail-closed workspace loader: only the selected profile's single connected,
 * founder-authorized channel may hydrate the ledger.
 */
export async function loadAuthorizedYouTubeChannelWorkspace(input: {
  readonly userId: string;
  readonly creatorProfileId: string;
}): Promise<AuthorizedYouTubeChannelWorkspace> {
  const accounts = await db
    .select({
      status: connectorAccounts.status,
      channelId: connectorAccounts.providerAccountId,
      scopes: connectorAccounts.scopes,
      lastSyncAt: connectorAccounts.lastSyncAt,
      errorMessage: connectorAccounts.lastErrorUserMessage,
    })
    .from(connectorAccounts)
    .where(
      and(
        eq(connectorAccounts.userId, input.userId),
        eq(connectorAccounts.creatorProfileId, input.creatorProfileId),
        eq(connectorAccounts.provider, CONNECTOR_PROVIDERS.youtube)
      )
    )
    .orderBy(desc(connectorAccounts.updatedAt))
    .limit(2);

  const connected = accounts.filter(account => account.status === 'connected');
  if (connected.length === 0) {
    return {
      state: 'auth-required',
      videos: [],
      errorMessage: accounts[0]?.errorMessage ?? null,
    };
  }
  if (connected.length !== 1) {
    return {
      state: 'ambiguous-channel',
      videos: [],
      errorMessage:
        'More than one connected YouTube channel is bound to this profile. Resolve ownership before review or publication.',
    };
  }

  const account = connected[0];
  const videos = await listChannelVideoLedgerForProfile({
    creatorProfileId: input.creatorProfileId,
    channelId: account.channelId,
  });
  return {
    state: 'connected',
    authorizedChannelId: account.channelId,
    scopes: account.scopes,
    lastSyncAt: account.lastSyncAt?.toISOString() ?? null,
    videos,
    errorMessage: account.errorMessage,
  };
}
