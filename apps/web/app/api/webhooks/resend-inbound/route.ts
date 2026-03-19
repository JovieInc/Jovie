/**
 * Resend Inbound Webhook Handler
 *
 * Receives inbound emails sent to *@jovie.fm addresses.
 * Resend's inbound webhooks send metadata only (from, to, subject, messageId).
 * Full email body and attachments must be fetched via the Resend Received Emails API.
 *
 * Flow:
 * 1. Verify webhook signature (SVix)
 * 2. Parse recipient → look up artist by username (local part of email)
 * 3. Fetch full email content via Resend API
 * 4. Store in inbound_emails table
 * 5. Thread assignment (In-Reply-To/References headers, fallback to sender+subject)
 * 6. AI classification (inline, ~200ms)
 * 7. Notify artist of new email
 *
 * Error handling:
 * - Invalid signature → 401
 * - Unknown username → 200 (acknowledge, log)
 * - DB write failure → 500 (Resend retries)
 * - AI classification failure → thread shows as "uncategorized"
 */

import { createHmac, timingSafeEqual } from 'node:crypto';
import { sql as drizzleSql, eq } from 'drizzle-orm';
import { NextRequest, NextResponse } from 'next/server';

import { db } from '@/lib/db';
import { emailThreads, inboundEmails } from '@/lib/db/schema/inbox';
import { creatorProfiles } from '@/lib/db/schema/profiles';
import { env } from '@/lib/env-server';
import { classifyEmail } from '@/lib/inbox/classifier';
import { normalizeSubject } from '@/lib/inbox/constants';
import { findThread } from '@/lib/inbox/threading';
import { logger } from '@/lib/utils/logger';

export const runtime = 'nodejs';

const NO_STORE_HEADERS = { 'Cache-Control': 'no-store' } as const;

interface InboundArtist {
  id: string;
  displayName: string | null;
  username: string | null;
  genres: string[] | null;
}

async function processInboundEmail(
  data: ResendInboundEvent['data'],
  artist: InboundArtist,
  recipientEmail: string
): Promise<void> {
  const fullEmail = await fetchFullEmail(data.email_id);

  const existingThreadId = await findThread({
    creatorProfileId: artist.id,
    inReplyTo: fullEmail?.headers?.['in-reply-to'] ?? null,
    references: parseReferences(fullEmail?.headers?.references),
    fromEmail: data.from,
    subject: data.subject ?? null,
  });

  let threadId: string;

  if (existingThreadId) {
    threadId = existingThreadId;
    await db
      .update(emailThreads)
      .set({
        latestMessageAt: new Date(),
        messageCount: drizzleSql`${emailThreads.messageCount} + 1`,
        updatedAt: new Date(),
      })
      .where(eq(emailThreads.id, existingThreadId));
  } else {
    const [newThread] = await db
      .insert(emailThreads)
      .values({
        creatorProfileId: artist.id,
        subject: normalizeSubject(data.subject),
        status: 'pending_review',
      })
      .returning({ id: emailThreads.id });

    threadId = newThread!.id;
  }

  await db.insert(inboundEmails).values({
    creatorProfileId: artist.id,
    threadId,
    messageId: data.message_id ?? null,
    inReplyTo: fullEmail?.headers?.['in-reply-to'] ?? null,
    references: parseReferences(fullEmail?.headers?.references),
    fromEmail: data.from,
    fromName: data.from_name ?? null,
    toEmail: recipientEmail,
    ccEmails: data.cc ?? [],
    subject: data.subject ?? null,
    bodyText: fullEmail?.text ?? null,
    bodyHtml: fullEmail?.html ?? null,
    strippedText: fullEmail?.stripped_text ?? null,
    rawHeaders: fullEmail?.headers ?? null,
    resendEmailId: data.email_id,
  });

  if (!existingThreadId) {
    const classification = await classifyEmail({
      fromEmail: data.from,
      fromName: data.from_name ?? null,
      subject: data.subject ?? null,
      bodyText: fullEmail?.text ?? null,
      artistName: artist.displayName ?? artist.username ?? 'Artist',
      artistGenres: artist.genres,
    });

    if (classification) {
      await db
        .update(emailThreads)
        .set({
          suggestedCategory: classification.category,
          suggestedTerritory: classification.territory,
          categoryConfidence: classification.confidence,
          priority: classification.priority,
          aiSummary: classification.summary,
          aiExtractedData: classification.extractedData,
          updatedAt: new Date(),
        })
        .where(eq(emailThreads.id, threadId));
    }
  }
}

/**
 * POST handler for Resend inbound email webhooks.
 */
