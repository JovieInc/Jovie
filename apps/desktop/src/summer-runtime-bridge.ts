import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import type { Readable, Writable } from 'node:stream';

const DEFAULT_POLL_INTERVAL_MS = 5_000;
const DEFAULT_RUNTIME_TIMEOUT_MS = 90_000;
const MAX_RESPONSE_BYTES = 128 * 1024;

type SummerPendingTurn = {
  readonly id: string;
  readonly conversation_id: string;
  readonly user_text: string;
};

type SummerClaimedTurn = SummerPendingTurn & {
  readonly claim_token: string;
};

type SummerChild = {
  readonly stdin: Writable;
  readonly stdout: Readable;
  readonly stderr: Readable;
  once(event: 'error', listener: (error: Error) => void): SummerChild;
  once(
    event: 'close',
    listener: (code: number | null, signal: NodeJS.Signals | null) => void
  ): SummerChild;
  kill(signal?: NodeJS.Signals): boolean;
};

type SpawnSummer = (
  executable: string,
  args: readonly string[],
  options: {
    readonly shell: false;
    readonly stdio: readonly ['pipe', 'pipe', 'pipe'];
  }
) => SummerChild;

export type SummerBridgeReceipt = {
  readonly cycle: number;
  readonly state:
    | 'idle'
    | 'completed'
    | 'claim-conflict'
    | 'http-error'
    | 'runtime-error';
  readonly turnId?: string;
  readonly errorCode?: string;
};

export type SummerRuntimeBridge = {
  start(): void;
  stop(): void;
  runCycle(): Promise<SummerBridgeReceipt>;
};

type SummerBridgeFetch = (
  input: string,
  init?: RequestInit
) => Promise<Response>;

function conversationSessionName(conversationId: string): string {
  const digest = createHash('sha256')
    .update(conversationId)
    .digest('hex')
    .slice(0, 24);
  return `ovie-founder-${digest}`;
}

async function readJson(response: Response): Promise<Record<string, unknown>> {
  const body: unknown = await response.json().catch(() => null);
  return body && typeof body === 'object'
    ? (body as Record<string, unknown>)
    : {};
}

function asPendingTurns(body: Record<string, unknown>): SummerPendingTurn[] {
  if (body.ok !== true || !Array.isArray(body.turns)) return [];
  return body.turns.filter((value): value is SummerPendingTurn => {
    if (!value || typeof value !== 'object') return false;
    const row = value as Record<string, unknown>;
    return (
      typeof row.id === 'string' &&
      typeof row.conversation_id === 'string' &&
      typeof row.user_text === 'string'
    );
  });
}

function asClaimedTurn(
  body: Record<string, unknown>
): SummerClaimedTurn | undefined {
  if (body.ok !== true || !body.turn || typeof body.turn !== 'object') {
    return undefined;
  }
  const turn = body.turn as Record<string, unknown>;
  if (
    typeof turn.id !== 'string' ||
    typeof turn.conversation_id !== 'string' ||
    typeof turn.user_text !== 'string' ||
    typeof turn.claim_token !== 'string'
  ) {
    return undefined;
  }
  return turn as SummerClaimedTurn;
}

export async function invokeSummerRuntime(input: {
  readonly homeDirectory: string;
  readonly turn: SummerClaimedTurn;
  readonly spawnProcess?: SpawnSummer;
  readonly timeoutMs?: number;
  readonly signal?: AbortSignal;
}): Promise<string> {
  const spawnProcess = input.spawnProcess ?? (spawn as unknown as SpawnSummer);
  const executable = join(input.homeDirectory, '.hermes', 'bin', 'hermes');
  const child = spawnProcess(
    executable,
    [
      '-p',
      'summer',
      'chat',
      '-Q',
      '-c',
      conversationSessionName(input.turn.conversation_id),
      '--create-if-missing',
      '--query-file',
      '-',
      '--source',
      'tool',
    ],
    { shell: false, stdio: ['pipe', 'pipe', 'pipe'] }
  );
  return new Promise<string>((resolve, reject) => {
    let stdout = '';
    let stdoutBytes = 0;
    let settled = false;
    let timer: NodeJS.Timeout | undefined;
    const abort = () => {
      child.kill('SIGTERM');
      finish(new Error('summer-runtime-canceled'));
    };
    const finish = (error?: Error, response?: string): void => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      input.signal?.removeEventListener('abort', abort);
      if (error) reject(error);
      else resolve(response ?? '');
    };
    timer = setTimeout(() => {
      child.kill('SIGTERM');
      finish(new Error('summer-runtime-timeout'));
    }, input.timeoutMs ?? DEFAULT_RUNTIME_TIMEOUT_MS);
    if (input.signal?.aborted) abort();
    else input.signal?.addEventListener('abort', abort, { once: true });
    child.stdout.on('data', chunk => {
      const text = String(chunk);
      stdoutBytes += Buffer.byteLength(text);
      if (stdoutBytes > MAX_RESPONSE_BYTES) {
        child.kill('SIGTERM');
        finish(new Error('summer-runtime-output-limit'));
        return;
      }
      stdout += text;
    });
    child.once('error', error => finish(error));
    child.once('close', code => {
      if (code !== 0) {
        finish(new Error(`summer-runtime-exit-${code ?? 'signal'}`));
        return;
      }
      const response = stdout.trim();
      if (!response) {
        finish(new Error('summer-runtime-empty-response'));
        return;
      }
      finish(undefined, response);
    });
    child.stdin.end(input.turn.user_text);
  });
}

