#!/usr/bin/env node
// Host-wide typecheck semaphore. Only active when GEM_TYPECHECK_SLOTS=<n> is set (gem's
// environment.d); CI and laptops run the command untouched. Callers queue for one of n
// numbered flock files and never fail for waiting. The lock lives on the child process, so a
// killed or OOM-ed typecheck releases its slot. Sized from measurement: one web `tsc` peaks
// near 4.5 GB RSS, so n x 4.5 GB must fit well inside the user slice's MemoryHigh.
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { setTimeout as sleep } from 'node:timers/promises';

const sep = process.argv.indexOf('--');
const command = sep === -1 ? [] : process.argv.slice(sep + 1);
if (command.length === 0) {
  console.error(
    'Usage: node scripts/typecheck-slot.mjs -- <command> [...args]'
  );
  process.exit(1);
}

const slots = Number.parseInt(process.env.GEM_TYPECHECK_SLOTS ?? '', 10);
const NOT_ACQUIRED = 99;
const pollMs =
  Number.parseInt(process.env.GEM_TYPECHECK_POLL_MS ?? '', 10) || 1000;

function run(argv) {
  return new Promise(resolve => {
    // detached: own process group, so a signal to this wrapper reaches flock and the typecheck.
    const child = spawn(argv[0], argv.slice(1), {
      stdio: 'inherit',
      detached: true,
    });
    for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP']) {
      process.on(signal, () => {
        try {
          process.kill(-child.pid, signal);
        } catch {
          // already gone
        }
      });
    }
    child.on('exit', (code, signal) => resolve(code ?? (signal ? 128 : 1)));
    child.on('error', () => resolve(127));
  });
}

if (!Number.isInteger(slots) || slots < 1) {
  process.exit(await run(command));
}

const dir =
  process.env.GEM_TYPECHECK_LOCK_DIR ??
  `${homedir()}/.cache/gem-typecheck-slots`;
mkdirSync(dir, { recursive: true });
let announced = false;
for (let turn = Math.floor(Math.random() * slots); ; turn++) {
  const slot = turn % slots;
  const code = await run([
    'flock',
    '-n',
    '-E',
    String(NOT_ACQUIRED),
    `${dir}/slot-${slot}.lock`,
    ...command,
  ]);
  if (code !== NOT_ACQUIRED) process.exit(code);
  if (!announced) {
    announced = true;
    console.error(
      `[typecheck-slot] all ${slots} typecheck slots busy; queued.`
    );
  }
  if ((turn + 1) % slots === 0) await sleep(pollMs);
}
