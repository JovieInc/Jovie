#!/usr/bin/env tsx
import {
  chmodSync,
  lstatSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  renameSync,
  rmdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { REQUIRED_SIGNUP_ONBOARDING_ENV_KEYS } from '@/lib/readiness/signup-onboarding';
import { resolveEnvFilePath } from './check-signup-readiness';

// @next/env expands `$NAME` references while loading dotenv files. Reject
// expansion syntax instead of risking a canonical value being silently changed.
const SAFE_UNQUOTED_ENV_VALUE = /^[^\s"'#$\\\0]+$/u;

interface ReconcileFileOps {
  readonly rename: typeof renameSync;
}

const DEFAULT_FILE_OPS: ReconcileFileOps = { rename: renameSync };

function requiredValue(
  env: NodeJS.ProcessEnv,
  key: (typeof REQUIRED_SIGNUP_ONBOARDING_ENV_KEYS)[number]
): string {
  const value = env[key];
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`Missing canonical build environment value: ${key}`);
  }
  return value;
}

function canonicalOverrides(env: NodeJS.ProcessEnv): string {
  return REQUIRED_SIGNUP_ONBOARDING_ENV_KEYS.map(key => {
    const value = requiredValue(env, key);
    if (!SAFE_UNQUOTED_ENV_VALUE.test(value)) {
      throw new Error(
        `Canonical build environment value is not safely serializable: ${key}`
      );
    }
    return `${key}=${value}`;
  }).join('\n');
}

export function reconcileVercelBuildEnv(
  path: string,
  env: NodeJS.ProcessEnv = process.env,
  fileOps: ReconcileFileOps = DEFAULT_FILE_OPS
): number {
  const lexicalPath = resolve(path);
  const stat = lstatSync(lexicalPath);
  if (stat.isSymbolicLink() || !stat.isFile()) {
    throw new Error('Vercel build environment file must be a regular file');
  }
  const canonicalPath = realpathSync(lexicalPath);

  const original = readFileSync(canonicalPath, 'utf8');
  const overrides = canonicalOverrides(env);
  const separator =
    original.length === 0 || original.endsWith('\n') ? '' : '\n';
  const reconciled = `${original}${separator}${overrides}\n`;

  const temporaryDirectory = mkdtempSync(`${canonicalPath}.reconcile-`);
  const temporaryPath = resolve(temporaryDirectory, 'environment');
  try {
    writeFileSync(temporaryPath, reconciled, {
      flag: 'wx',
      mode: 0o600,
    });
    fileOps.rename(temporaryPath, canonicalPath);
    chmodSync(canonicalPath, 0o600);
  } finally {
    rmSync(temporaryPath, { force: true });
    rmdirSync(temporaryDirectory);
  }

  return REQUIRED_SIGNUP_ONBOARDING_ENV_KEYS.length;
}

function fileArgument(argv: readonly string[]): string {
  const argument = argv.find(value => value.startsWith('--file='));
  return argument?.slice('--file='.length) ?? '.vercel/.env.production.local';
}

function main() {
  const path = resolveEnvFilePath(fileArgument(process.argv.slice(2)));
  const count = reconcileVercelBuildEnv(path);
  console.log(`[vercel-build-env] reconciled ${count} canonical keys`);
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  try {
    main();
  } catch (error) {
    console.error(
      `[vercel-build-env] failed: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
    process.exit(1);
  }
}
