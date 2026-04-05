import { spawnSync } from 'node:child_process';
import { OVERNIGHT_WEB_ROOT } from './paths';
import type { CommandExecutionResult } from './types';

export function runCommand(
  command: readonly string[],
  options: {
    readonly cwd?: string;
    readonly env?: Readonly<Record<string, string>>;
  } = {}
): CommandExecutionResult {
  const [binary, ...args] = command;
  const result = spawnSync(binary, args, {
    cwd: options.cwd ?? OVERNIGHT_WEB_ROOT,
    env: { ...process.env, ...options.env },
    encoding: 'utf8',
    maxBuffer: 50 * 1024 * 1024,
  });

  return {
    code: result.status ?? 1,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
  };
}
