import 'server-only';

import { eq } from 'drizzle-orm';
import type { ConnectorStatus } from '@/components/features/connectors/ConnectorCard';
import { getConnectorAvailability } from '@/lib/connectors/availability.server';
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
  readonly lastSyncAt?: Date | null;
}

export interface SettingsConnectorState {
  readonly status: ConnectorStatus;
  readonly accountLabel?: string;
  readonly scopes?: readonly string[];
  readonly errorMessage?: string;
  readonly lastSyncAt?: string;
  readonly available?: boolean;
  readonly unavailableReason?: string;
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
  const status: ConnectorStatus =
    row.status === 'connected' ||
    row.status === 'needs_reauth' ||
    row.status === 'error' ||
    row.status === 'disabled'
      ? row.status
      : 'unavailable';
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
    lastSyncAt: row?.lastSyncAt?.toISOString(),
  };
}

function buildConnectorStates(
  rows: readonly ConnectorAccountRow[],
  creatorProfileId: string | null
): Readonly<Record<ConnectorProviderId, SettingsConnectorState>> {
  const availability = getConnectorAvailability();
  return Object.fromEntries(
    CONNECTOR_PROVIDER_IDS.map(provider => {
      const providerRows = rows.filter(
        candidate => candidate.provider === provider
      );
      // Identity-bound accounts take precedence. User-wide fallback is explicit,
      // and YouTube never falls back to an unbound or another identity's row.
      const scopedRow =
        (creatorProfileId
          ? providerRows.find(
              candidate => candidate.creatorProfileId === creatorProfileId
            )
          : null) ??
        (provider === CONNECTOR_PROVIDERS.youtube
          ? null
          : providerRows.find(
              candidate => candidate.creatorProfileId === null
            )) ??
        null;
      return [
        provider,
        {
          ...toConnectorState(scopedRow, provider),
          ...availability[provider],
          unavailableReason: availability[provider].reason,
        },
      ];
    })
  ) as Record<ConnectorProviderId, SettingsConnectorState>;
}

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
      const states = buildConnectorStates([], null);
      return {
        connectors: Object.fromEntries(
          CONNECTOR_PROVIDER_IDS.map(provider => [
            provider,
            {
              ...states[provider],
              status: 'unavailable',
              available: false,
              unavailableReason:
                'Connections could not be read. Refresh to try again.',
            },
          ])
        ) as Record<ConnectorProviderId, SettingsConnectorState>,
      };
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
      lastSyncAt: connectorAccounts.lastSyncAt,
    })
    .from(connectorAccounts)
    .where(eq(connectorAccounts.userId, userId));

  return {
    connectors: buildConnectorStates(connectorRows, creatorProfileId),
  };
}
