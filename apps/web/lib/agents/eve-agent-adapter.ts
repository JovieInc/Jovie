import 'server-only';

import { env } from '@/lib/env';
import { boundedFetch } from '@/lib/http/bounded-fetch';
import { withTimeout } from '@/lib/resilience/primitives';
import { logger } from '@/lib/utils/logger';
import {
  type CoreChatHarness,
  type CoreChatHarnessInput,
  type CoreChatHarnessReason,
  type CoreChatHarnessResult,
  makeCoreChatResult,
} from './core-chat-harness';

const DEFAULT_TIMEOUT_MS = 1_500;
const MAX_USER_MESSAGE_CHARS = 4_000;
const MAX_TOOL_NAMES = 32;
const MAX_TOOL_NAME_CHARS = 120;
const MAX_EVENT_TYPES = 32;
const MAX_SESSION_RESPONSE_BYTES = 16 * 1024;
const MAX_STREAM_RESPONSE_BYTES = 256 * 1024;
const MAX_EVENT_LINE_CHARS = 32 * 1024;
const CORE_CHAT_PROTOCOL_VERSION = 1;
const INITIAL_STREAM_INDEX = 0;

const COMPLETED_EVENT_TYPES = new Set([
  'session.waiting',
  'session.completed',
  'turn.completed',
]);
const FAILED_EVENT_TYPES = new Set(['session.failed', 'turn.failed']);

type JsonRecord = Record<string, unknown>;

type EndpointResolution =
  | { endpoint: URL }
  | {
      reason: Extract<
        CoreChatHarnessReason,
        'missing_endpoint' | 'invalid_endpoint' | 'missing_auth'
      >;
    };

class EveResponseLimitError extends Error {
  constructor(context: string) {
    super(`${context} exceeded the response size limit`);
    this.name = 'EveResponseLimitError';
  }
}

function isJsonRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isLoopbackHostname(hostname: string): boolean {
  const normalized = hostname.toLowerCase();
  if (
    normalized === 'localhost' ||
    normalized.endsWith('.localhost') ||
    normalized === '::1' ||
    normalized === '[::1]'
  ) {
    return true;
  }

  const octets = normalized.split('.');
  return (
    octets.length === 4 &&
    octets.every(octet => /^(?:0|[1-9]\d{0,2})$/.test(octet)) &&
    Number(octets[0]) === 127 &&
    octets.slice(1).every(octet => Number(octet) <= 255)
  );
}

function resolveEndpoint(): EndpointResolution {
  const rawUrl = env.EVE_CORE_CHAT_URL?.trim();
  if (!rawUrl) return { reason: 'missing_endpoint' };

  let endpoint: URL;
  try {
    endpoint = new URL(rawUrl);
  } catch {
    return { reason: 'invalid_endpoint' };
  }

  if (
    !['http:', 'https:'].includes(endpoint.protocol) ||
    endpoint.username ||
    endpoint.password ||
    endpoint.search ||
    endpoint.hash ||
    endpoint.pathname !== '/'
  ) {
    return { reason: 'invalid_endpoint' };
  }

  if (endpoint.protocol === 'http:' && !isLoopbackHostname(endpoint.hostname)) {
    return { reason: 'invalid_endpoint' };
  }

  const authToken = env.EVE_CORE_CHAT_AUTH_TOKEN?.trim();
  if (!authToken && !isLoopbackHostname(endpoint.hostname)) {
    return { reason: 'missing_auth' };
  }

  return { endpoint };
}

function requestHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: 'application/json',
    'Content-Type': 'application/json',
  };
  const authToken = env.EVE_CORE_CHAT_AUTH_TOKEN?.trim();
  if (authToken) headers.Authorization = `Bearer ${authToken}`;
  return headers;
}

function streamHeaders(): Record<string, string> {
  return {
    ...requestHeaders(),
    Accept: 'application/x-ndjson',
  };
}

function boundedUserMessage(userMessage: string | null): string {
  const text = userMessage?.trim();
  if (!text)
    return 'Register this Jovie core chat turn as a shadow observation.';
  return text.slice(0, MAX_USER_MESSAGE_CHARS);
}

function boundedToolNames(toolNames: readonly string[]): string[] {
  return toolNames
    .slice(0, MAX_TOOL_NAMES)
    .map(toolName => toolName.slice(0, MAX_TOOL_NAME_CHARS));
}

function parseSessionId(value: unknown): string | null {
  if (!isJsonRecord(value)) return null;
  return typeof value.sessionId === 'string' && value.sessionId.length > 0
    ? value.sessionId
    : null;
}

