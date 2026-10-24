/**
 * Response cache for conditional (ETag/Last-Modified) and TTL reads. A GitHub
 * 304 does not count against the primary limit, so a cached ETag turns a
 * repeated poll into a free call.
 */
import { createHash, randomUUID } from 'node:crypto';
import * as fs from 'node:fs/promises';
import { join } from 'node:path';

export interface CachedResponse {
  readonly status: number;
  readonly headers: Readonly<Record<string, string>>;
  readonly body: string;
  readonly etag: string | null;
  readonly lastModified: string | null;
  readonly storedAt: number;
}

export interface ResponseCache {
  get(key: string): Promise<CachedResponse | null>;
  set(key: string, value: CachedResponse): Promise<void>;
}

export const MAX_CACHED_BODY_BYTES = 1_000_000;
const KEEP_HEADERS = ['content-type', 'etag', 'last-modified', 'link'];

export function cacheKey(parts: readonly string[]): string {
  return createHash('sha256').update(parts.join('\0')).digest('hex');
}

export function cacheable(
  status: number,
  headers: Headers,
  body: string
): boolean {
  return (
    status === 200 &&
    body.length <= MAX_CACHED_BODY_BYTES &&
    !/no-store/i.test(headers.get('cache-control') ?? '')
  );
}

export function toCached(
  status: number,
  headers: Headers,
  body: string,
  nowMs: number
): CachedResponse {
  const kept: Record<string, string> = {};
  for (const name of KEEP_HEADERS) {
    const value = headers.get(name);
    if (value !== null) kept[name] = value;
  }
  return {
    status,
    headers: kept,
    body,
    etag: headers.get('etag'),
    lastModified: headers.get('last-modified'),
    storedAt: nowMs,
  };
}

export class MemoryResponseCache implements ResponseCache {
  private readonly entries = new Map<string, CachedResponse>();
  private readonly max: number;

  constructor(max = 500) {
    this.max = max;
  }

  async get(key: string): Promise<CachedResponse | null> {
    const hit = this.entries.get(key);
    if (!hit) return null;
    this.entries.delete(key);
    this.entries.set(key, hit);
    return hit;
  }

  async set(key: string, value: CachedResponse): Promise<void> {
    this.entries.delete(key);
    this.entries.set(key, value);
    while (this.entries.size > this.max) {
      const oldest = this.entries.keys().next().value;
      if (oldest === undefined) break;
      this.entries.delete(oldest);
    }
  }
}

/** One file per key under <root>/api-cache/<provider>/, shared across processes. */
export class FileResponseCache implements ResponseCache {
  readonly dir: string;
  private readonly maxAgeMs: number;
  private writes = 0;

  constructor(root: string, provider: string, maxAgeMs = 86_400_000) {
    this.dir = join(root, 'api-cache', provider);
    this.maxAgeMs = maxAgeMs;
  }

  async get(key: string): Promise<CachedResponse | null> {
    try {
      return JSON.parse(
        await fs.readFile(join(this.dir, `${key}.json`), 'utf8')
      ) as CachedResponse;
    } catch {
      return null;
    }
  }

  async set(key: string, value: CachedResponse): Promise<void> {
    try {
      await fs.mkdir(this.dir, { recursive: true, mode: 0o700 });
      const path = join(this.dir, `${key}.json`);
      const tmp = `${path}.${process.pid}.${randomUUID()}.tmp`;
      await fs.writeFile(tmp, JSON.stringify(value), { mode: 0o600 });
      await fs.rename(tmp, path);
      this.writes += 1;
      if (this.writes % 50 === 1) await this.prune(value.storedAt);
    } catch {
      // a cache write failure only costs a future full read
    }
  }

  private async prune(nowMs: number): Promise<void> {
    for (const name of await fs.readdir(this.dir)) {
      const path = join(this.dir, name);
      const info = await fs.stat(path).catch(() => null);
      if (info && nowMs - info.mtimeMs > this.maxAgeMs)
        await fs.rm(path, { force: true });
    }
  }
}
