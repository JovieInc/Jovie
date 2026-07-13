#!/usr/bin/env node

import { spawn } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import process from 'node:process';

const ROOT = resolve(import.meta.dirname, '..');
const PROBES = [
  {
    category: 'application',
    path: 'apps/web/lib/hud/number-series.ts',
    symbol: '__typecheckSafetyProbe0',
  },
  {
    category: 'shared-package-cross-import',
    path: 'packages/ui/lib/utils.ts',
    symbol: '__typecheckSafetyProbe1',
  },
  {
    category: 'test',
    path: 'apps/web/lib/hud/linear-actions.test.ts',
    symbol: '__typecheckSafetyProbe2',
  },
  {
    category: 'generated-client-boundary',
    path: 'apps/web/lib/design/generated/design-tokens.ts',
    symbol: '__typecheckSafetyProbe3',
  },
];
const edits = new Map();
let restored = false;
let activeCommand = null;
const MAX_CAPTURED_OUTPUT_CHARACTERS = 100 * 1024 * 1024;

function restore() {
  if (restored) return;
  restored = true;
  for (const [path, edit] of edits) {
    const current = readFileSync(path, 'utf8');
    if (current === edit.mutated) {
      writeFileSync(path, edit.original);
      continue;
    }
    const markerIndex = current.lastIndexOf(edit.marker);
    if (markerIndex !== -1) {
      writeFileSync(
        path,
        `${current.slice(0, markerIndex)}${current.slice(markerIndex + edit.marker.length)}`
      );
    }
  }
}

function signalCommandTree(commandState, signal) {
  try {
    if (process.platform === 'win32') commandState.child.kill(signal);
    else process.kill(-commandState.child.pid, signal);
  } catch {
    // The child may exit between the active-state check and signal delivery.
  }
}

async function terminateActiveCommand(signal) {
  const commandState = activeCommand;
  if (!commandState) return;
  signalCommandTree(commandState, signal);
  let timedOut = false;
  await Promise.race([
    commandState.completion.catch(() => {}),
    new Promise(resolveTimeout => {
      setTimeout(() => {
        timedOut = true;
        resolveTimeout();
      }, 2000).unref();
    }),
  ]);
  if (timedOut && activeCommand === commandState) {
    signalCommandTree(commandState, 'SIGKILL');
    await commandState.completion.catch(() => {});
  }
}

async function execute(command) {
  const child = spawn(command[0], command.slice(1), {
    cwd: ROOT,
    env: process.env,
    detached: process.platform !== 'win32',
  });
  let output = '';
  const capture = chunk => {
    output = `${output}${chunk}`.slice(-MAX_CAPTURED_OUTPUT_CHARACTERS);
  };
  child.stdout.setEncoding('utf8');
  child.stderr.setEncoding('utf8');
  child.stdout.on('data', capture);
  child.stderr.on('data', capture);
  const completion = new Promise((resolveExit, reject) => {
    child.once('error', reject);
    child.once('close', code => resolveExit(code ?? 1));
  });
  const commandState = { child, completion };
  activeCommand = commandState;
  try {
    const status = await completion;
    return { result: { status }, output };
  } finally {
    if (activeCommand === commandState) activeCommand = null;
  }
}

async function runClean(label, command) {
  const { result, output } = await execute(command);
  if (result.status !== 0) {
    throw new Error(`${label} baseline is not clean\n${output.slice(-4000)}`);
  }
}

async function runProbe(label, command) {
  const { result, output } = await execute(command);
  if (result.status === 0) {
    throw new Error(`${label} unexpectedly accepted intentional type errors`);
  }
  const missing = PROBES.filter(probe => {
    const relativeToWeb = probe.path.replace(/^apps\/web\//, '');
    const edit = edits.get(resolve(ROOT, probe.path));
    const expectedDiagnostic = `(${edit.expectedLine},7): error TS2322`;
    return (
      (!output.includes(probe.path) && !output.includes(relativeToWeb)) ||
      !output.includes(expectedDiagnostic)
    );
  });
  if (missing.length > 0) {
    throw new Error(
      `${label} missed probes: ${missing.map(probe => probe.category).join(', ')}\n${output.slice(-4000)}`
    );
  }
  console.log(
    `[typecheck-safety-probe] ${label}: caught ${PROBES.length}/${PROBES.length}`
  );
  return output;
}

async function main() {
  for (const [signal, exitCode] of [
    ['SIGINT', 130],
    ['SIGTERM', 143],
  ]) {
    process.once(signal, async () => {
      restore();
      await terminateActiveCommand(signal);
      process.exit(exitCode);
    });
  }

  try {
    const nativeCommand = [
      'pnpm',
      '--filter',
      '@jovie/web',
      'exec',
      'tsgo',
      '-p',
      'tsconfig.typecheck.json',
      '--noEmit',
      '--tsBuildInfoFile',
      '.cache/tsbuildinfo-native-probe',
      '--pretty',
      'false',
    ];
    const stableCommand = [
      'pnpm',
      '--filter',
      '@jovie/web',
      'exec',
      'tsc',
      '-p',
      'tsconfig.typecheck.json',
      '--noEmit',
      '--incremental',
      '--tsBuildInfoFile',
      '.cache/tsbuildinfo-stable-probe',
      '--pretty',
      'false',
    ];
    await runClean('TS7 native', nativeCommand);
    await runClean('TS6 stable', stableCommand);

    for (const probe of PROBES) {
      const absolutePath = resolve(ROOT, probe.path);
      const original = readFileSync(absolutePath, 'utf8');
      const marker = `\nconst ${probe.symbol}: string = 42;\n`;
      const mutated = `${original}${marker}`;
      edits.set(absolutePath, {
        original,
        mutated,
        marker,
        expectedLine: original.split('\n').length + 1,
      });
      writeFileSync(absolutePath, mutated);
    }

    await runProbe('TS7 native', nativeCommand);
    await runProbe('TS6 stable', stableCommand);
  } finally {
    restore();
  }
  console.log(
    '[typecheck-safety-probe] native/stable error coverage is equivalent'
  );
}

main().catch(error => {
  console.error(error instanceof Error ? error.stack : error);
  process.exitCode = 1;
});
