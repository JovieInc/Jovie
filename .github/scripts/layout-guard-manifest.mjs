#!/usr/bin/env node
import { existsSync } from 'node:fs';

export const REQUIRED_LAYOUT_GUARD_SPECS = ['tests/e2e/hud-scroll.spec.ts'];

export const OPTIONAL_LAYOUT_GUARD_SPECS = [
  'tests/e2e/marketing-document-scroll.spec.ts',
];

export function selectLayoutGuardSpecs(fileExists = existsSync) {
  for (const spec of REQUIRED_LAYOUT_GUARD_SPECS) {
    if (!fileExists(spec)) {
      throw new Error(`Layout Guard contract missing required spec: ${spec}`);
    }
  }

  return [
    ...REQUIRED_LAYOUT_GUARD_SPECS,
    ...OPTIONAL_LAYOUT_GUARD_SPECS.filter(spec => fileExists(spec)),
  ];
}

if (process.argv[1] === new URL(import.meta.url).pathname) {
  try {
    process.stdout.write(`${selectLayoutGuardSpecs().join('\n')}\n`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`::error::${message}\n`);
    process.exitCode = 1;
  }
}