export async function POST(req: NextRequest) {
  let rawBody: string;
  try {
    rawBody = await req.text();
  } catch {
    return NextResponse.json(
      { error: 'Bad request' },
      { status: 400, headers: NO_STORE_HEADERS }
    );
  }

  // Verify webhook signature
  const svixTimestamp = req.headers.get('svix-timestamp');
  const svixSignature = req.headers.get('svix-signature');

  const webhookSecret = env.RESEND_INBOUND_WEBHOOK_SECRET;

  if (!webhookSecret && process.env.NODE_ENV === 'production') {
    logger.error('RESEND_INBOUND_WEBHOOK_SECRET not configured in production');
    return NextResponse.json(
      { error: 'Webhook not configured' },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }

  if (webhookSecret && svixSignature && svixTimestamp) {
    const valid = verifySignature(
      rawBody,
      svixSignature,
      svixTimestamp,
      webhookSecret
    );
    if (!valid) {
      logger.warn('Inbound webhook signature verification failed');
      return NextResponse.json(
        { error: 'Invalid signature' },
        { status: 401, headers: NO_STORE_HEADERS }
      );
    }
  }

  let payload: ResendInboundEvent;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json(
      { error: 'Invalid JSON' },
      { status: 400, headers: NO_STORE_HEADERS }
    );
  }

  // Only process email.received events
  if (payload.type !== 'email.received') {
    return NextResponse.json({ ok: true }, { headers: NO_STORE_HEADERS });
  }

  const data = payload.data;

  // Extract username from recipient email (local part before @)
  const recipientEmail = data.to?.[0];
  if (!recipientEmail) {
    logger.warn('Inbound email with no recipient', { payload: data });
    return NextResponse.json({ ok: true }, { headers: NO_STORE_HEADERS });
  }

  const [username] = recipientEmail.split('@');
  if (!username) {
    return NextResponse.json({ ok: true }, { headers: NO_STORE_HEADERS });
  }

  // Look up artist by username
  const profile = await db
    .select({
      id: creatorProfiles.id,
      displayName: creatorProfiles.displayName,
      username: creatorProfiles.username,
      genres: creatorProfiles.genres,
    })
    .from(creatorProfiles)
    .where(eq(creatorProfiles.username, username.toLowerCase()))
    .limit(1);

  if (!profile[0]) {
    logger.info('Inbound email to unknown username', {
      username,
      from: data.from,
    });
    return NextResponse.json({ ok: true }, { headers: NO_STORE_HEADERS });
  }

  const artist = profile[0];

  try {
    await processInboundEmail(data, artist, recipientEmail);

    logger.info('Inbound email processed', {
      username,
      from: data.from,
      subject: data.subject,
    });

    return NextResponse.json({ ok: true }, { headers: NO_STORE_HEADERS });
  } catch (error) {
    logger.error('Inbound email processing failed', {
      username,
      from: data.from,
      error: error instanceof Error ? error.message : String(error),
    });

    // Return 500 so Resend retries
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface ResendInboundEvent {
  type: string;
  data: {
    email_id: string;
    from: string;
    from_name?: string;
    to?: string[];
    cc?: string[];
    subject?: string;
    message_id?: string;
  };
}

interface ResendFullEmail {
  text?: string;
  html?: string;
  stripped_text?: string;
  headers?: Record<string, string>;
}

/**
 * Fetch full email content from Resend's Received Emails API.
 * Returns null if the fetch fails (email will be stored without body).
 */
async function fetchFullEmail(
  emailId: string
): Promise<ResendFullEmail | null> {
  try {
    const response = await fetch(`https://api.resend.com/emails/${emailId}`, {
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
      },
    });

    if (!response.ok) {
      logger.warn('Failed to fetch full email from Resend', {
        emailId,
        status: response.status,
      });
      return null;
    }

    return await response.json();
  } catch (error) {
    logger.warn('Error fetching full email from Resend', {
      emailId,
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

function parseReferences(refs: string | undefined | null): string[] {
  if (!refs) return [];
  return refs.split(/\s+/).filter(Boolean);
}

function verifySignature(
  payload: string,
  signature: string,
  timestamp: string,
  secret: string
): boolean {
  try {
    const timestampMs = Number(timestamp) * 1000;
    if (
      Number.isNaN(timestampMs) ||
      Math.abs(Date.now() - timestampMs) > 5 * 60 * 1000
    ) {
      return false;
    }

    const signatures = signature.split(' ');
    const signedContent = `${timestamp}.${payload}`;
    const secretBytes = Buffer.from(
      secret.startsWith('whsec_') ? secret.slice(6) : secret,
      'base64'
    );
    const expectedSignature = createHmac('sha256', secretBytes)
      .update(signedContent)
      .digest('base64');

    for (const sig of signatures) {
      const [version, providedSignature] = sig.split(',');
      if (version === 'v1' && providedSignature) {
        const providedBuffer = Buffer.from(providedSignature, 'base64');
        const expectedBuffer = Buffer.from(expectedSignature, 'base64');
        if (
          providedBuffer.length === expectedBuffer.length &&
          timingSafeEqual(providedBuffer, expectedBuffer)
        ) {
          return true;
        }
      }
    }

    return false;
  } catch {
    return false;
  }
}
