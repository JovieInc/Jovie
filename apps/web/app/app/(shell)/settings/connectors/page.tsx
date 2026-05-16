import { auth } from '@clerk/nextjs/server';
import { and, sql as drizzleSql, eq } from 'drizzle-orm';
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import type { ConnectorStatus } from '@/components/features/connectors/ConnectorCard';
import { APP_ROUTES } from '@/constants/routes';
import { db } from '@/lib/db';
import { users } from '@/lib/db/schema/auth';
import {
  connectorAccounts,
  suggestedActions,
} from '@/lib/db/schema/connectors';
import { ConnectorsClient } from './ConnectorsClient';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Connectors',
};

function toConnectorStatus(
  row: { status: string; lastErrorUserMessage: string | null } | null
): { status: ConnectorStatus; errorMessage?: string } {
  if (!row) return { status: 'not_connected' };
  const s = row.status as ConnectorStatus;
  return {
    status: s,
    errorMessage: row.lastErrorUserMessage ?? undefined,
  };
}

export default async function SettingsConnectorsPage() {
  const { userId: clerkId } = await auth();
  if (!clerkId) {
    redirect(APP_ROUTES.DASHBOARD);
  }

  const [dbUser] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.clerkId, clerkId))
    .limit(1);

  if (!dbUser) {
    redirect(APP_ROUTES.DASHBOARD);
  }

  // Load Gmail + Calendar connector states.
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

  const gmailState = toConnectorStatus(gmailRow);
  const calendarState = toConnectorStatus(calendarRow);

  // Load pending suggested actions for preview.
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

  return (
    <ConnectorsClient
      gmail={{
        status: gmailState.status,
        email: gmailRow?.providerAccountId,
        errorMessage: gmailState.errorMessage,
      }}
      calendar={{
        status: calendarState.status,
        email: calendarRow?.providerAccountId,
        errorMessage: calendarState.errorMessage,
      }}
      suggestedActions={pendingActions}
      isDev={process.env.NODE_ENV !== 'production'}
    />
  );
}
