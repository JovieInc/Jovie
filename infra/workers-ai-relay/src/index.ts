// OpenAI-compatible /v1/chat/completions and /v1/embeddings backed by the Workers AI binding, so
// Jovie's model calls draw on Workers AI (Cloudflare startup credits) with no
// Cloudflare API token anywhere. One shared bearer secret, a model allowlist
// and a rate limit. Same relay shape as Summer's summer-workers-ai worker.

export const ALLOWED_MODELS: ReadonlySet<string> = new Set([
  '@cf/zai-org/glm-5.3-flash',
  '@cf/zai-org/glm-5.3',
]);
// Embeddings (gbrain + any OpenAI-compatible /v1/embeddings client). bge-m3:
// 1024 dims, 8k-token inputs, no query/document prefixes.
export const EMBEDDING_MODELS: ReadonlyMap<string, number> = new Map([
  ['@cf/baai/bge-m3', 1024],
]);
const EMBED_BATCH = 100; // Workers AI maxItems per run
// Workers AI caps the summed estimated tokens of one run (~60k for bge-m3,
// estimate ~chars/4). Pack sub-batches well under it; bisect on 5021 anyway.
const EMBED_BATCH_CHARS = 120_000;
const MAX_EMBED_INPUTS = 512;
const MAX_BODY_BYTES = 8 * 1024 * 1024;
const MAX_OUTPUT_TOKENS = 16384;

export interface Env {
  readonly AI: {
    run(model: string, input: unknown, options?: unknown): Promise<unknown>;
  };
  readonly LIMITER?: {
    limit(o: { key: string }): Promise<{ success: boolean }>;
  };
  readonly EMBED_LIMITER?: {
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

function toBase64(vec: number[]): string {
  const bytes = new Uint8Array(new Float32Array(vec).buffer);
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

function upstreamError(e: unknown): Response {
  const message = e instanceof Error ? e.message : 'upstream error';
  const status = /rate|capacity|429/i.test(message)
    ? 429
    : /not.?found|no such model/i.test(message)
      ? 404
      : 502;
  return err(status, message.slice(0, 300));
}

export async function embeddings(
  body: Record<string, unknown>,
  env: Env
): Promise<Response> {
  const model = body.model;
  const dims =
    typeof model === 'string' ? EMBEDDING_MODELS.get(model) : undefined;
  if (!dims) return err(400, 'model not allowed');
  if (body.dimensions !== undefined && Number(body.dimensions) !== dims)
    return err(400, `dimensions must be ${dims}`);
  const raw = typeof body.input === 'string' ? [body.input] : body.input;
  if (
    !Array.isArray(raw) ||
    raw.length === 0 ||
    raw.some(t => typeof t !== 'string')
  )
    return err(400, 'input must be a string or array of strings');
  if (raw.length > MAX_EMBED_INPUTS)
    return err(400, `at most ${MAX_EMBED_INPUTS} inputs`);
  // Workers AI rejects empty strings; a single space embeds as "nothing".
  const texts = (raw as string[]).map(t => (t.trim() === '' ? ' ' : t));
  const base64 = body.encoding_format === 'base64';
  const run = async (batch: string[]): Promise<number[][]> => {
    try {
      const out = (await env.AI.run(model as string, {
        text: batch,
        truncate_inputs: true,
      })) as { data?: number[][] };
      if (!Array.isArray(out?.data) || out.data.length !== batch.length)
        throw new Error('upstream returned no embeddings');
      return out.data;
    } catch (e) {
      const msg = e instanceof Error ? e.message : '';
      if (batch.length > 1 && /5021|context window/i.test(msg)) {
        const mid = Math.ceil(batch.length / 2);
        return [
          ...(await run(batch.slice(0, mid))),
          ...(await run(batch.slice(mid))),
        ];
      }
      throw e;
    }
  };
  const batches: string[][] = [];
  let cur: string[] = [];
  let curChars = 0;
  for (const t of texts) {
    if (
      cur.length &&
      (cur.length >= EMBED_BATCH || curChars + t.length > EMBED_BATCH_CHARS)
    ) {
      batches.push(cur);
      cur = [];
      curChars = 0;
    }
    cur.push(t);
    curChars += t.length;
  }
  if (cur.length) batches.push(cur);
  const vectors: number[][] = [];
  try {
    for (const b of batches) vectors.push(...(await run(b)));
  } catch (e) {
    return upstreamError(e);
  }
  if (vectors.length !== texts.length)
    return err(502, 'upstream embedding count mismatch');
  const chars = texts.reduce((n, t) => n + t.length, 0);
  const tokens = Math.ceil(chars / 4);
  return json({
    object: 'list',
    model,
    data: vectors.map((v, index) => ({
      object: 'embedding',
      index,
      embedding: base64 ? toBase64(v) : v,
    })),
    usage: { prompt_tokens: tokens, total_tokens: tokens },
  });
}

async function readJson(
  request: Request
): Promise<Record<string, unknown> | Response> {
  const length = Number(request.headers.get('content-length') ?? 0);
  if (length > MAX_BODY_BYTES) return err(413, 'request too large');
  let body: unknown;
  try {
    const text = await request.text();
    if (text.length > MAX_BODY_BYTES) return err(413, 'request too large');
    body = JSON.parse(text);
  } catch {
    return err(400, 'invalid json');
  }
  if (typeof body !== 'object' || body === null || Array.isArray(body))
    return err(400, 'invalid body');
  return body as Record<string, unknown>;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const { pathname } = new URL(request.url);
    if (pathname === '/health') return json({ ok: true });
    if (!(await authorized(request, env))) return err(401, 'unauthorized');
    if (pathname === '/v1/models' && request.method === 'GET')
      return json({
        object: 'list',
        data: [...ALLOWED_MODELS, ...EMBEDDING_MODELS.keys()].map(id => ({
          id,
          object: 'model',
        })),
      });
    if (pathname === '/v1/embeddings') {
      if (request.method !== 'POST') return err(405, 'method not allowed');
      // Own bucket so a bulk re-embed can never starve chat traffic.
      const limiter = env.EMBED_LIMITER ?? env.LIMITER;
      if (limiter && !(await limiter.limit({ key: 'embed' })).success)
        return err(429, 'rate limited', { 'retry-after': '10' });
      const parsed = await readJson(request);
      if (parsed instanceof Response) return parsed;
      return embeddings(parsed, env);
    }
    if (pathname !== '/v1/chat/completions') return err(404, 'not found');
    if (request.method !== 'POST') return err(405, 'method not allowed');
    if (env.LIMITER && !(await env.LIMITER.limit({ key: 'jovie' })).success)
      return err(429, 'rate limited', { 'retry-after': '10' });
    const parsed = await readJson(request);
    if (parsed instanceof Response) return parsed;
    const body = parsed;
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
      return upstreamError(e);
    }
  },
};
