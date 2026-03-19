/**
 * Email Threading — groups inbound emails into conversations.
 *
 * Strategy:
 * 1. Match by RFC 822 In-Reply-To / References headers (reliable)
 * 2. Fallback: match by sender email + normalized subject (fuzzy)
 */

import { and, sql as drizzleSql, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { emailThreads, inboundEmails } from '@/lib/db/schema/inbox';
import { normalizeSubject } from './constants';

interface ThreadMatchInput {
  creatorProfileId: string;
  inReplyTo: string | null;
  references: string[];
  fromEmail: string;
  subject: string | null;
}

/**
 * Find an existing thread for an inbound email, or return null if it's a new conversation.
 */
export async function findThread(
  input: ThreadMatchInput
): Promise<string | null> {
  // Strategy 1: Match by In-Reply-To or References headers
  if (input.inReplyTo || input.references.length > 0) {
    const headerMatch = await matchByHeaders(input);
    if (headerMatch) return headerMatch;
  }

  // Strategy 2: Match by sender + normalized subject
  const subjectMatch = await matchBySenderAndSubject(input);
  if (subjectMatch) return subjectMatch;

  return null;
}

/**
 * Match by In-Reply-To header — look for an existing inbound email with that Message-ID.
 */
async function matchByHeaders(input: ThreadMatchInput): Promise<string | null> {
  const messageIdsToCheck = [
    ...(input.inReplyTo ? [input.inReplyTo] : []),
    ...input.references,
  ].filter(Boolean);

  if (messageIdsToCheck.length === 0) return null;

  // Find any inbound email with a matching messageId
  const match = await db
    .select({ threadId: inboundEmails.threadId })
    .from(inboundEmails)
    .where(
      and(
        eq(inboundEmails.creatorProfileId, input.creatorProfileId),
        drizzleSql`${inboundEmails.messageId} = ANY(${messageIdsToCheck})`
      )
    )
    .limit(1);

  return match[0]?.threadId ?? null;
}

/**
 * Match by sender email + normalized subject within the last 30 days.
 * This catches cases where email clients don't set proper threading headers.
 */
async function matchBySenderAndSubject(
  input: ThreadMatchInput
): Promise<string | null> {
  const normalized = normalizeSubject(input.subject);
  if (!normalized) return null;

  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  // Find a thread with a matching sender + subject within 30 days
  const match = await db
    .select({ threadId: inboundEmails.threadId })
    .from(inboundEmails)
    .innerJoin(emailThreads, eq(inboundEmails.threadId, emailThreads.id))
    .where(
      and(
        eq(inboundEmails.creatorProfileId, input.creatorProfileId),
        eq(inboundEmails.fromEmail, input.fromEmail),
        drizzleSql`${emailThreads.subject} = ${normalized}`,
        drizzleSql`${inboundEmails.receivedAt} > ${thirtyDaysAgo.toISOString()}`
      )
    )
    .limit(1);

  return match[0]?.threadId ?? null;
}
