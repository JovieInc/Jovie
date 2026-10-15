import { IngestError, publicUrl, record } from './source.ts';

export interface Runtime {
  fetch: typeof globalThis.fetch;
  sleep: (ms: number) => Promise<void>;
  now: () => number;
}

export const runtime: Runtime = {
  fetch: (...args) => globalThis.fetch(...args),
  sleep: ms => new Promise(resolve => setTimeout(resolve, ms)),
  now: Date.now,
};

/** Bound the decoded body too: Content-Length can describe compressed bytes. */
async function readBody(response: Response, maxBytes: number): Promise<string> {
  if (!response.body) return '';
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let bytes = 0;
  let body = '';
  try {
    for (;;) {
      const next = await reader.read();
      if (next.done) return body + decoder.decode();
      bytes += next.value.byteLength;
      if (bytes > maxBytes) throw new IngestError('response_too_large');
      body += decoder.decode(next.value, { stream: true });
    }
  } finally {
    void reader.cancel().catch(() => {});
  }
}

export async function requestText(
  rt: Runtime,
  url: string,
  init: RequestInit,
  beforeAttempt: () => Promise<void>,
  maxBytes = 2_000_000,
  allowMissing = false
): Promise<string> {
  for (let attempt = 0; attempt < 2; attempt++) {
    await beforeAttempt();
    try {
      const response = await rt.fetch(url, {
        ...init,
        redirect: 'manual',
        signal: AbortSignal.timeout(20_000),
      });
      if (allowMissing && response.status === 404) {
        void response.body?.cancel().catch(() => {});
        return '';
      }
      if (!response.ok) {
        void response.body?.cancel().catch(() => {});
        if (response.status >= 500 && attempt === 0) continue;
        throw new IngestError(
          response.status === 429 ? 'upstream_backoff' : 'http_failed'
        );
      }
      return await readBody(response, maxBytes);
    } catch (error) {
      if (error instanceof IngestError) throw error;
      if (attempt === 1) throw new IngestError('request_failed');
    }
  }
  throw new IngestError('request_failed');
}

export interface BrainConfig {
  GBRAIN_MCP_URL: string;
  GBRAIN_API_KEY: string;
}

export function createBrain(config: BrainConfig, rt: Runtime) {
  let endpoint: string;
  try {
    endpoint = publicUrl(config.GBRAIN_MCP_URL).href;
    if (!config.GBRAIN_API_KEY?.trim()) throw new Error();
  } catch {
    throw new IngestError('configuration_invalid');
  }
  async function call(name: string, args: object): Promise<unknown> {
    const body = await requestText(
      rt,
      endpoint,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${config.GBRAIN_API_KEY}`,
          'Content-Type': 'application/json',
          Accept: 'application/json, text/event-stream',
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'tools/call',
          params: { name, arguments: args },
        }),
      },
      () => rt.sleep(1000)
    );
    try {
      const messages = body.trim().startsWith('{')
        ? [JSON.parse(body)]
        : body
            .split('\n')
            .filter(line => line.startsWith('data:'))
            .map(line => JSON.parse(line.slice(5)));
      const message = messages.find(value => value.id === 1);
      const result = record(record(message).result);
      if (message.error || result.isError || !Array.isArray(result.content))
        throw new Error();
      const content = result.content.find(value => value.type === 'text');
      const value = JSON.parse(content.text);
      if (value?.error) throw new Error();
      return value;
    } catch {
      throw new IngestError('brain_failed');
    }
  }
  return {
    async get(
      slug: string,
      source: string
    ): Promise<Record<string, unknown> | null> {
      const rows = await call('get_raw_data', { slug, source });
      if (!Array.isArray(rows) || rows.length > 1)
        throw new IngestError('brain_failed');
      if (!rows.length) return null;
      const row = record(rows[0]);
      if (row.source !== source) throw new IngestError('brain_failed');
      return record(row.data);
    },
    async put(slug: string, source: string, data: object, exists: boolean) {
      // gbrain requires a parent. Its body is EMPTY: no fetched text, links,
      // source identities, embeddings or synthesized claims enter compiled_truth.
      if (!exists) {
        const parent = record(
          await call('put_page', {
            slug,
            content: `---\ntitle: ${source} raw input\ntype: note\ntags: [raw, non-canon, private-internal]\ncanon: false\ningest_key: ${slug}\n---\n`,
          })
        );
        if (
          parent.slug !== slug ||
          parent.chunks !== 0 ||
          !['imported', 'skipped'].includes(String(parent.status))
        ) {
          throw new IngestError('brain_failed');
        }
      }
      const result = record(await call('put_raw_data', { slug, source, data }));
      if (result.status !== 'ok') throw new IngestError('brain_failed');
    },
  };
}
