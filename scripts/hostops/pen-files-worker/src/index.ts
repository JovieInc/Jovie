/**
 * Read-only GET for one R2 object. The object key is the Worker secret
 * OBJECT_KEY; the request path must equal it exactly, everything else is 404.
 * The bucket is not public, so this Worker is the only way in.
 */
export interface Env {
  PEN_FILES: {
    get(key: string): Promise<{
      body: ReadableStream;
      size: number;
      httpEtag: string;
    } | null>;
  };
  OBJECT_KEY?: string;
}

const NOT_FOUND = () => new Response('not found', { status: 404 });

function sameKey(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method !== 'GET' && request.method !== 'HEAD')
      return NOT_FOUND();
    const key = env.OBJECT_KEY;
    if (!key) return NOT_FOUND();
    let path: string;
    try {
      path = decodeURIComponent(new URL(request.url).pathname.slice(1));
    } catch {
      return NOT_FOUND();
    }
    if (!sameKey(path, key)) return NOT_FOUND();
    const object = await env.PEN_FILES.get(key);
    if (!object) return NOT_FOUND();
    return new Response(request.method === 'HEAD' ? null : object.body, {
      headers: {
        'content-type': 'application/gzip',
        'content-length': String(object.size),
        etag: object.httpEtag,
        'cache-control': 'private, no-store',
      },
    });
  },
};
