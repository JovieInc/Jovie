import 'server-only';

import { and, eq, inArray } from 'drizzle-orm';
import type { ConnectorStatus } from '@/components/features/connectors/ConnectorCard';
import {
  CONNECTOR_PROVIDER_IDS,
  CONNECTOR_PROVIDERS,
  type ConnectorProviderId,
  getConnectorDefinition,
} from '@/lib/connectors/registry';
import { isMissingConnectorSchemaError } from '@/lib/connectors/schema-errors';
import { db } from '@/lib/db';
import { getUserByClerkId } from '@/lib/db/queries/shared';
import {
  connectorAccounts,
  suggestedActions,
} from '@/lib/db/schema/connectors';

interface ConnectorAccountRow {
  readonly status: string;
  readonly providerAccountId: string | null;
  readonly lastErrorUserMessage: string | null;
}

export interface SettingsConnectorState {
  readonly status: ConnectorStatus;
  readonly email?: string;
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
  readonly accounts: Record<ConnectorProviderId, SettingsConnectorState>;
  readonly gmail: SettingsConnectorState;
  readonly calendar: SettingsConnectorState;
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

function toConnectorState(row: ConnectorAccountRow | null) {
  const state = toConnectorStatus(row);
  return {
    status: state.status,
    email: row?.providerAccountId ?? undefined,
    errorMessage: state.errorMessage,
  };
}

const EMPTY_CONNECTORS_DATA: SettingsConnectorsData = {
  accounts: Object.fromEntries(
    CONNECTOR_PROVIDER_IDS.map(id => [id, { status: 'not_connected' }])
  ) as Record<ConnectorProviderId, SettingsConnectorState>,
  gmail: { status: 'not_connected' },
  calendar: { status: 'not_connected' },
  suggestedActions: [],
};

export async function loadSettingsConnectorsData(
  clerkUserId: string,
  creatorProfileId: string | null = null
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
  const accountRows = await db
    .select({
      provider: connectorAccounts.provider,
      creatorProfileId: connectorAccounts.creatorProfileId,
      status: connectorAccounts.status,
      providerAccountId: connectorAccounts.providerAccountId,
      lastErrorUserMessage: connectorAccounts.lastErrorUserMessage,
    })
    .from(connectorAccounts)
    .where(
      and(
        eq(connectorAccounts.userId, userId),
        inArray(connectorAccounts.provider, [...CONNECTOR_PROVIDER_IDS])
      )
    );
  const accounts = Object.fromEntries(
    CONNECTOR_PROVIDER_IDS.map(id => [
      id,
      toConnectorState(
        accountRows.find(
          row =>
            row.provider === id &&
            (getConnectorDefinition(id).connectionScope === 'user' ||
              (creatorProfileId !== null &&
                row.creatorProfileId === creatorProfileId))
        ) ?? null
      ),
    ])
  ) as Record<ConnectorProviderId, SettingsConnectorState>;

  const actionRows = await db
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
    .limit(10);

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
    accounts,
    gmail: accounts[CONNECTOR_PROVIDERS.gmail],
    calendar: accounts[CONNECTOR_PROVIDERS.google_calendar],
    suggestedActions: pendingActions,
  };
}
