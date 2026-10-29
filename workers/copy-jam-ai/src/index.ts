/**
 * Copy Jam AI relay. The Jovie app posts a voice memo here and gets a
 * transcript back; it posts leftover spoken segments and gets verdicts back.
 * Workers AI only (no consumer subscriptions). Bearer-gated.
 */
interface AiBinding {
  run(model: string, input: Record<string, unknown>): Promise<unknown>;
}
interface Env {
  AI: AiBinding;
  COPY_JAM_AI_SECRET?: string;
}

export const WHISPER_MODEL = '@cf/openai/whisper-large-v3-turbo';
export const CLASSIFY_MODEL = '@cf/meta/llama-3.1-8b-instruct-fast';
const MAX_AUDIO_BYTES = 10 * 1024 * 1024;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json',
      'cache-control': 'no-store',
    },
  });
}

function sameSecret(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1)
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export function toBase64(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(s);
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const secret = env.COPY_JAM_AI_SECRET;
    const given =
      request.headers.get('authorization')?.replace(/^Bearer /, '') ?? '';
    if (!secret || !sameSecret(given, secret))
      return json({ error: 'unauthorized' }, 401);
    if (request.method !== 'POST') return json({ error: 'method' }, 405);
    const path = new URL(request.url).pathname;

    if (path === '/transcribe') {
      const audio = new Uint8Array(await request.arrayBuffer());
      if (audio.length === 0 || audio.length > MAX_AUDIO_BYTES) {
        return json({ error: 'audio_size' }, 413);
      }
      const out = (await env.AI.run(WHISPER_MODEL, {
        audio: toBase64(audio),
      })) as { text?: string };
      return json({ text: (out.text ?? '').trim(), model: WHISPER_MODEL });
    }

    if (path === '/classify') {
      const body = (await request.json().catch(() => null)) as {
        segments?: Array<{ segment: string; copyIds: string[] }>;
      } | null;
      const segments = body?.segments?.slice(0, 20);
      if (!segments?.length) return json({ error: 'segments' }, 400);
      const prompt = segments
        .map(
          (s, i) =>
            `${i + 1}. IDs ${s.copyIds.join(', ')}: "${s.segment.slice(0, 400)}"`
        )
        .join('\n');
      const out = (await env.AI.run(CLASSIFY_MODEL, {
        messages: [
          {
            role: 'system',
            content:
              'You read a founder reviewing website copy out loud. For each numbered segment decide the verdict on the copy: "sucks", "meh", "great", or "unclear" when the segment gives no opinion. Put any specific instruction (shorter, plainer, warmer) in "note", at most 12 words. Reply with JSON only: [{"n":1,"verdict":"...","note":"..."}]',
          },
          { role: 'user', content: prompt },
        ],
        max_tokens: 400,
      })) as { response?: unknown };
      // Workers AI may hand back parsed JSON or a string; accept both.
      let results: unknown = [];
      if (Array.isArray(out.response)) {
        results = out.response;
      } else if (typeof out.response === 'string') {
        const match = /\[[\s\S]*\]/.exec(out.response);
        try {
          results = match ? JSON.parse(match[0]) : [];
        } catch {
          results = [];
        }
      }
      return json({ results, model: CLASSIFY_MODEL });
    }

    return json({ error: 'not_found' }, 404);
  },
};
