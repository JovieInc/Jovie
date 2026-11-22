/**
 * ASS-86 live `/app/chat` TTFT probe via the Workers AI relay harness.
 *
 * Measures request-start → first streamed content delta against the chat
 * flash twin (Workers AI credits; no Gateway, no prod DB writes). Soft-skips
 * when the relay cannot answer safely.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildRecordedChatFirstTokenSample,
  buildUnrunChatFirstTokenSample,
  type ChatFirstTokenSample,
} from './chat-first-token-sample';

const ROUTING = JSON.parse(
  readFileSync(
    join(dirname(fileURLToPath(import.meta.url)), '../ai/routing.json'),
    'utf8'
  )
) as { providers: { 'workers-ai': { relayBaseUrl: string } } };

/** Same relay base as production Workers AI (`lib/ai/workers-ai.ts`). */
export const CHAT_TTFT_RELAY_BASE_URL: string =
  ROUTING.providers['workers-ai'].relayBaseUrl;

/**
 * Flash twin of `jovie-web.chat` glm-5.3-flash (JOV-13141). Latency probe uses
 * the cheap path; Gateway is never contacted.
 */
export const CHAT_TTFT_PROBE_MODEL =
  '@cf/deepseek-ai/deepseek-v4.1-flash-1017' as const;

export const CHAT_TTFT_PROBE_SAMPLE_COUNT = 3 as const;
export const CHAT_TTFT_PROBE_TIMEOUT_MS = 30_000 as const;
export const CHAT_TTFT_PROBE_MAX_TOKENS = 8 as const;

export type ChatTtftProbeDeps = {
  readonly token: string;
  readonly baseUrl?: string;
  readonly model?: string;
  readonly sampleCount?: number;
  readonly timeoutMs?: number;
  readonly fetchImpl?: typeof fetch;
  readonly now?: () => number;
  readonly recordedAt?: string;
};

export type ChatTtftProbeOutcome =
  | { readonly ok: true; readonly sample: ChatFirstTokenSample }
  | { readonly ok: false; readonly sample: ChatFirstTokenSample };

function completionsUrl(baseUrl: string): string {
  return `${baseUrl.replace(/\/+$/u, '')}/chat/completions`;
}

/** First non-empty `choices[0].delta.content` in an OpenAI SSE body. */
export async function measureStreamTtftMs(input: {
  readonly response: Response;
  readonly startedAt: number;
  readonly now: () => number;
}): Promise<number | null> {
  const body = input.response.body;
  if (!body) return null;
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      const parts = buf.split('\n');
      buf = parts.pop() ?? '';
      for (const line of parts) {
        const trimmed = line.trim();
        if (!trimmed.startsWith('data:')) continue;
        const payload = trimmed.slice(5).trim();
        if (!payload || payload === '[DONE]') continue;
        try {
          const json = JSON.parse(payload) as {
            choices?: { delta?: { content?: unknown } }[];
          };
          const content = json.choices?.[0]?.delta?.content;
          if (typeof content === 'string' && content.length > 0) {
            return Math.max(0, input.now() - input.startedAt);
          }
        } catch {
          // Ignore malformed frames; keep reading for the first content delta.
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
  return null;
}

export async function probeOneChatFirstTokenMs(
  deps: ChatTtftProbeDeps
): Promise<{ readonly ms: number } | { readonly error: string }> {
  const token = deps.token.trim();
  if (!token) return { error: 'WORKERS_AI_TOKEN empty' };
  const baseUrl = (deps.baseUrl?.trim() || CHAT_TTFT_RELAY_BASE_URL).replace(
    /\/+$/u,
    ''
  );
  const model = deps.model ?? CHAT_TTFT_PROBE_MODEL;
  const fetchImpl = deps.fetchImpl ?? fetch;
  const now = deps.now ?? Date.now;
  const startedAt = now();
  try {
    const response = await fetchImpl(completionsUrl(baseUrl), {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        model,
        stream: true,
        max_tokens: CHAT_TTFT_PROBE_MAX_TOKENS,
        temperature: 0,
        messages: [
          {
            role: 'user',
            content: 'Reply with the single word pong.',
          },
        ],
      }),
      signal: AbortSignal.timeout(deps.timeoutMs ?? CHAT_TTFT_PROBE_TIMEOUT_MS),
    });
    if (!response.ok) {
      void response.body?.cancel().catch(() => undefined);
      return { error: `workers-ai ${response.status}` };
    }
    const ms = await measureStreamTtftMs({
      response,
      startedAt,
      now,
    });
    if (ms === null) return { error: 'no_first_token' };
    return { ms };
  } catch (error) {
    const name =
      error instanceof Error || error instanceof DOMException
        ? error.name || 'fetch_failed'
        : 'fetch_failed';
    return { error: name };
  }
}

/**
 * Run N streaming probes. Soft-skips (unrun) when any sample fails so CI never
 * invents latency or fails closed on a flaky relay.
 */
export async function runLiveChatFirstTokenProbe(
  deps: ChatTtftProbeDeps
): Promise<ChatTtftProbeOutcome> {
  const count = deps.sampleCount ?? CHAT_TTFT_PROBE_SAMPLE_COUNT;
  const samplesMs: number[] = [];
  for (let i = 0; i < count; i += 1) {
    const one = await probeOneChatFirstTokenMs(deps);
    if ('error' in one) {
      return {
        ok: false,
        sample: buildUnrunChatFirstTokenSample(
          `Live TTFT probe soft-skip (${one.error}); test account harness only.`
        ),
      };
    }
    samplesMs.push(one.ms);
  }
  return {
    ok: true,
    sample: buildRecordedChatFirstTokenSample({
      samplesMs,
      mode: 'live',
      recordedAt: deps.recordedAt,
      notes:
        'Live Workers AI relay stream TTFT for /app/chat harness (test account; no Gateway; no prod writes).',
    }),
  };
}
