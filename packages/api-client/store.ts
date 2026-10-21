/**
 * Where the shared ledger lives. FileLedgerStore is the host-wide ledger
 * (one JSON file per provider, guarded by an mkdir lock that Python's
 * scripts/apiclient/store.py takes the same way). MemoryLedgerStore serves
 * serverless runtimes and tests.
 */
import { createHash, randomUUID } from 'node:crypto';
import * as fs from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';

import {
  emptyLedger,
  LEDGER_SCHEMA,
  type ProviderLedger,
  pruneLedger,
} from './policy.ts';

export interface LedgerStore {
  /** Read-modify-write one provider's ledger under the host lock. */
  transact<T>(provider: string, fn: (ledger: ProviderLedger) => T): Promise<T>;
  read(provider: string): Promise<ProviderLedger>;
}

/** A lock dir older than this belongs to a crashed holder and may be broken. */
export const LOCK_STALE_MS = 10_000;
/** How long a transaction waits for another process before it gives up persisting. */
export const LOCK_TIMEOUT_MS = 5_000;

export function hashCredential(salt: string, secret: string): string {
  return createHash('sha256').update(`${salt}\0${secret}`).digest('hex');
}

/** Hashes print as a 12-char prefix; readable labels (app-installation:1) stay whole. */
export function credentialLabel(id: string): string {
  return /^[0-9a-f]{64}$/.test(id) ? id.slice(0, 12) : id;
}

/** JOVIE_API_STATE_DIR, else the lanes state dir every Gem process shares. */
export function defaultStateRoot(
  env: NodeJS.ProcessEnv = process.env,
  home = homedir()
): string {
  if (env.JOVIE_API_STATE_DIR) return env.JOVIE_API_STATE_DIR;
  if (env.LANES_STATE) return env.LANES_STATE;
  return join(home, '.local', 'state', 'jovie-lanes');
}

function valid(value: unknown, provider: string): value is ProviderLedger {
  return (
    !!value &&
    typeof value === 'object' &&
    (value as ProviderLedger).schema === LEDGER_SCHEMA &&
    (value as ProviderLedger).provider === provider &&
    typeof (value as ProviderLedger).credentials === 'object'
  );
}

export class MemoryLedgerStore implements LedgerStore {
  private readonly ledgers = new Map<string, ProviderLedger>();
  private chain: Promise<unknown> = Promise.resolve();

  async transact<T>(
    provider: string,
    fn: (ledger: ProviderLedger) => T
  ): Promise<T> {
    const run = this.chain.then(() => {
      const ledger = this.ledgers.get(provider) ?? emptyLedger(provider);
      const result = fn(ledger);
      this.ledgers.set(provider, ledger);
      return result;
    });
    this.chain = run.catch(() => undefined);
    return run;
  }

  async read(provider: string): Promise<ProviderLedger> {
    return structuredClone(this.ledgers.get(provider) ?? emptyLedger(provider));
  }
}

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Lock protocol, shared with scripts/apiclient/store.py:
 * - `<provider>.lock.d` is taken with an atomic mkdir; the holder writes its
 *   token to `owner` inside it and releases only a lock it still owns.
 * - A lock older than LOCK_STALE_MS (wall clock vs dir mtime) is broken under
 *   `<provider>.lock.d.break`, itself an mkdir lock, after re-checking it is
 *   still stale, so two waiters can never both break and both hold.
 * - On timeout the transaction runs on a fresh read but is NOT persisted:
 *   one unrecorded call is better than clobbering every concurrent update.
 * Within one process, transactions on a provider queue in memory first, so
 * in-process contention never reaches the filesystem spin loop.
 */
export class FileLedgerStore implements LedgerStore {
  readonly dir: string;
  private readonly now: () => number;
  private readonly lockTimeoutMs: number;
  private readonly queues = new Map<string, Promise<unknown>>();
  private warned = false;

  constructor(
    root: string = defaultStateRoot(),
    now: () => number = Date.now,
    options: { lockTimeoutMs?: number } = {}
  ) {
    this.dir = join(root, 'api-ledger');
    this.now = now;
    this.lockTimeoutMs = options.lockTimeoutMs ?? LOCK_TIMEOUT_MS;
  }

