#!/usr/bin/env node
/**
 * Launch the unpacked or dev Electron shell with optional CDP debugging.
 *
 * Remote debugging is opt-in via JOVIE_DEV=1 so packaged staging/local shells
 * never expose a CDP port by default. When enabled, the port binds to loopback
 * only (127.0.0.1).
 *
 * Usage:
 *   node scripts/launch-electron.mjs [-- <extra electron args>]
 *
 * Env:
 *   JOVIE_DEV=1                  Enable --remote-debugging-port (default off)
 *   JOVIE_ELECTRON_CDP_PORT=9223 Loopback CDP port when JOVIE_DEV=1
 */

import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const desktopRoot = path.join(__dirname, '..');
const require = createRequire(import.meta.url);

const electronBinary = require('electron');
const rawArgs = process.argv.slice(2);
// Strip a leading '--' so the documented `-- <extra args>` usage doesn't make
// Chromium stop switch-parsing at the bare separator.
const extraArgs = rawArgs[0] === '--' ? rawArgs.slice(1) : rawArgs;
const electronArgs = ['.'];

if (process.env.JOVIE_DEV === '1') {
  const port = Number.parseInt(
    process.env.JOVIE_ELECTRON_CDP_PORT ?? '9223',
    10
  );
  if (!Number.isFinite(port) || port <= 0 || port > 65535) {
    console.error(
      '[launch-electron] JOVIE_ELECTRON_CDP_PORT must be a valid TCP port.'
    );
    process.exit(1);
  }

  electronArgs.push(
    `--remote-debugging-port=${port}`,
    '--remote-debugging-address=127.0.0.1'
  );
  console.log(
    `[launch-electron] CDP enabled on http://127.0.0.1:${port} (JOVIE_DEV=1)`
  );
}

electronArgs.push(...extraArgs);

const child = spawn(electronBinary, electronArgs, {
  cwd: desktopRoot,
  stdio: 'inherit',
  env: process.env,
});

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 0);
});

child.on('error', error => {
  console.error('[launch-electron] Failed to start Electron:', error);
  process.exit(1);
});