async function readBoundedResponseText(
  response: Response,
  maxBytes: number,
  signal: AbortSignal,
  context: string
): Promise<string> {
  if (!response.body) {
    const text = await response.text();
    if (new TextEncoder().encode(text).byteLength > maxBytes) {
      throw new EveResponseLimitError(context);
    }
    return text;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  const chunks: string[] = [];
  let byteLength = 0;
  const cancelReader = () => {
    void reader.cancel(signal.reason).catch(() => {});
  };

  if (signal.aborted) {
    cancelReader();
  } else {
    signal.addEventListener('abort', cancelReader, { once: true });
  }

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        chunks.push(decoder.decode());
        return chunks.join('');
      }

      byteLength += value.byteLength;
      if (byteLength > maxBytes) {
        throw new EveResponseLimitError(context);
      }
      chunks.push(decoder.decode(value, { stream: true }));
    }
  } catch (error) {
    cancelReader();
    throw error;
  } finally {
    signal.removeEventListener('abort', cancelReader);
    reader.releaseLock();
  }
}

function parseEventTypes(body: string):
  | {
      eventTypes: string[];
      hasCompleted: boolean;
      hasFailed: boolean;
      valid: true;
    }
  | {
      eventTypes: string[];
      hasCompleted: boolean;
      hasFailed: boolean;
      valid: false;
    } {
  const eventTypes: string[] = [];
  let hasCompleted = false;
  let hasFailed = false;
  for (const line of body.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (trimmed.length > MAX_EVENT_LINE_CHARS) {
      return { eventTypes, hasCompleted, hasFailed, valid: false };
    }
    try {
      const event = JSON.parse(trimmed) as unknown;
      if (!isJsonRecord(event) || typeof event.type !== 'string') {
        return { eventTypes, hasCompleted, hasFailed, valid: false };
      }
      hasCompleted ||= COMPLETED_EVENT_TYPES.has(event.type);
      hasFailed ||= FAILED_EVENT_TYPES.has(event.type);
      if (eventTypes.length < MAX_EVENT_TYPES) eventTypes.push(event.type);
    } catch {
      return { eventTypes, hasCompleted, hasFailed, valid: false };
    }
  }
  return {
    eventTypes,
    hasCompleted,
    hasFailed,
    valid: eventTypes.length > 0,
  };
}

function errorReason(
  input: CoreChatHarnessInput,
  timedOut: boolean
): Extract<CoreChatHarnessReason, 'aborted' | 'timeout' | 'stream_error'> {
  if (input.signal.aborted) return 'aborted';
  if (timedOut) return 'timeout';
  return 'stream_error';
}

/**
 * Eve's HTTP client is intentionally kept in the Node 22 web app as a small
 * protocol adapter. The Eve package itself stays in the Node 24 pilot, which
 * avoids mixing Eve's AI SDK v7 runtime into Jovie's AI SDK v6 stream path.
 */
export class EveAgentAdapter implements CoreChatHarness {
  constructor(private readonly timeoutMs = DEFAULT_TIMEOUT_MS) {}

  async runCoreChatTurn(
    input: CoreChatHarnessInput
  ): Promise<CoreChatHarnessResult> {
    if (env.EVE_CORE_CHAT_MODE !== 'shadow') {
      return makeCoreChatResult(input, {
        status: 'disabled',
        reason: 'feature_disabled',
      });
    }

    if (input.signal.aborted) {
      return makeCoreChatResult(input, {
        status: 'fallback',
        reason: 'aborted',
      });
    }

    const endpointResolution = resolveEndpoint();
    if ('reason' in endpointResolution) {
      return makeCoreChatResult(input, {
        status: 'fallback',
        reason: endpointResolution.reason,
      });
    }

    const startedAt = Date.now();
    let timedOut = false;
    const controller = new AbortController();
    const abortFromInput = () => controller.abort(input.signal.reason);
    const timeoutId = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, this.timeoutMs);

    if (input.signal.aborted) {
      abortFromInput();
    } else {
      input.signal.addEventListener('abort', abortFromInput, { once: true });
    }

