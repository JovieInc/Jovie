// OpenAI-compatible /v1/chat/completions backed by the Workers AI binding, so
// Jovie's model calls draw on Workers AI (Cloudflare startup credits) with no
// Cloudflare API token anywhere. One shared bearer secret, a model allowlist
// and a rate limit. Same relay shape as Summer's summer-workers-ai worker.

export const ALLOWED_MODELS: ReadonlySet<string> = new Set([
  '@cf/zai-org/glm-5.3-flash',
  '@cf/zai-org/glm-5.3',
]);
const MAX_BODY_BYTES = 8 * 1024 * 1024;
const MAX_OUTPUT_TOKENS = 16384;

export interface Env {
  readonly AI: {
    run(model: string, input: unknown, options?: unknown): Promise<unknown>;
  };
  readonly LIMITER?: {
    limit(o: { key: string }): Promise<{ success: boolean }>;
  };
  readonly WORKERS_AI_BEARER?: string;
}

const json = (
  body: unknown,
  status = 200,
  headers: Record<string, string> = {}
): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  });
const err = (
  status: number,
  message: string,
  headers?: Record<string, string>
): Response =>
  json({ error: { message, type: 'invalid_request_error' } }, status, headers);

async function digest(value: string): Promise<Uint8Array> {
  return new Uint8Array(
    await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
  );
}
export async function safeEqual(a: string, b: string): Promise<boolean> {
  const [x, y] = await Promise.all([digest(a), digest(b)]);
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x[i] ^ y[i];
  return diff === 0;
}

export async function authorized(request: Request, env: Env): Promise<boolean> {
  const match = /^Bearer (.+)$/.exec(
    request.headers.get('authorization') ?? ''
  );
  if (!match || !env.WORKERS_AI_BEARER) return false;
  return safeEqual(match[1], env.WORKERS_AI_BEARER);
}

// Workers AI streams per-chunk usage deltas and ends with a non-OpenAI
// `{response, usage}` frame. OpenAI clients take the last usage as the total, so
// drop the deltas and emit that final frame as a standard usage-only chunk.
export function normalizeFrame(frame: string, model: string): string {
  if (!frame.startsWith('data: ') || frame === 'data: [DONE]') return frame;
  try {
    const obj = JSON.parse(frame.slice(6));
    if (!Array.isArray(obj.choices)) {
      const {
        prompt_tokens = 0,
        completion_tokens = 0,
        total_tokens = 0,
        prompt_tokens_details,
      } = obj.usage ?? {};
      return (
        'data: ' +
        JSON.stringify({
          id: 'chatcmpl-wai',
          object: 'chat.completion.chunk',
          model,
          choices: [],
          usage: {
            prompt_tokens,
            completion_tokens,
            total_tokens,
            prompt_tokens_details,
          },
        })
      );
    }
    if (obj.choices.length === 0) return '';
    delete obj.usage;
    delete obj.p;
    return 'data: ' + JSON.stringify(obj);
  } catch {
    return frame;
  }
}

export function normalizeSse(
  model: string
): TransformStream<Uint8Array, Uint8Array> {
  const decoder = new TextDecoder(),
    encoder = new TextEncoder();
  let buffer = '';
  const emit = (
    controller: TransformStreamDefaultController<Uint8Array>,
    frames: string[]
  ) => {
    for (const f of frames) {
      const out = normalizeFrame(f.trim(), model);
      if (out) controller.enqueue(encoder.encode(out + '\n\n'));
    }
  };
  return new TransformStream({
    transform(chunk, controller) {
      buffer += decoder.decode(chunk, { stream: true });
      const frames = buffer.split('\n\n');
      buffer = frames.pop() ?? '';
      emit(controller, frames);
    },
    flush(controller) {
      if (buffer.trim()) emit(controller, [buffer]);
    },
  });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const { pathname } = new URL(request.url);
    if (pathname === '/health') return json({ ok: true });
    if (!(await authorized(request, env))) return err(401, 'unauthorized');
    if (pathname === '/v1/models' && request.method === 'GET')
      return json({
        object: 'list',
        data: [...ALLOWED_MODELS].map(id => ({ id, object: 'model' })),
      });
    if (pathname !== '/v1/chat/completions') return err(404, 'not found');
    if (request.method !== 'POST') return err(405, 'method not allowed');
    if (env.LIMITER && !(await env.LIMITER.limit({ key: 'jovie' })).success)
      return err(429, 'rate limited', { 'retry-after': '10' });
    const length = Number(request.headers.get('content-length') ?? 0);
    if (length > MAX_BODY_BYTES) return err(413, 'request too large');

    let body: Record<string, unknown>;
    try {
      const text = await request.text();
      if (text.length > MAX_BODY_BYTES) return err(413, 'request too large');
      body = JSON.parse(text);
    } catch {
      return err(400, 'invalid json');
    }
    if (typeof body !== 'object' || body === null || Array.isArray(body))
      return err(400, 'invalid body');
    if (typeof body.model !== 'string' || !ALLOWED_MODELS.has(body.model))
      return err(400, 'model not allowed');
    if (!Array.isArray(body.messages) || body.messages.length === 0)
      return err(400, 'messages required');

    const requested = Number(
      body.max_completion_tokens ?? body.max_tokens ?? MAX_OUTPUT_TOKENS
    );
    const maxTokens = Math.min(
      Number.isFinite(requested) && requested > 0
        ? requested
        : MAX_OUTPUT_TOKENS,
      MAX_OUTPUT_TOKENS
    );
    const { model, max_tokens: _a, max_completion_tokens: _b, ...rest } = body;
    const input = { ...rest, max_tokens: maxTokens };
    if (input.stream === true)
      input.stream_options = {
        include_usage: true,
        ...(input.stream_options as object | undefined),
      };

    try {
      const result = await env.AI.run(model as string, input);
      if (result instanceof ReadableStream)
        return new Response(result.pipeThrough(normalizeSse(model as string)), {
          headers: {
            'content-type': 'text/event-stream',
            'cache-control': 'no-store',
          },
        });
      return json(result);
    } catch (e) {
      const message = e instanceof Error ? e.message : 'upstream error';
      const status = /rate|capacity|429/i.test(message)
        ? 429
        : /not.?found|no such model/i.test(message)
          ? 404
          : 502;
      return err(status, message.slice(0, 300));
    }
  },
};
