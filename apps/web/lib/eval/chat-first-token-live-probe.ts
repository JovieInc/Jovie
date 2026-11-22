/**
 * ASS-86/ASS-94 live `/app/chat` TTFT probe via the Workers AI relay harness.
 *
 * Measures request-start → first streamed content delta against the chat
 * flash twin (Workers AI credits; no Gateway, no prod DB writes). Soft-skips
 * when the relay cannot answer safely.
 *
 * DeepSeek V4.1 Flash reasons at `high` by default (Workers AI changelog
 * 2026-10-19). ASS-86 used `max_tokens: 8` with no `reasoning_effort`, so the
 * stream finished on reasoning-only deltas and CI soft-skipped `no_first_token`
 * (run 44969069645). Probe turns reasoning off and leaves headroom for content.
 */
import { AI_ROUTING } from '@/lib/ai/routing';
import {
  buildRecordedChatFirstTokenSample,
  buildUnrunChatFirstTokenSample,
  type ChatFirstTokenSample,
} from './chat-first-token-sample';

/** Same relay base as production Workers AI (`lib/ai/workers-ai.ts`). */
export const CHAT_TTFT_RELAY_BASE_URL: string =
  AI_ROUTING.providers['workers-ai'].relayBaseUrl;

/**
 * Flash twin of `jovie-web.chat` glm-5.3-flash (JOV-13141). Latency probe uses
 * the cheap path; Gateway is never contacted.
 */
export const CHAT_TTFT_PROBE_MODEL =
  '@cf/deepseek-ai/deepseek-v4.1-flash-1017' as const;

export const CHAT_TTFT_PROBE_SAMPLE_COUNT = 3 as const;
export const CHAT_TTFT_PROBE_TIMEOUT_MS = 30_000 as const;
/** Enough for a one-word reply after any residual preamble; not a budget sink. */
export const CHAT_TTFT_PROBE_MAX_TOKENS = 64 as const;
/**
 * Workers AI DeepSeek default is `high` reasoning. Latency probe measures first
 * visible content token, so disable reasoning (supported: max|high|low|none).
 */
export const CHAT_TTFT_PROBE_REASONING_EFFORT = 'none' as const;

export type ChatTtftProbeDeps = {
  readonly token: string;
  readonly baseUrl?: string;
  readonly model?: string;
  readonly sampleCount?: number;
  readonly timeoutMs?: number;
  readonly maxTokens?: number;
  readonly reasoningEffort?: string;
  readonly fetchImpl?: typeof fetch;
  readonly now?: () => number;
  readonly recordedAt?: string;
};

export type ChatTtftProbeOutcome =
  | { readonly ok: true; readonly sample: ChatFirstTokenSample }
  | { readonly ok: false; readonly sample: ChatFirstTokenSample };

export type MeasureStreamTtftResult =
  | { readonly ms: number }
  | {
      readonly ms: null;
      readonly reason: 'no_body' | 'no_first_token' | 'reasoning_only';
    };

function completionsUrl(baseUrl: string): string {
  return `${baseUrl.replace(/\/+$/u, '')}/chat/completions`;
}

/** Non-empty text from an OpenAI-style delta.content (string or text parts). */
export function deltaContentText(content: unknown): string | null {
  if (typeof content === 'string' && content.length > 0) return content;
  if (!Array.isArray(content)) return null;
  let out = '';
  for (const part of content) {
    if (typeof part === 'string') {
      out += part;
      continue;
    }
    if (
      typeof part === 'object' &&
      part !== null &&
      'text' in part &&
      typeof (part as { text: unknown }).text === 'string'
    ) {
      out += (part as { text: string }).text;
    }
  }
  return out.length > 0 ? out : null;
}

function deltaHasReasoning(delta: unknown): boolean {
  if (typeof delta !== 'object' || delta === null) return false;
  const reasoning = (delta as { reasoning_content?: unknown })
    .reasoning_content;
  return typeof reasoning === 'string' && reasoning.length > 0;
}

/** First non-empty `choices[0].delta.content` in an OpenAI SSE body. */
export async function measureStreamTtftMs(input: {
  readonly response: Response;
  readonly startedAt: number;
  readonly now: () => number;
}): Promise<MeasureStreamTtftResult> {
  const body = input.response.body;
  if (!body) return { ms: null, reason: 'no_body' };
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  let sawReasoning = false;
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
            choices?: { delta?: unknown }[];
          };
          const delta = json.choices?.[0]?.delta;
          if (deltaHasReasoning(delta)) sawReasoning = true;
          const content =
            typeof delta === 'object' && delta !== null
              ? (delta as { content?: unknown }).content
              : undefined;
          if (deltaContentText(content) !== null) {
            return { ms: Math.max(0, input.now() - input.startedAt) };
          }
        } catch {
          // Ignore malformed frames; keep reading for the first content delta.
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
  return {
    ms: null,
    reason: sawReasoning ? 'reasoning_only' : 'no_first_token',
  };
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
        max_tokens: deps.maxTokens ?? CHAT_TTFT_PROBE_MAX_TOKENS,
        temperature: 0,
        reasoning_effort:
          deps.reasoningEffort ?? CHAT_TTFT_PROBE_REASONING_EFFORT,
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
    const measured = await measureStreamTtftMs({
      response,
      startedAt,
      now,
    });
    if (measured.ms === null) return { error: measured.reason };
    return { ms: measured.ms };
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
