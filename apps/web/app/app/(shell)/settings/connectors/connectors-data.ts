import 'server-only';

import { eq } from 'drizzle-orm';
import type { ConnectorStatus } from '@/components/features/connectors/ConnectorCard';
import {
  CONNECTOR_PROVIDER_IDS,
  CONNECTOR_PROVIDERS,
  type ConnectorProviderId,
} from '@/lib/connectors/registry';
import { isMissingConnectorSchemaError } from '@/lib/connectors/schema-errors';
import { db } from '@/lib/db';
import { getUserByClerkId } from '@/lib/db/queries/shared';
import { connectorAccounts } from '@/lib/db/schema/connectors';

interface ConnectorAccountRow {
  readonly provider: ConnectorProviderId;
  readonly status: string;
  readonly providerAccountId: string | null;
  readonly creatorProfileId: string | null;
  readonly scopes: readonly string[];
  readonly capabilities: unknown;
  readonly lastErrorUserMessage: string | null;
}

export interface SettingsConnectorState {
  readonly status: ConnectorStatus;
  readonly accountLabel?: string;
  readonly scopes?: readonly string[];
  readonly errorMessage?: string;
}

export interface SettingsConnectorsData {
  readonly connectors: Readonly<
    Record<ConnectorProviderId, SettingsConnectorState>
  >;
}

function toConnectorStatus(
  row: Pick<ConnectorAccountRow, 'status' | 'lastErrorUserMessage'> | null
): { status: ConnectorStatus; errorMessage?: string } {
  if (!row) return { status: 'not_connected' };
  const status = row.status as ConnectorStatus;
  return {
    status,
    errorMessage: row.lastErrorUserMessage ?? undefined,
  };
}

function getAccountLabel(
  row: ConnectorAccountRow,
  provider: ConnectorProviderId
): string | undefined {
  if (
    provider === CONNECTOR_PROVIDERS.youtube &&
    row.capabilities &&
    typeof row.capabilities === 'object' &&
    'channelTitle' in row.capabilities &&
    typeof row.capabilities.channelTitle === 'string'
  ) {
    return row.capabilities.channelTitle;
  }

  return row.providerAccountId ?? undefined;
}

function toConnectorState(
  row: ConnectorAccountRow | null,
  provider: ConnectorProviderId
): SettingsConnectorState {
  const state = toConnectorStatus(row);
  return {
    status: state.status,
    accountLabel: row ? getAccountLabel(row, provider) : undefined,
    scopes: row?.scopes,
    errorMessage: state.errorMessage,
  };
}

function buildConnectorStates(
  rows: readonly ConnectorAccountRow[],
  creatorProfileId: string | null
): Readonly<Record<ConnectorProviderId, SettingsConnectorState>> {
  return Object.fromEntries(
    CONNECTOR_PROVIDER_IDS.map(provider => {
      const row =
        rows.find(candidate => {
          if (candidate.provider !== provider) return false;
          return provider !== CONNECTOR_PROVIDERS.youtube
            ? true
            : candidate.creatorProfileId === creatorProfileId;
        }) ?? null;
      return [provider, toConnectorState(row, provider)];
    })
  ) as Record<ConnectorProviderId, SettingsConnectorState>;
}

const EMPTY_CONNECTORS_DATA: SettingsConnectorsData = {
  connectors: buildConnectorStates([], null),
};

export async function loadSettingsConnectorsData(
  clerkUserId: string,
  creatorProfileId: string | null
): Promise<SettingsConnectorsData | null> {
  const dbUser = await getUserByClerkId(db, clerkUserId);

  if (!dbUser) {
    return null;
  }

  try {
    return await loadSettingsConnectorsDataForUser(dbUser.id, creatorProfileId);
  } catch (error) {
    if (isMissingConnectorSchemaError(error)) {
      return EMPTY_CONNECTORS_DATA;
    }
    throw error;
  }
}

async function loadSettingsConnectorsDataForUser(
  userId: string,
  creatorProfileId: string | null
): Promise<SettingsConnectorsData> {
  const connectorRows = await db
    .select({
      provider: connectorAccounts.provider,
      status: connectorAccounts.status,
      providerAccountId: connectorAccounts.providerAccountId,
      creatorProfileId: connectorAccounts.creatorProfileId,
      scopes: connectorAccounts.scopes,
      capabilities: connectorAccounts.capabilities,
      lastErrorUserMessage: connectorAccounts.lastErrorUserMessage,
    })
    .from(connectorAccounts)
    .where(eq(connectorAccounts.userId, userId));

  return {
    connectors: buildConnectorStates(connectorRows, creatorProfileId),
  };
}