  path(provider: string): string {
    return join(this.dir, `${provider}.json`);
  }

  async read(provider: string): Promise<ProviderLedger> {
    try {
      const parsed: unknown = JSON.parse(
        await fs.readFile(this.path(provider), 'utf8')
      );
      if (valid(parsed, provider)) return parsed;
    } catch {
      // missing or torn file: an unreadable budget never blocks work
    }
    return emptyLedger(provider);
  }

  transact<T>(provider: string, fn: (ledger: ProviderLedger) => T): Promise<T> {
    const run = (this.queues.get(provider) ?? Promise.resolve()).then(() =>
      this.transactLocked(provider, fn)
    );
    const tail = run.catch(() => undefined);
    this.queues.set(provider, tail);
    void tail.then(() => {
      if (this.queues.get(provider) === tail) this.queues.delete(provider);
    });
    return run;
  }

  private async transactLocked<T>(
    provider: string,
    fn: (ledger: ProviderLedger) => T
  ): Promise<T> {
    await fs.mkdir(this.dir, { recursive: true, mode: 0o700 });
    const lock = join(this.dir, `${provider}.lock.d`);
    const token = await this.lock(lock);
    try {
      const ledger = await this.read(provider);
      const result = fn(ledger);
      if (token) {
        pruneLedger(ledger, this.now());
        await this.write(this.path(provider), ledger);
      }
      return result;
    } finally {
      if (token) await this.release(lock, token);
    }
  }

  private async write(path: string, ledger: ProviderLedger): Promise<void> {
    const tmp = `${path}.${process.pid}.${randomUUID()}.tmp`;
    await fs.writeFile(tmp, JSON.stringify(ledger), { mode: 0o600 });
    await fs.rename(tmp, path);
  }

  /** Returns the owner token, or null after a timeout (caller must not persist). */
  private async lock(path: string): Promise<string | null> {
    const deadline = Date.now() + this.lockTimeoutMs;
    while (true) {
      try {
        await fs.mkdir(path, { mode: 0o700 });
        const token = `${process.pid}-${randomUUID()}`;
        await fs.writeFile(join(path, 'owner'), token, { mode: 0o600 });
        return token;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
      }
      if (await isStale(path)) {
        await breakStale(path);
        continue;
      }
      if (Date.now() > deadline) {
        if (!this.warned) {
          this.warned = true;
          process.stderr.write(
            `${JSON.stringify({ schema: 'jovie.api-client.lock/v1', lock: path, outcome: 'timeout-unpersisted' })}\n`
          );
        }
        return null;
      }
      await sleep(5 + Math.floor(Math.random() * 20));
    }
  }

  private async release(path: string, token: string): Promise<void> {
    const owner = await fs
      .readFile(join(path, 'owner'), 'utf8')
      .catch(() => null);
    if (owner === token) await fs.rm(path, { recursive: true, force: true });
  }
}

async function isStale(path: string): Promise<boolean> {
  try {
    return Date.now() - (await fs.stat(path)).mtimeMs > LOCK_STALE_MS;
  } catch {
    return false; // released between mkdir and stat
  }
}

/** Only the holder of `<lock>.break` may remove a stale lock, and only if it is still stale. */
async function breakStale(path: string): Promise<void> {
  const breaker = `${path}.break`;
  try {
    await fs.mkdir(breaker, { mode: 0o700 });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
    if (await isStale(breaker))
      await fs.rm(breaker, { recursive: true, force: true });
    await sleep(5);
    return;
  }
  try {
    if (await isStale(path))
      await fs.rm(path, { recursive: true, force: true });
  } finally {
    await fs.rm(breaker, { recursive: true, force: true });
  }
}

/** The host ledger for long-lived processes; memory on read-only serverless hosts. */
export function defaultStore(
  env: NodeJS.ProcessEnv = process.env
): LedgerStore {
  if (env.VERCEL || env.JOVIE_API_STATE === 'memory')
    return new MemoryLedgerStore();
  return new FileLedgerStore(defaultStateRoot(env));
}
