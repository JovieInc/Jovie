import { randomBytes } from 'node:crypto';
import type { OvieDecision, OvieInitiative, OvieSummerTurn } from './types';

const TTL_SECONDS = 60 * 60 * 24 * 14;
const INDEX_CAP = 100;

export type OperatingStore = {
  putDecision(record: OvieDecision): Promise<void>;
  getDecision(id: string): Promise<OvieDecision | undefined>;
  listDecisions(): Promise<readonly OvieDecision[]>;
  putInitiative(record: OvieInitiative): Promise<void>;
  getInitiative(id: string): Promise<OvieInitiative | undefined>;
  listInitiatives(): Promise<readonly OvieInitiative[]>;
  putSummerTurn(record: OvieSummerTurn): Promise<OvieSummerTurn>;
  getSummerTurn(id: string): Promise<OvieSummerTurn | undefined>;
  listSummerTurns(): Promise<readonly OvieSummerTurn[]>;
  claimSummerTurn(
    id: string,
    claim: {
      readonly workerId: string;
      readonly claimToken: string;
      readonly expiresAt: string;
      readonly ttlSeconds: number;
    }
  ): Promise<OvieSummerTurn | undefined>;
  completeSummerTurn(
    id: string,
    completion: {
      readonly claimToken: string;
      readonly responseText: string;
      readonly completedAt: string;
    }
  ): Promise<OvieSummerTurn | undefined>;
  failSummerTurn(
    id: string,
    failure: {
      readonly claimToken: string;
      readonly failureCode: string;
      readonly failedAt: string;
    }
  ): Promise<OvieSummerTurn | undefined>;
};

export type RecordBackend = {
  get(key: string): Promise<unknown>;
  set(key: string, value: unknown): Promise<void>;
  setIfAbsent(
    key: string,
    value: unknown,
    ttlSeconds: number
  ): Promise<boolean>;
  compareAndSet(
    key: string,
    expectedValue: string,
    nextValue: string,
    ttlSeconds: number
  ): Promise<boolean>;
  lpush(key: string, value: string): Promise<void>;
  lrange(key: string, start: number, stop: number): Promise<string[]>;
};

