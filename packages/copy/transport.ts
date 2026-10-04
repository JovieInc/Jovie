/**
 * Server/CLI-only judge transport. Kept out of `./judge` (which browser and
 * app code import) because it spawns subscription CLIs.
 */

import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  type GatewayRequestPolicy,
  gatewayTransport,
  type JudgeTransport,
} from './judge';

// Subscription CLIs carry frontier judges; the gateway carries allowlisted ones.
// Codex now ships inside ChatGPT.app; env overrides win, then the bundled CLI, then PATH.
const BUNDLED_CODEX =
  '/Applications/ChatGPT.app/Contents/Resources/codex-cli/bin/codex';
const CODEX_BIN =
  process.env.CODEX_BIN ??
  process.env.HERMES_CODEX_BIN ??
  (existsSync(BUNDLED_CODEX) ? BUNDLED_CODEX : 'codex');
const probe = new Map<string, boolean>();
function installed(bin: string): boolean {
  if (!probe.has(bin)) {
    probe.set(
      bin,
      spawnSync(bin, ['--version'], { encoding: 'utf8', timeout: 15_000 })
        .status === 0
    );
  }
  return probe.get(bin) ?? false;
}

// Judges run from a neutral temp dir so repo-level agent hooks never fire.
function runCli(
  bin: string,
  args: string[],
  input: string,
  cwd = tmpdir()
): string {
  const result = spawnSync(bin, args, {
    input,
    cwd,
    encoding: 'utf8',
    timeout: 240_000,
    maxBuffer: 8 << 20,
  });
  if (result.status !== 0)
    throw new Error(
      `${bin} exited ${result.status}: ${(result.stderr ?? '').slice(0, 160)}`
    );
  return result.stdout;
}

/** anthropic/* -> Claude Code CLI, openai/* -> Codex CLI, zai/* -> AI Gateway. */
export function routedTransport(
  apiKey?: string,
  policy?: GatewayRequestPolicy
): JudgeTransport {
  const gateway = apiKey
    ? gatewayTransport(apiKey, undefined, policy)
    : undefined;
  const send: JudgeTransport = async request => {
    const [family, name = ''] = request.model.split('/');
    const input = `${request.system}\n\n${request.prompt}`;
    if (family === 'anthropic') {
      // Claude CLI model ids use dashes: claude-opus-5.5 -> claude-opus-5-5.
      return runCli(
        'claude',
        [
          '-p',
          '--model',
          name.replace(/\./g, '-'),
          '--output-format',
          'text',
          '--no-session-persistence',
          '--disallowedTools',
          'Bash,Edit,Write,Read,WebFetch,WebSearch',
        ],
        input
      );
    }
    if (family === 'openai') {
      const dir = mkdtempSync(join(tmpdir(), 'copy-judge-'));
      try {
        runCli(
          CODEX_BIN,
          [
            'exec',
            // User/repo hooks (e.g. a Stop hook) hang non-interactive exec.
            '-c',
            'features.hooks=false',
            '-c',
            'features.codex_hooks=false',
            '--skip-git-repo-check',
            '--sandbox',
            'read-only',
            '-m',
            name,
            '-o',
            join(dir, 'out.txt'),
            '-',
          ],
          input,
          dir
        );
        return readFileSync(join(dir, 'out.txt'), 'utf8');
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    }
    if (!gateway) throw new Error('AI_GATEWAY_API_KEY missing');
    return gateway(request);
  };
  send.available = model => {
    const family = model.split('/')[0];
    if (family === 'anthropic') return installed('claude');
    if (family === 'openai') return installed(CODEX_BIN);
    return gateway?.available?.(model) ?? false;
  };
  return send;
}
