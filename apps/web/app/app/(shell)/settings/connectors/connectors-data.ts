import 'server-only';

import { and, eq } from 'drizzle-orm';
import type { ConnectorStatus } from '@/components/features/connectors/ConnectorCard';
import {
  CONNECTOR_PROVIDER_IDS,
  CONNECTOR_PROVIDERS,
  type ConnectorProviderId,
} from '@/lib/connectors/registry';
import { isMissingConnectorSchemaError } from '@/lib/connectors/schema-errors';
import { db } from '@/lib/db';
import { getUserByClerkId } from '@/lib/db/queries/shared';
import {
  connectorAccounts,
  suggestedActions,
} from '@/lib/db/schema/connectors';

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

export interface SettingsSuggestedActionPreview {
  readonly id: string;
  readonly title: string;
  readonly startsAt: string;
  readonly endsAt: string | null;
  readonly venueName: string | null;
  readonly city: string | null;
  readonly region: string | null;
  readonly country: string | null;
  readonly confidence: number;
  readonly rationale: string;
  readonly sourceRef: { messageId: string; subject: string };
  readonly status:
    | 'pending'
    | 'approved'
    | 'executed'
    | 'rejected'
    | 'failed'
    | 'expired';
}

export interface SettingsConnectorsData {
  readonly connectors: Readonly<
    Record<ConnectorProviderId, SettingsConnectorState>
  >;
  readonly suggestedActions: SettingsSuggestedActionPreview[];
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
  suggestedActions: [],
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
  const [connectorRows, actionRows] = await Promise.all([
    db
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
      .where(eq(connectorAccounts.userId, userId)),
    db
      .select({
        id: suggestedActions.id,
        payload: suggestedActions.payload,
        rationale: suggestedActions.rationale,
        sourceRefs: suggestedActions.sourceRefs,
        status: suggestedActions.status,
      })
      .from(suggestedActions)
      .where(
        and(
          eq(suggestedActions.userId, userId),
          eq(suggestedActions.status, 'pending')
        )
      )
      .limit(10),
  ]);

  const pendingActions = actionRows.map(row => {
    const payload = row.payload as Record<string, unknown>;
    const sourceRefs =
      (row.sourceRefs as Array<{ messageId: string; subject: string }>) ?? [];

    return {
      id: row.id,
      title: String(payload.title ?? 'Untitled event'),
      startsAt: String(payload.startsAt ?? ''),
      endsAt: (payload.endsAt as string | null) ?? null,
      venueName: (payload.venueName as string | null) ?? null,
      city: (payload.city as string | null) ?? null,
      region: (payload.region as string | null) ?? null,
      country: (payload.country as string | null) ?? null,
      confidence: Number(payload.confidence ?? 0),
      rationale: String(row.rationale ?? ''),
      sourceRef: sourceRefs[0] ?? { messageId: '', subject: '' },
      status: row.status as 'pending',
    };
  });

  return {
    connectors: buildConnectorStates(connectorRows, creatorProfileId),
    suggestedActions: pendingActions,
  };
}
