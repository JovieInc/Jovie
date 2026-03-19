/**
 * Inbox Router — matches classified emails to artist contacts and sends routing replies.
 *
 * Flow:
 * 1. Artist confirms AI category suggestion (or overrides)
 * 2. Router looks up contacts with forwardInboxEmails=true
 * 3. Matches by role (category → contact role) AND territory (most specific wins)
 * 4. Sends routing reply with CC to matched contact + artist@jovie.fm
 */

import { and, eq } from 'drizzle-orm';
import { Resend } from 'resend';
import { db } from '@/lib/db';
import {
  emailThreads,
  inboundEmails,
  outboundReplies,
} from '@/lib/db/schema/inbox';
import { creatorContacts, creatorProfiles } from '@/lib/db/schema/profiles';
import { env } from '@/lib/env-server';
import { logger } from '@/lib/utils/logger';
import {
  CATEGORY_TO_CONTACT_ROLE,
  getTerritorySpecificity,
  INBOX_DOMAIN,
} from './constants';

interface RouteResult {
  success: boolean;
  routedToContactId?: string;
  error?: string;
}

/**
 * Confirm a thread's category and route it to the matching contact.
 *
 * Called when the artist clicks [Confirm & Route] or [Change Category] in the dashboard.
 */
export async function confirmAndRoute(
  threadId: string,
  category: string,
  territory: string | null
): Promise<RouteResult> {
  // 1. Load thread + profile + first inbound email
  const thread = await db
    .select()
    .from(emailThreads)
    .where(eq(emailThreads.id, threadId))
    .limit(1);

  if (!thread[0]) return { success: false, error: 'Thread not found' };

  const t = thread[0];

  // 2. Lock category and territory on the thread
  await db
    .update(emailThreads)
    .set({
      category: category as typeof t.category,
      territory,
      updatedAt: new Date(),
    })
    .where(eq(emailThreads.id, threadId));

  // 3. Find matching contact
  const contactRole = CATEGORY_TO_CONTACT_ROLE[category];
  if (!contactRole) {
    // No routing for spam/other — just mark as in_progress
    await db
      .update(emailThreads)
      .set({ status: 'in_progress', updatedAt: new Date() })
      .where(eq(emailThreads.id, threadId));
    return { success: true };
  }

  const contacts = await db
    .select()
    .from(creatorContacts)
    .where(
      and(
        eq(creatorContacts.creatorProfileId, t.creatorProfileId),
        eq(
          creatorContacts.role,
          contactRole as (typeof creatorContacts.role.enumValues)[number]
        ),
        eq(creatorContacts.isActive, true),
        eq(creatorContacts.forwardInboxEmails, true)
      )
    );

  if (contacts.length === 0) {
    // No matching contact — mark as in_progress for artist to handle
    await db
      .update(emailThreads)
      .set({ status: 'in_progress', updatedAt: new Date() })
      .where(eq(emailThreads.id, threadId));
    return { success: true };
  }

  // 4. Territory tiebreaker: most specific match wins
  const matchedContact = findBestTerritoryMatch(contacts, territory);

  if (!matchedContact?.email) {
    await db
      .update(emailThreads)
      .set({ status: 'in_progress', updatedAt: new Date() })
      .where(eq(emailThreads.id, threadId));
    return { success: true };
  }

  // 5. Load artist profile for display name
  const profile = await db
    .select({
      displayName: creatorProfiles.displayName,
      username: creatorProfiles.username,
    })
    .from(creatorProfiles)
    .where(eq(creatorProfiles.id, t.creatorProfileId))
    .limit(1);

  const artistName = profile[0]?.displayName ?? 'this artist';
  const artistEmail = `${profile[0]?.username}@${INBOX_DOMAIN}`;

  // 6. Load the first inbound email for reply context
  const firstEmail = await db
    .select()
    .from(inboundEmails)
    .where(eq(inboundEmails.threadId, threadId))
    .orderBy(inboundEmails.receivedAt)
    .limit(1);

  if (!firstEmail[0]) {
    return { success: false, error: 'No inbound email found for thread' };
  }

  // 7. Send routing reply
  const roleLabel = formatRoleLabel(contactRole);
  const contactLabel = matchedContact.companyName
    ? `${matchedContact.personName} at ${matchedContact.companyName}`
    : (matchedContact.personName ?? matchedContact.email);

  const bodyText = `Thanks for reaching out! I'm connecting you with ${contactLabel} who handles ${roleLabel} for ${artistName}. They'll be in touch.\n\nBest,\n${artistName} via Jovie`;

  try {
    const resend = new Resend(env.RESEND_API_KEY ?? '');
    const sent = await resend.emails.send({
      from: `${artistName} via Jovie <${artistEmail}>`,
      to: [firstEmail[0].fromEmail],
      cc: [matchedContact.email, artistEmail],
      subject: `Re: ${firstEmail[0].subject ?? '(no subject)'}`,
      text: bodyText,
      headers: firstEmail[0].messageId
        ? { 'In-Reply-To': firstEmail[0].messageId }
        : undefined,
    });

    // 8. Record the outbound reply
    await db.insert(outboundReplies).values({
      creatorProfileId: t.creatorProfileId,
      threadId,
      inReplyToMessageId: firstEmail[0].messageId,
      toEmail: firstEmail[0].fromEmail,
      ccEmails: [matchedContact.email, artistEmail],
      subject: `Re: ${firstEmail[0].subject ?? '(no subject)'}`,
      bodyText,
      sentBy: 'jovie_routing',
      resendMessageId: sent.data?.id ?? null,
    });

    // 9. Update thread status
    await db
      .update(emailThreads)
      .set({
        status: 'routed',
        routedToContactId: matchedContact.id,
        routedAt: new Date(),
        isRead: matchedContact.autoMarkRead || t.isRead,
        updatedAt: new Date(),
      })
      .where(eq(emailThreads.id, threadId));

    logger.info('Email routed successfully', {
      threadId,
      category,
      contactId: matchedContact.id,
      contactEmail: matchedContact.email,
    });

    return { success: true, routedToContactId: matchedContact.id };
  } catch (error) {
    logger.error('Routing email send failed', {
      threadId,
      error: error instanceof Error ? error.message : String(error),
    });

    await db
      .update(emailThreads)
      .set({ status: 'routing_failed', updatedAt: new Date() })
      .where(eq(emailThreads.id, threadId));

    return {
      success: false,
      error:
        error instanceof Error ? error.message : 'Failed to send routing email',
    };
  }
}

