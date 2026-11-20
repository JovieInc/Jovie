import type {
  SummerAck,
  SummerProgress,
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

const str = (value: unknown) => (typeof value === 'string' ? value : null);
const num = (value: unknown) =>
  typeof value === 'number' && Number.isFinite(value) ? value : null;

/** Copies a `done` frame into a typed ack; no ack unless the endpoint named its request, route and model. */
export function toAck(data: Record<string, unknown>): SummerAck | null {
  const requestId = str(data.requestId);
  const route = str(data.route);
  const model = str(data.model);
  if (!requestId || !route || !model) return null;
  return {
    requestId,
    route,
    model,
    ttftMs: num(data.ttftMs),
    totalMs: num(data.totalMs),
  };
}

/** Types an endpoint frame as progress. Unknown or malformed frames yield nothing: no invention. */
export function toProgress(frame: Frame): SummerProgress | null {
  const d = frame.data;
  switch (frame.event) {
    case 'meta': {
      const requestId = str(d.requestId);
      const route = str(d.route);
      const model = str(d.model);
      return requestId && route && model
        ? { kind: 'meta', requestId, route, model }
        : null;
    }
    case 'tool': {
      const name = str(d.name);
      const phase = d.phase;
      return name &&
        (phase === 'start' || phase === 'done' || phase === 'error')
        ? { kind: 'tool', name, phase, ms: num(d.ms) }
        : null;
    }
    case 'status': {
      const phase = str(d.phase);
      return phase
        ? { kind: 'status', phase, model: str(d.model), text: str(d.text) }
        : null;
    }
    case 'plan': {
      const planId = str(d.planId);
      const model = str(d.model);
      const summary = str(d.summary);
      return planId && model && summary !== null
        ? { kind: 'plan', planId, path: str(d.path), model, summary }
        : null;
    }
    default:
      return null;
  }
}

export async function* parseSseFrames(
  body: ReadableStream<Uint8Array>
): AsyncGenerator<Frame> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let finished = false;
  let skipLf = false;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      finished = done;
      // CR terminates a line immediately; swallow its optional LF even across
      // empty chunks, without delaying a complete lone-CR frame.
      for (const char of decoder.decode(value, { stream: !done })) {
        if (skipLf) {
          skipLf = false;
          if (char === '\n') continue;
        }
        if (char === '\r') {
          buffer += '\n';
          skipLf = true;
        } else buffer += char;
      }
      let index = buffer.indexOf('\n\n');
      while (index >= 0) {
        const block = buffer.slice(0, index);
        buffer = buffer.slice(index + 2);
        const frame = parseBlock(block);
        if (frame) yield frame;
        index = buffer.indexOf('\n\n');
      }
      if (done) {
        const frame = parseBlock(buffer);
        if (frame) yield frame;
        break;
      }
    }
  } finally {
    if (!finished) void reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
}

function parseBlock(block: string): Frame | null {
  let event = '';
  const data: string[] = [];
  for (const line of block.split('\n')) {
    if (line.startsWith('event:')) event = line.slice(6).trim();
    else if (line.startsWith('data:'))
      data.push(line.slice(5).replace(/^ /, ''));
  }
  if (!event) return null;
  const malformed = event === 'error' ? { event, data: {} } : null;
  try {
    const payload: unknown = JSON.parse(data.join('\n') || '{}');
    if (!payload || typeof payload !== 'object' || Array.isArray(payload))
      return malformed;
    return { event, data: payload as Record<string, unknown> };
  } catch {
    return malformed;
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
      let failed = false;
      let ack: SummerAck | null = null;
      for await (const frame of parseSseFrames(response.body)) {
        if (frame.event === 'delta' && typeof frame.data.text === 'string') {
          sawText = true;
          yield { type: 'text-delta', text: frame.data.text };
        } else if (frame.event === 'error') {
          failed = true;
          break;
        } else if (frame.event === 'done') {
          ack = toAck(frame.data);
        } else {
          const progress = toProgress(frame);
          if (progress) yield { type: 'progress', progress };
        }
      }
      if (!sawText) {
        // Nothing shown (error or an empty stream): the durable path can still answer.
        yield* input.eve.speak(turn);
        return;
      }
      // Shown text without the endpoint's terminal ack is a truncated stream: say so,
      // never present it as a completed answer.
      if (failed || !ack) {
        yield { type: 'error', state: 'failure' };
        return;
      }
      // The ack is the endpoint's own terminal event, forwarded only after text was shown.
      yield { type: 'ack', ack };
    },
  };
}