export function createSummerRuntimeBridge(input: {
  readonly platform: NodeJS.Platform;
  readonly appOrigin: string;
  readonly homeDirectory: string;
  readonly fetch: SummerBridgeFetch;
  readonly workerId: string;
  readonly spawnProcess?: SpawnSummer;
  readonly pollIntervalMs?: number;
  readonly onReceipt?: (receipt: SummerBridgeReceipt) => void;
}): SummerRuntimeBridge {
  let timer: NodeJS.Timeout | undefined;
  let activeRuntime: AbortController | undefined;
  let running = false;
  let cycle = 0;
  const endpoint = new URL('/api/ovie/summer', input.appOrigin).toString();

  const post = (body: Record<string, unknown>) =>
    input.fetch(endpoint, {
      method: 'POST',
      credentials: 'include',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });

  const runCycle = async (): Promise<SummerBridgeReceipt> => {
    cycle += 1;
    if (input.platform !== 'darwin' || running) {
      return { cycle, state: 'idle' };
    }
    running = true;
    let receipt: SummerBridgeReceipt = { cycle, state: 'idle' };
    try {
      const pendingResponse = await input.fetch(endpoint, {
        credentials: 'include',
      });
      if (!pendingResponse.ok) {
        receipt = {
          cycle,
          state: 'http-error',
          errorCode: `pending-${pendingResponse.status}`,
        };
        return receipt;
      }
      const [pending] = asPendingTurns(await readJson(pendingResponse));
      if (!pending) return receipt;
      const claimResponse = await post({
        action: 'claim',
        id: pending.id,
        worker_id: input.workerId,
      });
      if (claimResponse.status === 409) {
        receipt = { cycle, state: 'claim-conflict', turnId: pending.id };
        return receipt;
      }
      if (!claimResponse.ok) {
        receipt = {
          cycle,
          state: 'http-error',
          turnId: pending.id,
          errorCode: `claim-${claimResponse.status}`,
        };
        return receipt;
      }
      const claimed = asClaimedTurn(await readJson(claimResponse));
      if (!claimed) {
        receipt = {
          cycle,
          state: 'http-error',
          turnId: pending.id,
          errorCode: 'claim-invalid',
        };
        return receipt;
      }
      let responseText: string;
      try {
        activeRuntime = new AbortController();
        responseText = await invokeSummerRuntime({
          homeDirectory: input.homeDirectory,
          turn: claimed,
          spawnProcess: input.spawnProcess,
          signal: activeRuntime.signal,
        });
      } catch (error) {
        const errorCode =
          error instanceof Error ? error.message : 'runtime-error';
        await post({
          action: 'fail',
          id: claimed.id,
          claim_token: claimed.claim_token,
          failure_code: errorCode,
        }).catch(() => undefined);
        receipt = {
          cycle,
          state: 'runtime-error',
          turnId: claimed.id,
          errorCode,
        };
        return receipt;
      } finally {
        activeRuntime = undefined;
      }
      const completed = await post({
        action: 'complete',
        id: claimed.id,
        claim_token: claimed.claim_token,
        response_text: responseText,
      });
      if (!completed.ok) {
        receipt = {
          cycle,
          state: 'http-error',
          turnId: claimed.id,
          errorCode: `complete-${completed.status}`,
        };
        return receipt;
      }
      receipt = { cycle, state: 'completed', turnId: claimed.id };
      return receipt;
    } catch {
      receipt = { cycle, state: 'http-error', errorCode: 'request-failed' };
      return receipt;
    } finally {
      running = false;
      input.onReceipt?.(receipt);
    }
  };

  return {
    start() {
      if (input.platform !== 'darwin' || timer) return;
      void runCycle();
      timer = setInterval(
        () => void runCycle(),
        input.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS
      );
    },
    stop() {
      if (timer) clearInterval(timer);
      timer = undefined;
      activeRuntime?.abort();
    },
    runCycle,
  };
}
