import { randomBytes } from 'node:crypto';
import type { OvieDecision, OvieInitiative } from './types';

const TTL_SECONDS = 60 * 60 * 24 * 14;
const INDEX_CAP = 100;

export type OperatingStore = {
  putDecision(record: OvieDecision): Promise<void>;
  getDecision(id: string): Promise<OvieDecision | undefined>;
  listDecisions(): Promise<readonly OvieDecision[]>;
  putInitiative(record: OvieInitiative): Promise<void>;
  getInitiative(id: string): Promise<OvieInitiative | undefined>;
  listInitiatives(): Promise<readonly OvieInitiative[]>;
};

export type RecordBackend = {
  get(key: string): Promise<unknown>;
  set(key: string, value: unknown): Promise<void>;
  lpush(key: string, value: string): Promise<void>;
  lrange(key: string, start: number, stop: number): Promise<string[]>;
};

export function memoryRecordBackend(bags?: {
  readonly records?: Map<string, unknown>;
  readonly lists?: Map<string, string[]>;
}): RecordBackend {
  const records = bags?.records ?? new Map<string, unknown>();
  const lists = bags?.lists ?? new Map<string, string[]>();
  return {
    async get(key) {
      return records.has(key) ? records.get(key) : null;
    },
    async set(key, value) {
      records.set(key, value);
    },
    async lpush(key, value) {
      const next = [value, ...(lists.get(key) ?? [])].slice(0, INDEX_CAP);
      lists.set(key, next);
    },
    async lrange(key, start, stop) {
      const all = lists.get(key) ?? [];
      const end = stop < 0 ? all.length : stop + 1;
      return all.slice(start, end);
    },
  };
}

export function newRecordId(prefix: 'ini' | 'dec'): string {
  return `${prefix}_${randomBytes(9).toString('base64url')}`;
}

export class DurableOperatingStore implements OperatingStore {
  constructor(private readonly backend: RecordBackend) {}

  async putDecision(record: OvieDecision): Promise<void> {
    await this.backend.set(decisionKey(record.id), record);
    await this.backend.lpush(DECISION_INDEX, record.id);
  }

  async getDecision(id: string): Promise<OvieDecision | undefined> {
    return asDecision(await this.backend.get(decisionKey(id)));
  }

  async listDecisions(): Promise<readonly OvieDecision[]> {
    const ids = await this.backend.lrange(DECISION_INDEX, 0, INDEX_CAP - 1);
    const rows = await Promise.all(ids.map(id => this.getDecision(id)));
    return rows.filter((row): row is OvieDecision => Boolean(row)).reverse();
  }

  async putInitiative(record: OvieInitiative): Promise<void> {
    await this.backend.set(initiativeKey(record.id), record);
    await this.backend.lpush(INITIATIVE_INDEX, record.id);
  }

  async getInitiative(id: string): Promise<OvieInitiative | undefined> {
    return asInitiative(await this.backend.get(initiativeKey(id)));
  }

  async listInitiatives(): Promise<readonly OvieInitiative[]> {
    const ids = await this.backend.lrange(INITIATIVE_INDEX, 0, INDEX_CAP - 1);
    const rows = await Promise.all(ids.map(id => this.getInitiative(id)));
    return rows.filter((row): row is OvieInitiative => Boolean(row)).reverse();
  }
}

/** Isolated in-process store. Pass a shared backend to survive a new instance. */
export class MemoryOperatingStore extends DurableOperatingStore {
  constructor(backend: RecordBackend = memoryRecordBackend()) {
    super(backend);
  }
}

const INITIATIVE_INDEX = 'ovie:mcp:v1:ini:index';
const DECISION_INDEX = 'ovie:mcp:v1:dec:index';

function initiativeKey(id: string): string {
  return `ovie:mcp:v1:ini:${id}`;
}

function decisionKey(id: string): string {
  return `ovie:mcp:v1:dec:${id}`;
}

function asInitiative(value: unknown): OvieInitiative | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const rec = value as Partial<OvieInitiative>;
  if (rec.kind !== 'initiative' || typeof rec.id !== 'string') return undefined;
  if (!Array.isArray(rec.evidence) || !rec.handoff) return undefined;
  return rec as OvieInitiative;
}

function asDecision(value: unknown): OvieDecision | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const rec = value as Partial<OvieDecision>;
  if (rec.kind !== 'decision' || typeof rec.id !== 'string') return undefined;
  return rec as OvieDecision;
}

export function redisRecordBackend(redis: {
  get: (key: string) => Promise<unknown>;
  set: (
    key: string,
    value: unknown,
    opts?: { ex?: number }
  ) => Promise<unknown>;
  lpush: (key: string, value: string) => Promise<unknown>;
  lrange: (key: string, start: number, stop: number) => Promise<unknown>;
  ltrim: (key: string, start: number, stop: number) => Promise<unknown>;
}): RecordBackend {
  return {
    async get(key) {
      return redis.get(key);
    },
    async set(key, value) {
      await redis.set(key, value, { ex: TTL_SECONDS });
    },
    async lpush(key, value) {
      await redis.lpush(key, value);
      await redis.ltrim(key, 0, INDEX_CAP - 1);
    },
    async lrange(key, start, stop) {
      const rows = await redis.lrange(key, start, stop);
      return Array.isArray(rows)
        ? rows.map(row => (typeof row === 'string' ? row : String(row)))
        : [];
    },
  };
}

const processMemory = memoryRecordBackend();
let defaultStore: OperatingStore | undefined;

export function getDefaultOperatingStore(): OperatingStore {
  if (!defaultStore) defaultStore = new DurableOperatingStore(processMemory);
  return defaultStore;
}
