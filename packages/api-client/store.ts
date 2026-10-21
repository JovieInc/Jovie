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

export const LOCK_STALE_MS = 10_000;
export const LOCK_TIMEOUT_MS = 2_000;

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

export class FileLedgerStore implements LedgerStore {
  readonly dir: string;
  private readonly now: () => number;
  private warned = false;

  constructor(root: string = defaultStateRoot(), now: () => number = Date.now) {
    this.dir = join(root, 'api-ledger');
    this.now = now;
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

  async transact<T>(
    provider: string,
    fn: (ledger: ProviderLedger) => T
  ): Promise<T> {
    await fs.mkdir(this.dir, { recursive: true, mode: 0o700 });
    const lock = join(this.dir, `${provider}.lock.d`);
    const held = await this.lock(lock);
    try {
      const ledger = await this.read(provider);
      const result = fn(ledger);
      pruneLedger(ledger, this.now());
      await this.write(this.path(provider), ledger);
      return result;
    } finally {
      if (held) await fs.rm(lock, { recursive: true, force: true });
    }
  }

  private async write(path: string, ledger: ProviderLedger): Promise<void> {
    const tmp = `${path}.${process.pid}.${randomUUID()}.tmp`;
    await fs.writeFile(tmp, JSON.stringify(ledger), { mode: 0o600 });
    await fs.rename(tmp, path);
  }

  /** mkdir is atomic on every filesystem lanes use; a stale lock is renamed away. */
  private async lock(path: string): Promise<boolean> {
    const deadline = this.now() + LOCK_TIMEOUT_MS;
    while (true) {
      try {
        await fs.mkdir(path, { mode: 0o700 });
        return true;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
      }
      try {
        const info = await fs.stat(path);
        if (this.now() - info.mtimeMs > LOCK_STALE_MS) {
          const stale = `${path}.stale-${process.pid}-${randomUUID()}`;
          await fs.rename(path, stale);
          await fs.rm(stale, { recursive: true, force: true });
          continue;
        }
      } catch {
        continue; // released between mkdir and stat
      }
      if (this.now() > deadline) {
        if (!this.warned) {
          this.warned = true;
          process.stderr.write(
            `${JSON.stringify({ schema: 'jovie.api-client.lock/v1', lock: path, outcome: 'timeout-unlocked' })}\n`
          );
        }
        return false;
      }
      await sleep(5 + Math.floor(Math.random() * 20));
    }
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
