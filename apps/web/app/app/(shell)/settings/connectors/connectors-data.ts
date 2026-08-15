import 'server-only';

import { and, eq, inArray } from 'drizzle-orm';
import type { ConnectorStatus } from '@/components/features/connectors/ConnectorCard';
import {
  type ConnectorOAuthBundle,
  type ConnectorProviderId,
  getConnectorDefinitions,
} from '@/lib/connectors/registry';
import { isMissingConnectorSchemaError } from '@/lib/connectors/schema-errors';
import { db } from '@/lib/db';
import { getUserByClerkId } from '@/lib/db/queries/shared';
import {
  connectorAccounts,
  suggestedActions,
} from '@/lib/db/schema/connectors';

interface ConnectorAccountRow {
  readonly provider: string;
  readonly status: string;
  readonly providerAccountId: string | null;
  readonly lastErrorUserMessage: string | null;
  readonly scopes: string[] | null;
  readonly capabilities: unknown;
}

function getChannelTitle(capabilities: unknown): string | null {
  if (!capabilities || typeof capabilities !== 'object') return null;
  const value = Reflect.get(capabilities, 'channelTitle');
  return typeof value === 'string' && value.length > 0 ? value : null;
}

export interface SettingsConnectorProviderState {
  readonly provider: ConnectorProviderId;
  readonly label: string;
  readonly oauthBundle: ConnectorOAuthBundle;
  readonly status: ConnectorStatus;
  readonly accountLabel?: string;
  readonly errorMessage?: string;
  readonly scopes?: string[];
}

/** Backward-compatible status shape consumed by the profiles workspace. */
export type SettingsConnectorState = Pick<
  SettingsConnectorProviderState,
  'status' | 'errorMessage'
>;

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
  readonly providers: SettingsConnectorProviderState[];
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

const EMPTY_CONNECTORS_DATA: SettingsConnectorsData = {
  providers: getConnectorDefinitions().map(definition => ({
    provider: definition.id,
    label: definition.label,
    oauthBundle: definition.oauthBundle,
    status: 'not_connected',
  })),
  suggestedActions: [],
};

export async function loadSettingsConnectorsData(
  clerkUserId: string
): Promise<SettingsConnectorsData | null> {
  const dbUser = await getUserByClerkId(db, clerkUserId);

  if (!dbUser) {
    return null;
  }

  try {
    return await loadSettingsConnectorsDataForUser(dbUser.id);
  } catch (error) {
    if (isMissingConnectorSchemaError(error)) {
      return EMPTY_CONNECTORS_DATA;
    }
    throw error;
  }
}

async function loadSettingsConnectorsDataForUser(
  userId: string
): Promise<SettingsConnectorsData> {
  const definitions = getConnectorDefinitions();
  const providerIds = definitions.map(d => d.id);

  const accountRows = await db
    .select({
      provider: connectorAccounts.provider,
      status: connectorAccounts.status,
      providerAccountId: connectorAccounts.providerAccountId,
      lastErrorUserMessage: connectorAccounts.lastErrorUserMessage,
      scopes: connectorAccounts.scopes,
      capabilities: connectorAccounts.capabilities,
    })
    .from(connectorAccounts)
    .where(
      and(
        eq(connectorAccounts.userId, userId),
        inArray(connectorAccounts.provider, providerIds)
      )
    );

  const byProvider = new Map(
    accountRows.map(row => [row.provider as ConnectorProviderId, row])
  );

  const providers: SettingsConnectorProviderState[] = definitions.map(
    definition => {
      const row = byProvider.get(definition.id) ?? null;
      const state = toConnectorStatus(row);
      const channelTitle = getChannelTitle(row?.capabilities);
      return {
        provider: definition.id,
        label: definition.label,
        oauthBundle: definition.oauthBundle,
        status: state.status,
        accountLabel: row?.providerAccountId
          ? channelTitle
            ? `${channelTitle} · ${row.providerAccountId}`
            : row.providerAccountId
          : undefined,
        errorMessage: state.errorMessage,
        scopes:
          row?.scopes && row.scopes.length > 0 ? [...row.scopes] : undefined,
      };
    }
  );

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
    providers,
    suggestedActions: pendingActions,
  };
}
