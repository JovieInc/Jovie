import type { Response } from '@playwright/test';

const ERROR_BODY_TIMEOUT_MS = 500;
const MAX_ERROR_BODY_BYTES = 4_096;
const SAFE_ERROR_CODES = new Set([
  'AUTH_REQUIRED',
  'CHAT_DISABLED',
  'TURN_IN_PROGRESS',
  'RATE_LIMITED',
  'ARTIST_CONTEXT_UNAVAILABLE',
  'CHAT_STREAM_FAILED',
  'CHAT_STREAM_STALLED',
  'CLIENT_DISCONNECTED',
]);
const SAFE_CONTENT_TYPES = new Set([
  'application/json',
  'text/event-stream',
  'text/html',
  'text/plain',
]);
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;

type ChatResponse = Pick<Response, 'ok' | 'status' | 'headers' | 'body'>;

async function readSafeErrorCode(response: ChatResponse): Promise<string> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const body = await Promise.race([
      response.body(),
      new Promise<null>(resolve => {
        timer = setTimeout(() => resolve(null), ERROR_BODY_TIMEOUT_MS);
      }),
    ]);
    if (!body || body.byteLength > MAX_ERROR_BODY_BYTES) return 'unavailable';
    const parsed: unknown = JSON.parse(body.toString('utf8'));
    const errorCode =
      parsed !== null && typeof parsed === 'object' && 'errorCode' in parsed
        ? parsed.errorCode
        : undefined;
    return typeof errorCode === 'string' && SAFE_ERROR_CODES.has(errorCode)
      ? errorCode
      : 'unavailable';
  } catch {
    return 'unavailable';
  } finally {
    clearTimeout(timer);
  }
}

function snapshotChatResponse(response: ChatResponse): {
  readonly contentType: string;
  readonly summary: string;
} {
  const headers = response.headers();
  const rawContentType = headers['content-type']
    ?.split(';', 1)[0]
    ?.trim()
    .toLowerCase();
  const contentType =
    rawContentType && SAFE_CONTENT_TYPES.has(rawContentType)
      ? rawContentType
      : 'unavailable';
  const rawRequestId = headers['x-request-id'];
  const requestId =
    rawRequestId && UUID_PATTERN.test(rawRequestId)
      ? rawRequestId
      : 'unavailable';
  return {
    contentType,
    summary: `HTTP ${response.status()}; content-type=${contentType}; request-id=${requestId}`,
  };
}

/** Report HTTP failures; return safe metadata for later reply-timeout diagnostics. */
export async function assertChatResponseOk(
  response: ChatResponse
): Promise<string> {
  const { contentType, summary } = snapshotChatResponse(response);
  // A successful SSE body can remain open until the model finishes. Never drain it here.
  if (response.ok()) return summary;

  const errorCode =
    contentType === 'application/json'
      ? await readSafeErrorCode(response)
      : 'unavailable';

  throw new Error(
    `Chat POST /api/chat failed: ${summary}; error-code=${errorCode}`
  );
}
