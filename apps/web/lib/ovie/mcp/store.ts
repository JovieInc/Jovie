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
    const existing = await this.getInitiative(record.id);
    await this.backend.set(initiativeKey(record.id), record);
    if (!existing) await this.backend.lpush(INITIATIVE_INDEX, record.id);
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

export type FailoverOperatingStoreOptions = {
  readonly primary: OperatingStore;
  readonly fallback: OperatingStore;
  readonly isPrimaryFailure: (error: unknown) => boolean;
  readonly onPrimaryFailure?: (error: unknown) => void;
  readonly writeThrough?: boolean;
};

/**
 * Prefer primary (Redis). On quota/unavailable, use fallback (Postgres).
 * Successful primary writes are also copied to fallback so a later instance
 * can read evidence without Redis.
 */
export class FailoverOperatingStore implements OperatingStore {
  constructor(private readonly options: FailoverOperatingStoreOptions) {}

  putDecision(record: OvieDecision): Promise<void> {
    return this.put('putDecision', record);
  }

  getDecision(id: string): Promise<OvieDecision | undefined> {
    return this.get('getDecision', id);
  }

  listDecisions(): Promise<readonly OvieDecision[]> {
    return this.list('listDecisions');
  }

  putInitiative(record: OvieInitiative): Promise<void> {
    return this.put('putInitiative', record);
  }

  getInitiative(id: string): Promise<OvieInitiative | undefined> {
    return this.get('getInitiative', id);
  }

  listInitiatives(): Promise<readonly OvieInitiative[]> {
    return this.list('listInitiatives');
  }

  private async put<K extends 'putDecision' | 'putInitiative'>(
    method: K,
    record: Parameters<OperatingStore[K]>[0]
  ): Promise<void> {
    const { primary, fallback, writeThrough } = this.options;
    try {
      await (primary[method] as (row: typeof record) => Promise<void>)(record);
    } catch (error) {
      this.noteFailure(error);
      if (!this.options.isPrimaryFailure(error)) throw error;
      await (fallback[method] as (row: typeof record) => Promise<void>)(record);
      return;
    }
    if (writeThrough) {
      await (fallback[method] as (row: typeof record) => Promise<void>)(
        record
      ).catch(() => undefined);
    }
  }

  private async get<K extends 'getDecision' | 'getInitiative'>(
    method: K,
    id: string
  ): Promise<Awaited<ReturnType<OperatingStore[K]>>> {
    const { primary, fallback } = this.options;
    try {
      const hit = await primary[method](id);
      if (hit) return hit as Awaited<ReturnType<OperatingStore[K]>>;
    } catch (error) {
      this.noteFailure(error);
      if (!this.options.isPrimaryFailure(error)) throw error;
    }
    return fallback[method](id) as Awaited<ReturnType<OperatingStore[K]>>;
  }

  private async list<K extends 'listDecisions' | 'listInitiatives'>(
    method: K
  ): Promise<Awaited<ReturnType<OperatingStore[K]>>> {
    const { primary, fallback } = this.options;
    const fallbackRows = await fallback[method]().catch(
      () => [] as Awaited<ReturnType<OperatingStore[K]>>
    );
    try {
      const primaryRows = await primary[method]();
      const seen = new Set(primaryRows.map(row => row.id));
      return [
        ...primaryRows,
        ...fallbackRows.filter(row => !seen.has(row.id)),
      ].slice(-INDEX_CAP) as Awaited<ReturnType<OperatingStore[K]>>;
    } catch (error) {
      this.noteFailure(error);
      if (!this.options.isPrimaryFailure(error)) throw error;
      return fallbackRows as Awaited<ReturnType<OperatingStore[K]>>;
    }
  }

  private noteFailure(error: unknown): void {
    this.options.onPrimaryFailure?.(error);
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

export const OVIE_MCP_RECORD_TTL_SECONDS = TTL_SECONDS;
export const OVIE_MCP_INDEX_CAP = INDEX_CAP;

const processMemory = memoryRecordBackend();
let defaultStore: OperatingStore | undefined;

export function getDefaultOperatingStore(): OperatingStore {
  if (!defaultStore) defaultStore = new DurableOperatingStore(processMemory);
  return defaultStore;
}
