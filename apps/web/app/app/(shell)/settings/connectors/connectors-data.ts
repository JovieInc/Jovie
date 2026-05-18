import 'server-only';

import { and, sql as drizzleSql, eq } from 'drizzle-orm';
import type { ConnectorStatus } from '@/components/features/connectors/ConnectorCard';
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

export async function loadSettingsConnectorsData(
  clerkUserId: string
): Promise<SettingsConnectorsData | null> {
  const dbUser = await getUserByClerkId(db, clerkUserId);

  if (!dbUser) {
    return null;
  }

  const [gmailRow, calendarRow] = await Promise.all([
    db
      .select({
        status: connectorAccounts.status,
        providerAccountId: connectorAccounts.providerAccountId,
        lastErrorUserMessage: connectorAccounts.lastErrorUserMessage,
      })
      .from(connectorAccounts)
      .where(
        and(
          eq(connectorAccounts.userId, dbUser.id),
          drizzleSql`${connectorAccounts.provider} = 'gmail'::connector_provider`
        )
      )
      .limit(1)
      .then(rows => rows[0] ?? null),
    db
      .select({
        status: connectorAccounts.status,
        providerAccountId: connectorAccounts.providerAccountId,
        lastErrorUserMessage: connectorAccounts.lastErrorUserMessage,
      })
      .from(connectorAccounts)
      .where(
        and(
          eq(connectorAccounts.userId, dbUser.id),
          drizzleSql`${connectorAccounts.provider} = 'google_calendar'::connector_provider`
        )
      )
      .limit(1)
      .then(rows => rows[0] ?? null),
  ]);

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
        eq(suggestedActions.userId, dbUser.id),
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
    gmail: toConnectorState(gmailRow),
    calendar: toConnectorState(calendarRow),
    suggestedActions: pendingActions,
  };
}
