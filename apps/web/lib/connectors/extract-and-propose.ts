import 'server-only';
import { and, sql as drizzleSql, eq } from 'drizzle-orm';
import {
  buildGmailBookingQuery,
  type GmailMessage,
  getGmailMessage,
  getHeader,
  listGmailMessages,
} from '@/lib/connectors/gmail/client';
import {
  extractEventSignal,
  type GmailMessageInput,
} from '@/lib/connectors/gmail/extract-event-signal';
import {
  hasOverlappingEvent,
  listCalendarEvents,
  SyncTokenExpiredError,
} from '@/lib/connectors/google-calendar/list-events';
import { loadDecryptedToken } from '@/lib/connectors/token-vault';
import { db } from '@/lib/db';
import {
  connectorAccounts,
  externalObjects,
  suggestedActions,
} from '@/lib/db/schema/connectors';
import { env } from '@/lib/env-server';
import { captureError } from '@/lib/error-tracking';
import { logger } from '@/lib/utils/logger';

const DEFAULT_GMAIL_WINDOW_DAYS = 30;

/**
 * Core extraction pipeline for the AI Connector magic moment.
 *
 * Steps:
 * 1. Load decrypted tokens for the user's Gmail + Calendar connector accounts.
 * 2. Fetch Gmail booking candidates via narrow query.
 * 3. Extract event signals via AI Gateway.
 * 4. Check Calendar for existing events (dedup).
 * 5. Write new suggested_actions rows for candidates without Calendar conflicts.
 *
 * @returns Number of new suggested actions created.
 */
export async function extractAndPropose(userId: string): Promise<number> {
  // -------------------------------------------------------------------------
  // 1. Resolve connector accounts
  // -------------------------------------------------------------------------
  const [gmailAccount, calendarAccount] = await Promise.all([
    db
      .select({ id: connectorAccounts.id })
      .from(connectorAccounts)
      .where(
        and(
          eq(connectorAccounts.userId, userId),
          drizzleSql`${connectorAccounts.provider} = 'gmail'::connector_provider`,
          drizzleSql`${connectorAccounts.status} = 'connected'::connector_status`
        )
      )
      .limit(1)
      .then(rows => rows[0] ?? null),
    db
      .select({ id: connectorAccounts.id })
      .from(connectorAccounts)
      .where(
        and(
          eq(connectorAccounts.userId, userId),
          drizzleSql`${connectorAccounts.provider} = 'google_calendar'::connector_provider`,
          drizzleSql`${connectorAccounts.status} = 'connected'::connector_status`
        )
      )
      .limit(1)
      .then(rows => rows[0] ?? null),
  ]);

  if (!gmailAccount || !calendarAccount) {
    logger.info('[extract-and-propose] Skipping — connectors not connected', {
      userId,
    });
    return 0;
  }

  const [gmailTokens, calendarTokens] = await Promise.all([
    loadDecryptedToken(gmailAccount.id),
    loadDecryptedToken(calendarAccount.id),
  ]);

  if (!gmailTokens || !calendarTokens) {
    logger.error('[extract-and-propose] Token load failed', { userId });
    return 0;
  }

  // -------------------------------------------------------------------------
  // 2. Fetch Gmail booking candidates
  // -------------------------------------------------------------------------
  const historyWindowDays =
    parseInt(env.GMAIL_HISTORY_WINDOW_DAYS ?? '', 10) ||
    DEFAULT_GMAIL_WINDOW_DAYS;

  const query = buildGmailBookingQuery(historyWindowDays);
  const listResult = await listGmailMessages(
    gmailTokens.accessToken,
    query,
    50
  );
  const messageStubs = listResult.messages ?? [];

  if (messageStubs.length === 0) {
    logger.info('[extract-and-propose] No Gmail booking candidates found', {
      userId,
    });
    return 0;
  }

  // Fetch full metadata for each message (up to 20).
  const messageDetails = await Promise.allSettled(
    messageStubs
      .slice(0, 20)
      .map(stub => getGmailMessage(gmailTokens.accessToken, stub.id))
  );

  const messages: GmailMessageInput[] = messageDetails
    .filter(
      (r): r is PromiseFulfilledResult<GmailMessage> => r.status === 'fulfilled'
    )
    .map(r => ({
      messageId: r.value.id,
      subject: getHeader(r.value, 'Subject') ?? '(no subject)',
      from: getHeader(r.value, 'From') ?? '',
      date: getHeader(r.value, 'Date') ?? '',
      snippet: r.value.snippet ?? '',
    }));

  // Store normalized (non-body) message metadata in external_objects.
  await Promise.allSettled(
    messages.map(m =>
      db
        .insert(externalObjects)
        .values({
          connectorAccountId: gmailAccount.id,
          provider: drizzleSql`'gmail'::connector_provider`,
          kind: 'gmail_message',
          providerId: m.messageId,
          payload: {
            subject: m.subject,
            from: m.from,
            date: m.date,
            snippet: m.snippet.slice(0, 200),
          },
        })
        .onConflictDoNothing()
    )
  );

  // -------------------------------------------------------------------------
  // 3. Extract event signals via AI
  // -------------------------------------------------------------------------
  const extraction = await extractEventSignal(messages, userId);

  if (extraction.events.length === 0) {
    logger.info('[extract-and-propose] No event signals extracted', { userId });
    return 0;
  }

  // -------------------------------------------------------------------------
  // 4. Check Calendar for conflicts
  // -------------------------------------------------------------------------
  let calendarEvents;
  try {
    const calResult = await listCalendarEvents(calendarTokens.accessToken);
    calendarEvents = calResult.items;
  } catch (err) {
    if (err instanceof SyncTokenExpiredError) {
      const calResult = await listCalendarEvents(calendarTokens.accessToken);
      calendarEvents = calResult.items;
    } else {
      throw err;
    }
  }

  // -------------------------------------------------------------------------
  // 5. Write suggested_actions for non-duplicate events
  // -------------------------------------------------------------------------
  let created = 0;

  for (const event of extraction.events) {
    if (event.confidence < 0.7) {
      logger.info('[extract-and-propose] Skipping low-confidence event', {
        title: event.title,
        confidence: event.confidence,
      });
      continue;
    }

    if (hasOverlappingEvent(event.startsAt, calendarEvents, 6)) {
      logger.info(
        '[extract-and-propose] Calendar conflict detected, skipping',
        {
          title: event.title,
        }
      );
      continue;
    }

    const payload = {
      title: event.title,
      startsAt: event.startsAt,
      endsAt: event.endsAt,
      venueName: event.venueName,
      city: event.city,
      region: event.region,
      country: event.country,
      rationale: event.rationale,
      confidence: event.confidence,
    };

    try {
      await db
        .insert(suggestedActions)
        .values({
          userId,
          kind: 'calendar.create_event',
          targetConnectorAccountId: calendarAccount.id,
          payload,
          status:
            drizzleSql`'pending'::suggested_action_status` as unknown as 'pending',
          sourceRefs: [event.sourceRef],
          rationale: event.rationale,
          idempotencyKey: `${userId}-${event.sourceRef.messageId}-${event.startsAt}`,
          sideEffects: [],
        })
        .onConflictDoNothing();

      created++;
    } catch (err) {
      await captureError('Failed to insert suggested_action', err, {
        userId,
        eventTitle: event.title,
      });
    }
  }

  logger.info('[extract-and-propose] Complete', {
    userId,
    created,
    total: extraction.events.length,
  });
  return created;
}
