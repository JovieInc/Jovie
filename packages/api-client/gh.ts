/**
 * `gh` through the ledger, for shell steps and scripts that still shell out:
 * admission by priority, failure classification from gh's text, headers read
 * via `gh api --include`, bounded retries, and exit 75 when deferred.
 */
import { spawn } from 'node:child_process';
import { EX_TEMPFAIL } from './client.ts';
import {
  CONTRACT,
  type PriorityName,
  priorityPolicy,
  providerSpec,
} from './contract.ts';
import {
  classifyFailure,
  type Failure,
  type HeaderBag,
  parseBudget,
} from './headers.ts';
import {
  backoffMs,
  bump,
  credentialState,
  decide,
  observe,
  recordOutcome,
} from './policy.ts';
import { defaultStore, hashCredential, type LedgerStore } from './store.ts';

export interface GhResult {
  readonly code: number;
  readonly stdout: string;
  readonly stderr: string;
}

export type GhRunner = (
  args: readonly string[],
  env: NodeJS.ProcessEnv
) => Promise<GhResult>;

export interface RunGhOptions {
  readonly priority?: PriorityName;
  readonly credential?: string;
  readonly store?: LedgerStore;
  readonly env?: NodeJS.ProcessEnv;
  readonly run?: GhRunner;
  readonly now?: () => number;
  readonly sleep?: (ms: number) => Promise<void>;
  readonly random?: () => number;
  readonly maxAttempts?: number;
  readonly maxWaitMs?: number;
  readonly log?: (line: string) => void;
}

const GH_TRANSIENT =
  /HTTP 50[0234]|timed? ?out|unexpected EOF|connection reset|stream error|couldn't respond|ECONNRESET|ETIMEDOUT|EAI_AGAIN|Bad Gateway|Service Unavailable|invalid character '<'/i;
const WRITE_FLAGS = new Set([
  '-X',
  '--method',
  '-f',
  '-F',
  '--field',
  '--raw-field',
  '--input',
]);
const READ_PORCELAIN = new Set(['list', 'view', 'checks', 'status', 'diff']);

