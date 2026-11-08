import { spawn } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

const RUNTIME_ENV_KEYS = new Set([
  'HOME',
  'PATH',
  'USER',
  'LOGNAME',
  'SHELL',
  'LANG',
  'LC_ALL',
  'LC_CTYPE',
  'TERM',
  'TMPDIR',
  'TMP',
  'TEMP',
  'SSH_AUTH_SOCK',
  'CODEX_HOME',
  'XDG_CONFIG_HOME',
  'XDG_CACHE_HOME',
  'XDG_DATA_HOME',
]);

export function runtimeEnvironment(env = process.env) {
  return Object.fromEntries(
    Object.entries(env).filter(([key]) => RUNTIME_ENV_KEYS.has(key))
  );
}

/** Existing Devin CLI/account, unchanged permissions and model; no tools needed for a nonce. */
export function devin(
  prompt,
  { binary, cwd, state, timeoutMs, log },
  spawnProcess = spawn
) {
  const id = randomUUID();
  const input = join(state, `devin-prompt-${id}.txt`);
  const transcript = join(state, `devin-transcript-${id}.md`);
  writeFileSync(input, prompt, { mode: 0o600 });
  return new Promise(resolve => {
    const child = spawnProcess(
      binary,
      ['--print', '--prompt-file', input, '--export', transcript],
      {
        cwd,
        stdio: ['ignore', 'pipe', 'pipe'],
        env: runtimeEnvironment(),
      }
    );
    let text = '';
    let stderr = '';
    const kill = setTimeout(() => child.kill('SIGTERM'), timeoutMs);
    child.stdout.on('data', data => {
      text += data.toString();
    });
    child.stderr.on('data', data => {
      stderr += data.toString();
    });
    log('runtime.started', {
      runtime: 'devin',
      pid: child.pid,
      executor: binary,
      cwd,
      transcript,
    });
    child.on('error', error => {
      clearTimeout(kill);
      log('runtime.error', { runtime: 'devin', error: String(error) });
      resolve({ code: -1, text: '' });
    });
    child.on('close', code => {
      clearTimeout(kill);
      text = text.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '').trim();
      const refused =
        /requires? confirmation|blocked by.{0,40}confirmation|cannot.{0,40}non.interactive|untrusted directory/i.test(
          text + '\n' + stderr
        );
      const result = {
        code: refused ? 1 : code,
        text: code === 0 && !refused ? text : '',
      };
      writeFileSync(join(state, `devin-output-${id}.txt`), text, {
        mode: 0o600,
        flush: true,
      });
      log('runtime.finished', {
        runtime: 'devin',
        pid: child.pid,
        code: result.code,
        refused,
        outputChars: text.length,
        outputSha256: createHash('sha256').update(text).digest('hex'),
        transcript,
      });
      resolve(result);
    });
  });
}
