import type {
  SummerSpeakEvent,
  SummerSpeaker,
  SummerSpeakInput,
} from '@/lib/ovie/summer-transport';

/**
 * Fast interactive Summer speaker (Tim, 2026-10-25): text turns stream from
 * Summer's `/ovie/v1/summer-chat/stream` (cheap model, read-only tools,
 * strategic planning deferred to Kimi K3.1 Pro on Summer's side) instead of
 * the durable Eve conversation (measured p50 37 s / p95 123 s per turn).
 *
 * Routing:
 * - Turns that ask Summer to DO durable work (change, create, approve, spend,
 *   deploy...) stay on the Eve speaker; the fast path is read-only.
 * - If the fast endpoint is unreachable or not deployed (any non-2xx before the
 *   first delta) the turn falls back to Eve. Both are Summer; there is never a
 *   fallback to the artist agent.
 * - `OVIE_SUMMER_FAST_CHAT=0` is the kill switch.
 */

export type FastChatFetch = (
  body: {
    message: string;
    mode: 'text' | 'voice';
    history: { role: 'user' | 'assistant'; text: string }[];
  },
  signal?: AbortSignal
) => Promise<Response>;

const DURABLE_WORK =
  /^\s*(?:(?:please|pls)\s+)?(?:(?:can|could|would)\s+you\s+)?(?:go\s+)?(?:create|file|open|close|transition|move|assign|approve|reject|merge|deploy|revert|rollback|retry|rerun|re-run|pause|resume|enable|disable|set|change|update|delete|remove|cancel|send|post|dispatch|spend|pay|buy|release)\b(?!\s+(?:me|us)\b)/i;

export function needsDurableWork(text: string): boolean {
  return DURABLE_WORK.test(text);
}

export function fastChatEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.OVIE_SUMMER_FAST_CHAT !== '0';
}

type Frame = { event: string; data: Record<string, unknown> };

export async function* parseSseFrames(
  body: ReadableStream<Uint8Array>
): AsyncGenerator<Frame> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let index = buffer.indexOf('\n\n');
      while (index >= 0) {
        const block = buffer.slice(0, index);
        buffer = buffer.slice(index + 2);
        const frame = parseBlock(block);
        if (frame) yield frame;
        index = buffer.indexOf('\n\n');
      }
    }
  } finally {
    reader.releaseLock();
  }
}

function parseBlock(block: string): Frame | null {
  let event = '';
  let data = '';
  for (const line of block.split('\n')) {
    if (line.startsWith('event: ')) event = line.slice(7).trim();
    else if (line.startsWith('data: ')) data += line.slice(6);
  }
  if (!event) return null;
  try {
    return { event, data: JSON.parse(data || '{}') as Record<string, unknown> };
  } catch {
    return null;
  }
}

const HISTORY_TURNS = 20;
const TEXT_MAX = 4000;

export function createFallbackSummerSpeaker(input: {
  readonly eve: SummerSpeaker;
  readonly fetchChat: FastChatFetch;
  readonly enabled?: () => boolean;
}): SummerSpeaker {
  const enabled = input.enabled ?? fastChatEnabled;
  return {
    id: 'summer',
    runtime: input.eve.runtime,
    async *speak(turn: SummerSpeakInput): AsyncGenerator<SummerSpeakEvent> {
      if (!enabled() || needsDurableWork(turn.userText)) {
        yield* input.eve.speak(turn);
        return;
      }
      let response: Response | null = null;
      try {
        response = await input.fetchChat(
          {
            message: turn.userText.slice(0, TEXT_MAX),
            mode: 'text',
            history: turn.history.slice(-HISTORY_TURNS).map(item => ({
              role: item.role,
              text: item.text.slice(0, TEXT_MAX),
            })),
          },
          turn.signal
        );
      } catch {
        response = null;
      }
      if (!response || !response.ok || !response.body) {
        yield* input.eve.speak(turn);
        return;
      }
      let sawText = false;
      for await (const frame of parseSseFrames(response.body)) {
        if (frame.event === 'delta' && typeof frame.data.text === 'string') {
          sawText = true;
          yield { type: 'text-delta', text: frame.data.text };
        } else if (frame.event === 'error') {
          if (!sawText) {
            // Nothing shown yet: the durable path can still answer.
            yield* input.eve.speak(turn);
            return;
          }
          yield { type: 'error', state: 'failure' };
          return;
        }
      }
    },
  };
}
