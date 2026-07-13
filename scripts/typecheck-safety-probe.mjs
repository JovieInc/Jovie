#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
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

function execute(command) {
  const result = spawnSync(command[0], command.slice(1), {
    cwd: ROOT,
    encoding: 'utf8',
    env: process.env,
    maxBuffer: 100 * 1024 * 1024,
  });
  const output = `${result.stdout ?? ''}${result.stderr ?? ''}`;
  return { result, output };
}

function runClean(label, command) {
  const { result, output } = execute(command);
  if (result.status !== 0) {
    throw new Error(`${label} baseline is not clean\n${output.slice(-4000)}`);
  }
}

function runProbe(label, command) {
  const { result, output } = execute(command);
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

function main() {
  process.once('SIGINT', () => {
    restore();
    process.exit(130);
  });
  process.once('SIGTERM', () => {
    restore();
    process.exit(143);
  });

  try {
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
    restore();
    runClean('TS7 native', nativeCommand);
    runClean('TS6 stable', stableCommand);
    restored = false;
    for (const [path, edit] of edits) writeFileSync(path, edit.mutated);
    runProbe('TS7 native', nativeCommand);
    runProbe('TS6 stable', stableCommand);
  } finally {
    restore();
  }
  console.log(
    '[typecheck-safety-probe] native/stable error coverage is equivalent'
  );
}

main();
