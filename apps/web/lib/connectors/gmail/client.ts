import 'server-only';
import { serverFetch } from '@/lib/http/server-fetch';
import { logger } from '@/lib/utils/logger';

const GMAIL_BASE = 'https://gmail.googleapis.com/gmail/v1/users/me';

export interface GmailMessageHeader {
  readonly name: string;
  readonly value: string;
}

export interface GmailMessagePart {
  readonly mimeType: string;
  readonly body?: {
    readonly data?: string;
    readonly size: number;
  };
  readonly parts?: GmailMessagePart[];
}

export interface GmailMessage {
  readonly id: string;
  readonly threadId: string;
  readonly labelIds?: string[];
  readonly snippet: string;
  readonly payload?: {
    readonly headers: GmailMessageHeader[];
    readonly parts?: GmailMessagePart[];
    readonly body?: {
      readonly data?: string;
      readonly size: number;
    };
  };
  readonly internalDate?: string;
}

export interface GmailMessageListResponse {
  readonly messages?: Array<{ readonly id: string; readonly threadId: string }>;
  readonly nextPageToken?: string;
  readonly resultSizeEstimate: number;
}

/**
 * Narrow Gmail query for booking signals.
 * Targets primary-category emails from the last N days containing booking keywords.
 * This deliberately avoids promotional/social tabs to reduce noise.
 */
export function buildGmailBookingQuery(historyWindowDays: number): string {
  return `category:primary newer_than:${historyWindowDays}d (booking OR "show confirmation" OR "gig confirmation" OR "contract" OR "performance agreement" OR "event confirmation")`;
}

/**
 * Lists Gmail messages matching the booking query.
 * Returns up to `maxResults` message stubs (id + threadId only).
 */
export async function listGmailMessages(
  accessToken: string,
  query: string,
  maxResults = 50
): Promise<GmailMessageListResponse> {
  const params = new URLSearchParams({
    q: query,
    maxResults: String(maxResults),
  });

  const res = await serverFetch(`${GMAIL_BASE}/messages?${params}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    timeoutMs: 15_000,
    context: 'Gmail list messages',
    retry: { maxRetries: 2, baseDelayMs: 500, maxDelayMs: 2000 },
  });

  if (res.status === 403) {
    logger.error('[gmail/client] listGmailMessages 403 — scope or quota issue');
    throw new Error('Gmail access forbidden (403) — check scopes or quota');
  }

  if (res.status === 429) {
    logger.error('[gmail/client] listGmailMessages 429 — rate limited');
    throw new Error('Gmail rate limited (429)');
  }

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Gmail list messages failed: ${res.status} ${body}`);
  }

  return (await res.json()) as GmailMessageListResponse;
}

/**
 * Fetches a single Gmail message with full metadata.
 * Uses `format=metadata` to get headers only — we never fetch the raw body
 * to comply with the "no raw email bodies in payload" invariant.
 */
export async function getGmailMessage(
  accessToken: string,
  messageId: string
): Promise<GmailMessage> {
  const params = new URLSearchParams({
    format: 'metadata',
    metadataHeaders: ['From', 'To', 'Subject', 'Date', 'Message-ID'].join(','),
  });

  const res = await serverFetch(
    `${GMAIL_BASE}/messages/${messageId}?${params}`,
    {
      headers: { Authorization: `Bearer ${accessToken}` },
      timeoutMs: 10_000,
      context: `Gmail get message ${messageId}`,
      retry: { maxRetries: 2, baseDelayMs: 500, maxDelayMs: 2000 },
    }
  );

  if (res.status === 404) {
    throw new Error(`Gmail message not found: ${messageId}`);
  }

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Gmail get message failed: ${res.status} ${body}`);
  }

  return (await res.json()) as GmailMessage;
}

/**
 * Extracts a header value from a Gmail message payload by name (case-insensitive).
 */
export function getHeader(message: GmailMessage, name: string): string | null {
  return (
    message.payload?.headers.find(
      h => h.name.toLowerCase() === name.toLowerCase()
    )?.value ?? null
  );
}
