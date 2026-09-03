import 'server-only';

import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { captureError } from '@/lib/error-tracking';
import {
  isSafeSshHost,
  SYMPHONY_SSH_TEMPLATE_HOST,
} from '@/lib/hud/ovie-launchers';
import {
  type ApprovedCodexAccountLabel,
  type CodexAccountControlSnapshot,
  emptyCodexAccountControlSnapshot,
  parseCodexAccountControlSnapshot,
  stripCodexAccountSecrets,
} from '@/lib/hud/symphony-codex-accounts';
import { logger } from '@/lib/utils/logger';

function helperPath(): string {
  const configured = process.env.JOVIE_CODEX_ACCOUNT_CONTROL_HELPER;
  if (configured) return configured;
  const cwd = process.cwd();
  return cwd.endsWith('/apps/web')
    ? join(cwd, '../../scripts/hermes/symphony-codex-account-control.py')
    : join(cwd, 'scripts/hermes/symphony-codex-account-control.py');
}
const INSPECT_TIMEOUT_MS = 8_000;
const RECONNECT_TIMEOUT_MS = 12_000;

export type CodexAccountControlRunner = (
  args: readonly string[],
  timeoutMs: number
) => Promise<{ readonly stdout: string; readonly status: number }>;

function spawnWithTimeout(
  command: string,
  argv: readonly string[],
  timeoutMs: number,
  stdin?: string
): Promise<{ stdout: string; status: number }> {
  return new Promise(resolve => {
    const child = spawn(command, [...argv], {
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    let stdout = '';
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      resolve({ stdout, status: 124 });
    }, timeoutMs);
    child.stdout?.on('data', chunk => {
      stdout += String(chunk);
    });
    child.stderr?.on('data', () => {
      // Discard stderr so token-bearing CLI noise never reaches logs.
    });
    child.once('error', () => {
      clearTimeout(timer);
      resolve({ stdout, status: 127 });
    });
    child.once('exit', code => {
      clearTimeout(timer);
      resolve({ stdout, status: code ?? 1 });
    });
    if (stdin != null) {
      child.stdin?.end(stdin);
    } else {
      child.stdin?.end();
    }
  });
}

export function createDefaultCodexAccountControlRunner(): CodexAccountControlRunner {
  return async (args, timeoutMs) => {
    if (process.env.JOVIE_CODEX_ACCOUNT_CONTROL_LOCAL === '1') {
      return spawnWithTimeout('python3', [helperPath(), ...args], timeoutMs);
    }
    const host = SYMPHONY_SSH_TEMPLATE_HOST;
    if (!isSafeSshHost(host)) {
      return { stdout: '', status: 2 };
    }
    let helperSource = '';
    try {
      helperSource = readFileSync(helperPath(), 'utf8');
    } catch {
      return { stdout: '', status: 2 };
    }
    return spawnWithTimeout(
      'ssh',
      [
        '-o',
        'BatchMode=yes',
        '-o',
        'ConnectTimeout=2',
        '-o',
        'StrictHostKeyChecking=yes',
        host,
        'python3',
        '-',
        ...args,
      ],
      timeoutMs,
      helperSource
    );
  };
}

function snapshotFromRun(
  stdout: string,
  status: number
): CodexAccountControlSnapshot {
  const safe = stripCodexAccountSecrets(stdout);
  if (status !== 0) {
    return emptyCodexAccountControlSnapshot(
      'unavailable',
      'Gem Codex account control is unavailable.'
    );
  }
  try {
    const parsed = parseCodexAccountControlSnapshot(JSON.parse(safe));
    if (parsed) return parsed;
  } catch {
    return emptyCodexAccountControlSnapshot(
      'unavailable',
      'Gem Codex account control returned an unreadable snapshot.'
    );
  }
  return emptyCodexAccountControlSnapshot(
    'unavailable',
    'Gem Codex account control returned an unreadable snapshot.'
  );
}

export async function inspectSymphonyCodexAccounts(
  runner: CodexAccountControlRunner = createDefaultCodexAccountControlRunner()
): Promise<CodexAccountControlSnapshot> {
  try {
    const run = await runner(['inspect'], INSPECT_TIMEOUT_MS);
    return snapshotFromRun(run.stdout, run.status);
  } catch (error) {
    logger.error('[symphony-codex-accounts] inspect failed', error);
    await captureError('Symphony Codex account inspect failed', error, {
      context: 'symphony_codex_account_inspect',
    });
    return emptyCodexAccountControlSnapshot(
      'unavailable',
      'Gem Codex account control is unavailable.'
    );
  }
}

export async function reconnectSymphonyCodexAccount(
  account: ApprovedCodexAccountLabel,
  runner: CodexAccountControlRunner = createDefaultCodexAccountControlRunner()
): Promise<CodexAccountControlSnapshot> {
  try {
    const run = await runner(
      ['reconnect', '--account', account],
      RECONNECT_TIMEOUT_MS
    );
    return snapshotFromRun(run.stdout, run.status);
  } catch (error) {
    logger.error('[symphony-codex-accounts] reconnect failed', error);
    await captureError('Symphony Codex account reconnect failed', error, {
      context: 'symphony_codex_account_reconnect',
    });
    return emptyCodexAccountControlSnapshot(
      'unavailable',
      'Gem Codex account reconnect is unavailable.'
    );
  }
}