    try {
      const result = await withTimeout(
        this.invokeEve(input, endpointResolution.endpoint, controller.signal),
        {
          timeoutMs: this.timeoutMs,
          context: 'Eve core-chat shadow turn',
        }
      );
      return {
        trace: {
          ...result.trace,
          durationMs: Date.now() - startedAt,
        },
      };
    } catch {
      const reason = errorReason(input, timedOut);
      logger.warn('[eve-core-chat] shadow invocation fell back', {
        requestId: input.requestId,
        reason,
      });
      return makeCoreChatResult(
        input,
        { status: 'fallback', reason },
        Date.now() - startedAt
      );
    } finally {
      clearTimeout(timeoutId);
      input.signal.removeEventListener('abort', abortFromInput);
    }
  }

  private async invokeEve(
    input: CoreChatHarnessInput,
    endpoint: URL,
    signal: AbortSignal
  ): Promise<CoreChatHarnessResult> {
    const sessionUrl = new URL('/eve/v1/session', endpoint);
    const sessionResponse = await boundedFetch(sessionUrl, {
      method: 'POST',
      headers: requestHeaders(),
      body: JSON.stringify({
        message: boundedUserMessage(input.userMessage),
        clientContext: {
          source: 'jovie-core-chat',
          protocolVersion: CORE_CHAT_PROTOCOL_VERSION,
          requestId: input.requestId,
          mode: input.mode,
          selectedModel: input.selectedModel,
          toolNames: boundedToolNames(input.toolNames),
          readOnly: true,
        },
      }),
      redirect: 'error',
      signal,
      timeoutMs: this.timeoutMs,
      context: 'Eve core-chat session creation',
    });

    if (!sessionResponse.ok) {
      return makeCoreChatResult(input, {
        status: 'fallback',
        reason: 'http_error',
      });
    }

    let sessionId: string | null = null;
    try {
      sessionId = parseSessionId(
        JSON.parse(
          await withTimeout(
            readBoundedResponseText(
              sessionResponse,
              MAX_SESSION_RESPONSE_BYTES,
              signal,
              'Eve core-chat session response'
            ),
            {
              timeoutMs: this.timeoutMs,
              context: 'Eve core-chat session response body',
            }
          )
        )
      );
    } catch (error) {
      if (error instanceof EveResponseLimitError) {
        return makeCoreChatResult(input, {
          status: 'fallback',
          reason: 'invalid_response',
        });
      }
      if (error instanceof SyntaxError) {
        sessionId = null;
      } else {
        throw error;
      }
    }
    if (!sessionId) {
      return makeCoreChatResult(input, {
        status: 'fallback',
        reason: 'invalid_response',
      });
    }

    const streamUrl = new URL(
      `/eve/v1/session/${encodeURIComponent(sessionId)}/stream`,
      endpoint
    );
    streamUrl.searchParams.set('startIndex', String(INITIAL_STREAM_INDEX));
    streamUrl.searchParams.set('follow', 'false');
    streamUrl.searchParams.set('includeTailIndex', '1');

    const streamResponse = await boundedFetch(streamUrl, {
      headers: streamHeaders(),
      redirect: 'error',
      signal,
      timeoutMs: this.timeoutMs,
      context: 'Eve core-chat session stream',
    });
    if (!streamResponse.ok) {
      return makeCoreChatResult(input, {
        status: 'fallback',
        reason: 'http_error',
        sessionId,
      });
    }

    let streamBody: string;
    try {
      streamBody = await withTimeout(
        readBoundedResponseText(
          streamResponse,
          MAX_STREAM_RESPONSE_BYTES,
          signal,
          'Eve core-chat session stream'
        ),
        {
          timeoutMs: this.timeoutMs,
          context: 'Eve core-chat session stream body',
        }
      );
    } catch (error) {
      if (error instanceof EveResponseLimitError) {
        return makeCoreChatResult(input, {
          status: 'fallback',
          reason: 'invalid_response',
          sessionId,
        });
      }
      throw error;
    }

    const parsed = parseEventTypes(streamBody);
    if (!parsed.valid) {
      return makeCoreChatResult(input, {
        status: 'fallback',
        reason: 'invalid_response',
        sessionId,
        eventTypes: parsed.eventTypes,
      });
    }

    if (parsed.hasFailed) {
      return makeCoreChatResult(input, {
        status: 'fallback',
        reason: 'agent_failed',
        sessionId,
        eventTypes: parsed.eventTypes,
      });
    }

    if (!parsed.hasCompleted) {
      return makeCoreChatResult(input, {
        status: 'fallback',
        reason: 'invalid_response',
        sessionId,
        eventTypes: parsed.eventTypes,
      });
    }

    return makeCoreChatResult(
      input,
      {
        status: 'invoked',
        available: true,
        reason: 'completed',
        sessionId,
        eventTypes: parsed.eventTypes,
      },
      0
    );
  }
}

export const defaultCoreChatHarness: CoreChatHarness = new EveAgentAdapter();