/**
 * Find the contact with the most specific territory match.
 * If no territory is specified, returns the first contact.
 */
export function findBestTerritoryMatch(
  contacts: (typeof creatorContacts.$inferSelect)[],
  territory: string | null
): typeof creatorContacts.$inferSelect | null {
  if (!territory || contacts.length === 1) return contacts[0] ?? null;

  let bestMatch: typeof creatorContacts.$inferSelect | null = null;
  let bestSpecificity = -1;

  for (const contact of contacts) {
    const territories = contact.territories as string[];

    // Empty territories = worldwide (lowest specificity)
    if (territories.length === 0) {
      if (bestSpecificity < 0) {
        bestMatch = contact;
        bestSpecificity = 0;
      }
      continue;
    }

    for (const t of territories) {
      // Check if this contact's territory matches or contains the detected territory
      if (
        t.toLowerCase() === territory.toLowerCase() ||
        territory.toLowerCase().includes(t.toLowerCase())
      ) {
        const specificity = getTerritorySpecificity(t);
        if (specificity > bestSpecificity) {
          bestMatch = contact;
          bestSpecificity = specificity;
        }
      }
    }
  }

  // If no territory match, return the first contact as fallback
  return bestMatch ?? contacts[0] ?? null;
}

export function formatRoleLabel(role: string): string {
  const labels: Record<string, string> = {
    bookings: 'bookings',
    management: 'management',
    press_pr: 'press & PR',
    brand_partnerships: 'brand partnerships',
    music_collaboration: 'music collaborations',
    fan_general: 'fan inquiries',
  };
  return labels[role] ?? role;
}