export function memoryRecordBackend(bags?: {
  readonly records?: Map<string, unknown>;
  readonly lists?: Map<string, string[]>;
}): RecordBackend {
  const records = bags?.records ?? new Map<string, unknown>();
  const lists = bags?.lists ?? new Map<string, string[]>();
  const expiresAt = new Map<string, number>();
  return {
    async get(key) {
      const expiry = expiresAt.get(key);
      if (expiry !== undefined && expiry <= Date.now()) {
        expiresAt.delete(key);
        records.delete(key);
      }
      return records.has(key) ? records.get(key) : null;
    },
    async set(key, value) {
      expiresAt.delete(key);
      records.set(key, value);
    },
    async setIfAbsent(key, value, ttlSeconds) {
      const expiry = expiresAt.get(key);
      if (expiry !== undefined && expiry <= Date.now()) {
        expiresAt.delete(key);
        records.delete(key);
      }
      if (records.has(key)) return false;
      records.set(key, value);
      expiresAt.set(key, Date.now() + ttlSeconds * 1000);
      return true;
    },
    async compareAndSet(key, expectedValue, nextValue, ttlSeconds) {
      const expiry = expiresAt.get(key);
      if (expiry !== undefined && expiry <= Date.now()) {
        expiresAt.delete(key);
        records.delete(key);
      }
      if (records.get(key) !== expectedValue) return false;
      records.set(key, nextValue);
      expiresAt.set(key, Date.now() + ttlSeconds * 1000);
      return true;
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

  async putSummerTurn(record: OvieSummerTurn): Promise<OvieSummerTurn> {
    const created = await this.backend.setIfAbsent(
      summerTurnKey(record.id),
      record,
      TTL_SECONDS
    );
    if (created) {
      await this.backend.lpush(SUMMER_TURN_INDEX, record.id);
      return record;
    }
    const existing = await this.getSummerTurn(record.id);
    if (!existing) {
      throw new Error(
        `Summer turn ${record.id} exists without a valid durable record`
      );
    }
    return existing;
  }

  async getSummerTurn(id: string): Promise<OvieSummerTurn | undefined> {
    return asSummerTurn(await this.backend.get(summerTurnKey(id)));
  }

  async listSummerTurns(): Promise<readonly OvieSummerTurn[]> {
    const ids = await this.backend.lrange(SUMMER_TURN_INDEX, 0, INDEX_CAP - 1);
    const rows = await Promise.all(ids.map(id => this.getSummerTurn(id)));
    return rows.filter((row): row is OvieSummerTurn => Boolean(row)).reverse();
  }

  async claimSummerTurn(
    id: string,
    claim: {
      readonly workerId: string;
      readonly claimToken: string;
      readonly expiresAt: string;
      readonly ttlSeconds: number;
    }
  ): Promise<OvieSummerTurn | undefined> {
    const current = await this.getSummerTurn(id);
    const expiredClaim =
      current?.state === 'claimed' &&
      Boolean(current.claimExpiresAt) &&
      Date.parse(current.claimExpiresAt ?? '') <= Date.now();
    if (!current || (current.state !== 'queued' && !expiredClaim)) {
      return undefined;
    }
    const claimKey = summerTurnClaimKey(id);
    const claimLease = summerTurnClaimLeaseValue(claim);
    let acquired = await this.backend.setIfAbsent(
      claimKey,
      claimLease,
      claim.ttlSeconds
    );
    if (!acquired) {
      const storedLeaseValue = await this.backend.get(claimKey);
      const storedLease = asSummerTurnClaimLease(storedLeaseValue);
      if (
        !storedLease ||
        Date.parse(storedLease.expiresAt) > Date.now() ||
        typeof storedLeaseValue !== 'string'
      ) {
        return undefined;
      }
      acquired = await this.backend.compareAndSet(
        claimKey,
        storedLeaseValue,
        claimLease,
        claim.ttlSeconds
      );
    }
    if (!acquired) return undefined;
    const next: OvieSummerTurn = {
      ...current,
      state: 'claimed',
      claimedBy: claim.workerId,
      claimToken: claim.claimToken,
      claimExpiresAt: claim.expiresAt,
      updatedAt: new Date().toISOString(),
    };
    await this.writeSummerTurn(next);
    return next;
  }

  async completeSummerTurn(
    id: string,
    completion: {
      readonly claimToken: string;
      readonly responseText: string;
      readonly completedAt: string;
    }
  ): Promise<OvieSummerTurn | undefined> {
    const current = await this.getSummerTurn(id);
    if (
      !current ||
      current.state !== 'claimed' ||
      current.claimToken !== completion.claimToken ||
      !current.claimExpiresAt ||
      Date.parse(current.claimExpiresAt) <= Date.parse(completion.completedAt)
    ) {
      return undefined;
    }
    const claimKey = summerTurnClaimKey(id);
    const claimLease = summerTurnClaimLeaseValue({
      claimToken: current.claimToken,
      expiresAt: current.claimExpiresAt,
    });
    const completionMarker = `completed:${completion.claimToken}`;
    const alreadyFenced =
      (await this.backend.get(claimKey)) === completionMarker;
    const fenced =
      alreadyFenced ||
      (await this.backend.compareAndSet(
        claimKey,
        claimLease,
        completionMarker,
        TTL_SECONDS
      ));
    if (!fenced) return undefined;
    const next: OvieSummerTurn = {
      ...current,
      state: 'completed',
      responseText: completion.responseText,
      updatedAt: completion.completedAt,
    };
    await this.writeSummerTurn(next);
    return next;
  }

  async failSummerTurn(
    id: string,
    failure: {
      readonly claimToken: string;
      readonly failureCode: string;
      readonly failedAt: string;
    }
  ): Promise<OvieSummerTurn | undefined> {
    const current = await this.getSummerTurn(id);
    if (
      !current ||
      current.state !== 'claimed' ||
      current.claimToken !== failure.claimToken ||
      !current.claimExpiresAt ||
      Date.parse(current.claimExpiresAt) <= Date.parse(failure.failedAt)
    ) {
      return undefined;
    }
    const claimKey = summerTurnClaimKey(id);
    const claimLease = summerTurnClaimLeaseValue({
      claimToken: current.claimToken,
      expiresAt: current.claimExpiresAt,
    });
    const failureMarker = `failed:${failure.claimToken}`;
    const alreadyFenced = (await this.backend.get(claimKey)) === failureMarker;
    const fenced =
      alreadyFenced ||
      (await this.backend.compareAndSet(
        claimKey,
        claimLease,
        failureMarker,
        TTL_SECONDS
      ));
    if (!fenced) return undefined;
    const next: OvieSummerTurn = {
      ...current,
      state: 'failed',
      failureCode: failure.failureCode,
      updatedAt: failure.failedAt,
    };
    await this.writeSummerTurn(next);
    return next;
  }

  private async writeSummerTurn(record: OvieSummerTurn): Promise<void> {
    await this.backend.set(summerTurnKey(record.id), record);
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

  putSummerTurn(record: OvieSummerTurn): Promise<OvieSummerTurn> {
    return this.putSummerCanonical(record);
  }

  getSummerTurn(id: string): Promise<OvieSummerTurn | undefined> {
    return this.options.fallback.getSummerTurn(id);
  }

  listSummerTurns(): Promise<readonly OvieSummerTurn[]> {
    return this.options.fallback.listSummerTurns();
  }

  async claimSummerTurn(
    id: string,
    claim: {
      readonly workerId: string;
      readonly claimToken: string;
      readonly expiresAt: string;
      readonly ttlSeconds: number;
    }
  ): Promise<OvieSummerTurn | undefined> {
    const claimed = await this.options.fallback.claimSummerTurn(id, claim);
    if (claimed) await this.cacheSummerTurn(claimed);
    return claimed;
  }

  async completeSummerTurn(
    id: string,
    completion: {
      readonly claimToken: string;
      readonly responseText: string;
      readonly completedAt: string;
    }
  ): Promise<OvieSummerTurn | undefined> {
    const completed = await this.options.fallback.completeSummerTurn(
      id,
      completion
    );
    if (completed) await this.cacheSummerTurn(completed);
    return completed;
  }

  async failSummerTurn(
    id: string,
    failure: {
      readonly claimToken: string;
      readonly failureCode: string;
      readonly failedAt: string;
    }
  ): Promise<OvieSummerTurn | undefined> {
    const failed = await this.options.fallback.failSummerTurn(id, failure);
    if (failed) await this.cacheSummerTurn(failed);
    return failed;
  }

  private async putSummerCanonical(
    record: OvieSummerTurn
  ): Promise<OvieSummerTurn> {
    const persisted = await this.options.fallback.putSummerTurn(record);
    await this.cacheSummerTurn(persisted);
    return persisted;
  }

  private async cacheSummerTurn(record: OvieSummerTurn): Promise<void> {
    try {
      await this.options.primary.putSummerTurn(record);
    } catch (error) {
      this.noteFailure(error);
      if (!this.options.isPrimaryFailure(error)) throw error;
    }
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

  private async get<
    K extends 'getDecision' | 'getInitiative' | 'getSummerTurn',
  >(method: K, id: string): Promise<Awaited<ReturnType<OperatingStore[K]>>> {
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

  private async list<
    K extends 'listDecisions' | 'listInitiatives' | 'listSummerTurns',
  >(method: K): Promise<Awaited<ReturnType<OperatingStore[K]>>> {
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
const SUMMER_TURN_INDEX = 'ovie:mcp:v1:summer-turn:index';

function initiativeKey(id: string): string {
  return `ovie:mcp:v1:ini:${id}`;
}

function decisionKey(id: string): string {
  return `ovie:mcp:v1:dec:${id}`;
}

function summerTurnKey(id: string): string {
  return `ovie:mcp:v1:summer-turn:${id}`;
}

function summerTurnClaimKey(id: string): string {
  return `ovie:mcp:v1:summer-turn:${id}:claim`;
}

type SummerTurnClaimLease = {
  readonly claimToken: string;
  readonly expiresAt: string;
};

function summerTurnClaimLeaseValue(lease: SummerTurnClaimLease): string {
  return JSON.stringify({
    claimToken: lease.claimToken,
    expiresAt: lease.expiresAt,
  });
}

function asSummerTurnClaimLease(
  value: unknown
): SummerTurnClaimLease | undefined {
  if (typeof value !== 'string') return undefined;
  try {
    const parsed = JSON.parse(value) as Partial<SummerTurnClaimLease>;
    if (
      typeof parsed.claimToken !== 'string' ||
      !parsed.claimToken ||
      typeof parsed.expiresAt !== 'string' ||
      !Number.isFinite(Date.parse(parsed.expiresAt))
    ) {
      return undefined;
    }
    return {
      claimToken: parsed.claimToken,
      expiresAt: parsed.expiresAt,
    };
  } catch {
    return undefined;
  }
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

function asSummerTurn(value: unknown): OvieSummerTurn | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const rec = value as Partial<OvieSummerTurn>;
  if (rec.kind !== 'summer-turn' || typeof rec.id !== 'string')
    return undefined;
  if (
    typeof rec.conversationId !== 'string' ||
    typeof rec.userText !== 'string' ||
    typeof rec.state !== 'string'
  ) {
    return undefined;
  }
  return rec as OvieSummerTurn;
}

export const OVIE_MCP_RECORD_TTL_SECONDS = TTL_SECONDS;
export const OVIE_MCP_INDEX_CAP = INDEX_CAP;

const processMemory = memoryRecordBackend();
let defaultStore: OperatingStore | undefined;

export function getDefaultOperatingStore(): OperatingStore {
  if (!defaultStore) defaultStore = new DurableOperatingStore(processMemory);
  return defaultStore;
}