/** Which bucket a gh invocation draws on, and whether it mutates. */
export function ghShape(args: readonly string[]): {
  resource: string;
  write: boolean;
  idempotent: boolean;
} {
  if (args[0] === 'api') {
    const target =
      args.find(
        (a, i) =>
          i > 0 && !a.startsWith('-') && !WRITE_FLAGS.has(args[i - 1] ?? '')
      ) ?? '';
    const methodIndex = args.findIndex(a => a === '-X' || a === '--method');
    const method =
      methodIndex >= 0 ? (args[methodIndex + 1] ?? 'GET').toUpperCase() : null;
    if (target === 'graphql') {
      const mutation = args.some(a => /\bmutation\b/.test(a));
      return { resource: 'graphql', write: mutation, idempotent: !mutation };
    }
    const hasFields = args.some(
      a => WRITE_FLAGS.has(a) && a !== '-X' && a !== '--method'
    );
    const effective = method ?? (hasFields ? 'POST' : 'GET');
    const write = effective !== 'GET' && effective !== 'HEAD';
    return {
      resource: target.replace(/^\//, '').startsWith('search/')
        ? 'search'
        : 'core',
      write,
      idempotent: !write || effective === 'PUT' || effective === 'DELETE',
    };
  }
  const read = args[0] === 'search' || READ_PORCELAIN.has(args[1] ?? '');
  return { resource: 'graphql', write: !read, idempotent: read };
}

/** `gh api -i` output: status line + headers, blank line, body. */
export function splitIncluded(
  stdout: string
): { headers: Record<string, string>; body: string } | null {
  if (!/^HTTP\/[\d.]+ \d{3}/.test(stdout)) return null;
  const end = stdout.search(/\r?\n\r?\n/);
  if (end < 0) return null;
  const headers: Record<string, string> = {};
  for (const line of stdout.slice(0, end).split(/\r?\n/).slice(1)) {
    const colon = line.indexOf(':');
    if (colon > 0)
      headers[line.slice(0, colon).trim().toLowerCase()] = line
        .slice(colon + 1)
        .trim();
  }
  return { headers, body: stdout.slice(end).replace(/^\r?\n\r?\n/, '') };
}

const defaultRun: GhRunner = (args, env) =>
  new Promise(resolve => {
    const child = spawn('gh', [...args], {
      env,
      stdio: ['inherit', 'pipe', 'pipe'],
    });
    const out: Buffer[] = [];
    const err: Buffer[] = [];
    child.stdout.on('data', c => out.push(c));
    child.stderr.on('data', c => err.push(c));
    child.on('error', e =>
      resolve({ code: 127, stdout: '', stderr: String(e) })
    );
    child.on('close', code =>
      resolve({
        code: code ?? 1,
        stdout: Buffer.concat(out).toString('utf8'),
        stderr: Buffer.concat(err).toString('utf8'),
      })
    );
  });

export function ghCredential(env: NodeJS.ProcessEnv): string {
  if (env.JOVIE_GITHUB_CREDENTIAL) return env.JOVIE_GITHUB_CREDENTIAL;
  const token = env.GH_TOKEN || env.GITHUB_TOKEN;
  return token ? hashCredential('github', token) : 'gh-cli-login';
}

export async function runGh(
  args: readonly string[],
  options: RunGhOptions = {}
): Promise<GhResult & { deferred: boolean }> {
  const env = {
    ...(options.env ?? process.env),
    NO_COLOR: '1',
    GH_FORCE_TTY: '0',
  };
  const spec = providerSpec('github');
  const store = options.store ?? defaultStore(env);
  const credential = options.credential ?? ghCredential(env);
  const priority = options.priority ?? 'default';
  const now = options.now ?? Date.now;
  const sleep =
    options.sleep ??
    ((ms: number) => new Promise<void>(r => setTimeout(r, ms)));
  const random = options.random ?? Math.random;
  const log =
    options.log ?? ((line: string) => process.stderr.write(`${line}\n`));
  const maxAttempts = options.maxAttempts ?? CONTRACT.defaults.maxAttempts;
  const deadline =
    now() +
    (options.maxWaitMs ??
      CONTRACT.defaults.maxWaitMs[priorityPolicy(priority).class]);
  const shape = ghShape(args);
  const include =
    args[0] === 'api' &&
    !args.some(
      a =>
        a === '--paginate' ||
        a === '-i' ||
        a === '--include' ||
        a === '--silent'
    );
  const argv = include ? ['api', '--include', ...args.slice(1)] : [...args];
  const defer = (reason: string, retryAt: number | null) => {
    log(
      `::warning::github-quota-deferred: gh ${args.slice(0, 2).join(' ')} ${reason}${retryAt ? ` until ${new Date(retryAt).toISOString()}` : ''}; not a verdict on this change.`
    );
    return { code: EX_TEMPFAIL, stdout: '', stderr: reason, deferred: true };
  };
  const inLedger = <T>(
    fn: (s: ReturnType<typeof credentialState>, at: number) => T
  ) =>
    store.transact('github', ledger => {
      const at = now();
      return fn(credentialState(ledger, credential, at), at);
    });

  for (let attempt = 0; ; ) {
    const decision = await inLedger((s, at) => {
      const d = decide(
        s,
        {
          priority,
          costs: { [shape.resource]: 1 },
          write: shape.write,
          minWriteIntervalMs: spec.minWriteIntervalMs,
        },
        at
      );
      if (d.action !== 'go')
        bump(s, priority, d.action === 'shed' ? 'shed' : 'waited', at);
      return d;
    });
    if (decision.action === 'shed')
      return defer(`shed (${decision.reason})`, decision.until);
    if (decision.action === 'wait') {
      const until = decision.until ?? now() + 1000;
      if (until > deadline)
        return defer(`waits past budget (${decision.reason})`, until);
      await sleep(Math.max(0, until - now()));
      continue;
    }
    attempt += 1;
    const result = await (options.run ?? defaultRun)(argv, env);
    const included = include ? splitIncluded(result.stdout) : null;
    const headers: HeaderBag = included?.headers ?? null;
    const status = included
      ? Number(/^HTTP\/[\d.]+ (\d{3})/.exec(result.stdout)?.[1])
      : result.code === 0
        ? 200
        : null;
    const body = included ? included.body : result.stdout;
    const at = now();
    const failure: Failure =
      result.code === 0
        ? { kind: 'none', retryAtMs: null }
        : classifyFailure(spec, {
            status,
            headers,
            text: `${result.stderr}\n${body}`,
            nowMs: at,
          });
    // Without HTTP evidence, only gh's known transport wording is transient.
    const kind =
      failure.kind === 'transient' &&
      status === null &&
      !GH_TRANSIENT.test(result.stderr)
        ? 'client'
        : failure.kind;
    const settled: Failure = { kind, retryAtMs: failure.retryAtMs };
    await inLedger((s, t) => {
      observe(s, parseBudget(spec, headers, t, shape.resource), t);
      return recordOutcome(
        s,
        {
          priority,
          resource: shape.resource,
          failure: settled,
          probe: decision.probe,
        },
        t
      );
    });
    if (settled.kind === 'none' || settled.kind === 'client')
      return { ...result, stdout: body, deferred: false };
    if (settled.kind === 'transient' && !shape.idempotent)
      return { ...result, stdout: body, deferred: false };
    const delay = backoffMs(attempt, settled, now(), random);
    if (attempt >= maxAttempts || now() + delay > deadline) {
      return defer(
        `${settled.kind} after ${attempt} attempt(s)`,
        settled.retryAtMs
      );
    }
    await sleep(delay);
  }
}
