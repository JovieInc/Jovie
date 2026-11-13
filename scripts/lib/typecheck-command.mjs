import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import process from 'node:process';

const ROOT = resolve(import.meta.dirname, '../..');
const MAX_BUFFER = 64 * 1024 * 1024;
let activeCommandStop = null;

export function stopActiveCommand() {
  activeCommandStop?.();
}

export async function commandResult(command, env = {}, timeoutMs = Infinity) {
  const timeArgs = process.platform === 'darwin' ? ['-l'] : ['-v'];
  const timed = existsSync('/usr/bin/time');
  const executable = timed ? '/usr/bin/time' : command[0];
  const args = timed ? [...timeArgs, ...command] : command.slice(1);
  const started = process.hrtime.bigint();
  const result = await new Promise(resolve => {
    if (timeoutMs <= 0) {
      resolve({ status: 1, timedOut: true, stdout: '', stderr: '' });
      return;
    }
    const child = spawn(executable, args, {
      cwd: ROOT,
      // The slot launcher must keep tsc inside this owned process group.
      env: { ...process.env, ...env, JOVIE_PREFLIGHT_MANAGED_GROUP: '1' },
      detached: process.platform !== 'win32',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    let timedOut = false;
    let failed = false;
    const stop = () => {
      if (!child.pid) return;
      // Kill time/corepack/turbo/tsc together, including inherited pipe owners.
      try {
        if (process.platform === 'win32') child.kill('SIGKILL');
        else process.kill(-child.pid, 'SIGKILL');
      } catch (error) {
        if (error.code !== 'ESRCH') throw error;
      }
    };
    activeCommandStop = stop;
    const timer = Number.isFinite(timeoutMs)
      ? setTimeout(() => {
          timedOut = true;
          stop();
        }, timeoutMs)
      : null;
    const collect = (chunk, isError) => {
      if (isError) stderr += chunk;
      else stdout += chunk;
      if (Buffer.byteLength(stdout) + Buffer.byteLength(stderr) > MAX_BUFFER) {
        failed = true;
        stop();
      }
    };
    child.stdout.setEncoding('utf8').on('data', chunk => collect(chunk, false));
    child.stderr.setEncoding('utf8').on('data', chunk => collect(chunk, true));
    child.on('error', error => {
      failed = true;
      stderr += error.message;
    });
    child.on('close', status => {
      clearTimeout(timer);
      activeCommandStop = null;
      resolve({
        status: failed || timedOut ? 1 : status,
        stdout,
        stderr,
        timedOut,
      });
    });
  });
  const durationMs = Number(process.hrtime.bigint() - started) / 1e6;
  const output = `${result.stdout ?? ''}\n${result.stderr ?? ''}`;
  const user = metric(output, /User time \(seconds\):\s*([\d.]+)/i);
  const system = metric(output, /System time \(seconds\):\s*([\d.]+)/i);
  const mac = output.match(
    /([\d.]+)\s+real\s+([\d.]+)\s+user\s+([\d.]+)\s+sys/i
  );
  const cpuSeconds =
    user === null || system === null
      ? mac
        ? Number(mac[2]) + Number(mac[3])
        : null
      : user + system;
  return {
    durationMs,
    exitCode: result.status ?? 1,
    timedOut: result.timedOut,
    output,
    cpuPercent:
      cpuSeconds === null ? null : (cpuSeconds * 100_000) / durationMs,
    peakRssKb:
      metric(output, /Maximum resident set size \(kbytes\):\s*(\d+)/i) ??
      ((metric(output, /(\d+)\s+maximum resident set size/i) ?? 0) / 1024 ||
        null),
  };
}

function metric(text, pattern) {
  const value = Number(pattern.exec(text)?.[1]);
  return Number.isFinite(value) ? value : null;
}
