import 'server-only';
import { and, desc, eq } from 'drizzle-orm';
import { TIM_BRAND_DEAL_SOURCE_ACCOUNT } from '@/lib/connectors/brand-deal-opportunity';
import { runConnectorEnrichment } from '@/lib/connectors/enrichment';
import {
  buildGmailOpportunityQuery,
  type GmailMessage,
  getGmailMessage,
  getHeader,
  listGmailMessages,
} from '@/lib/connectors/gmail/client';
import { CONNECTOR_PROVIDERS } from '@/lib/connectors/registry';
import { loadDecryptedToken } from '@/lib/connectors/token-vault';
import { db } from '@/lib/db';
import { connectorAccounts, externalObjects } from '@/lib/db/schema/connectors';
import { env } from '@/lib/env-server';
import { captureError } from '@/lib/error-tracking';
import { logger } from '@/lib/utils/logger';

const DEFAULT_GMAIL_WINDOW_DAYS = 30;

/**
 * Core extraction pipeline for the AI Connector magic moment.
 *
 * Steps:
 * 1. Load decrypted tokens for the user's Gmail connector account.
 * 2. Fetch Gmail booking and paid-brand candidates via a narrow query.
 * 3. Run connector enrichment pipelines (context_facts + memory graph + suggestions).
 *
 * @returns Number of new suggested actions created.
 */
export async function extractAndPropose(userId: string): Promise<number> {
  const gmailAccountId = await syncGmailExternalObjects(userId);
  if (!gmailAccountId) return 0;

  const enrichment = await runConnectorEnrichment(userId, {
    gmailAccountId,
  });
  return enrichment.totalSuggestionsCreated;
}

async function syncGmailExternalObjects(
  userId: string
): Promise<string | null> {
  const gmailAccounts = await db
    .select({
      id: connectorAccounts.id,
      providerAccountId: connectorAccounts.providerAccountId,
    })
    .from(connectorAccounts)
    .where(
      and(
        eq(connectorAccounts.userId, userId),
        eq(connectorAccounts.provider, CONNECTOR_PROVIDERS.gmail),
        eq(connectorAccounts.status, 'connected')
      )
    )
    .orderBy(desc(connectorAccounts.updatedAt));
  const gmailAccount =
    gmailAccounts.find(
      account =>
        account.providerAccountId.trim().toLowerCase() ===
        TIM_BRAND_DEAL_SOURCE_ACCOUNT
    ) ?? gmailAccounts[0];

  if (!gmailAccount) {
    logger.info('[extract-and-propose] Skipping — Gmail not connected', {
      userId,
    });
    return null;
  }

  const gmailTokens = await loadDecryptedToken(gmailAccount.id);
  if (!gmailTokens) {
    logger.error('[extract-and-propose] Token load failed', { userId });
    return null;
  }

  const historyWindowDays =
    parseInt(env.GMAIL_HISTORY_WINDOW_DAYS ?? '', 10) ||
    DEFAULT_GMAIL_WINDOW_DAYS;

  const query = buildGmailOpportunityQuery(historyWindowDays);
  const listResult = await listGmailMessages(
    gmailTokens.accessToken,
    query,
    50
  );
  const messageStubs = listResult.messages ?? [];

  if (messageStubs.length === 0) {
    logger.info('[extract-and-propose] No Gmail opportunity candidates found', {
      userId,
    });
    return gmailAccount.id;
  }

  const messageDetails = await Promise.allSettled(
    messageStubs
      .slice(0, 20)
      .map(stub => getGmailMessage(gmailTokens.accessToken, stub.id))
  );

  const messages = messageDetails
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

  await Promise.allSettled(
    messages.map(m =>
      db
        .insert(externalObjects)
        .values({
          connectorAccountId: gmailAccount.id,
          provider: CONNECTOR_PROVIDERS.gmail,
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

  logger.info('[extract-and-propose] Gmail external_objects synced', {
    userId,
    messageCount: messages.length,
  });

  return gmailAccount.id;
}

export async function extractAndProposeWithErrorCapture(
  userId: string
): Promise<number> {
  try {
    return await extractAndPropose(userId);
  } catch (error) {
    await captureError('extractAndPropose failed', error, { userId });
    throw error;
  }
}
