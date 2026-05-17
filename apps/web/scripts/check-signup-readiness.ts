#!/usr/bin/env tsx
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parse } from 'dotenv';
import {
  checkSignupOnboardingReadiness,
  formatSignupOnboardingReadinessReport,
  type SignupOnboardingReadinessSource,
  type SignupOnboardingReadinessTarget,
} from '@/lib/readiness/signup-onboarding';

interface CliOptions {
  readonly target: SignupOnboardingReadinessTarget;
  readonly source: SignupOnboardingReadinessSource;
  readonly file?: string;
}

function parseArgValue(arg: string, name: string): string | null {
  const prefix = `${name}=`;
  if (arg.startsWith(prefix)) return arg.slice(prefix.length);
  return null;
}

function parseCliArgs(argv: readonly string[]): CliOptions {
  let target: SignupOnboardingReadinessTarget = 'prd';
  let source: SignupOnboardingReadinessSource = 'env';
  let file: string | undefined;

  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index]!;
    const targetValue =
      parseArgValue(arg, '--target') ??
      (arg === '--target' ? argv[++index] : null);
    const sourceValue =
      parseArgValue(arg, '--source') ??
      (arg === '--source' ? argv[++index] : null);
    const fileValue =
      parseArgValue(arg, '--file') ?? (arg === '--file' ? argv[++index] : null);

    if (targetValue) {
      if (!['prd', 'stg', 'local'].includes(targetValue)) {
        throw new Error(`Invalid --target: ${targetValue}`);
      }
      target = targetValue as SignupOnboardingReadinessTarget;
      continue;
    }

    if (sourceValue) {
      if (!['env', 'vercel-file'].includes(sourceValue)) {
        throw new Error(`Invalid --source: ${sourceValue}`);
      }
      source = sourceValue as SignupOnboardingReadinessSource;
      continue;
    }

    if (fileValue) {
      file = fileValue;
      continue;
    }

    if (arg === '--help' || arg === '-h') {
      printUsage();
      process.exit(0);
    }
  }

  return { target, source, file };
}

function defaultVercelEnvFile(target: SignupOnboardingReadinessTarget): string {
  if (target === 'prd') return '.vercel/.env.production.local';
  if (target === 'stg') return '.vercel/.env.preview.local';
  return '.env.local';
}

function readEnvFile(path: string): Record<string, string> {
  const resolvedPath = resolve(process.cwd(), path);
  if (!existsSync(resolvedPath)) {
    throw new Error(`Env file not found: ${path}`);
  }
  return parse(readFileSync(resolvedPath));
}

function printUsage() {
  console.log(`Usage: tsx scripts/check-signup-readiness.ts [options]

Options:
  --target=prd|stg|local       Environment target (default: prd)
  --source=env|vercel-file     Read current process env or a pulled Vercel env file
  --file=<path>                Env file path when --source=vercel-file

Examples:
  doppler run --config prd -- tsx scripts/check-signup-readiness.ts --target=prd
  vercel env pull .vercel/.env.production.local --environment=production
  tsx scripts/check-signup-readiness.ts --target=prd --source=vercel-file
`);
}

async function main() {
  const options = parseCliArgs(process.argv.slice(2));
  const env =
    options.source === 'env'
      ? process.env
      : readEnvFile(options.file ?? defaultVercelEnvFile(options.target));

  const result = checkSignupOnboardingReadiness({
    env,
    target: options.target,
    source: options.source,
  });

  console.log(formatSignupOnboardingReadinessReport(result));
  process.exit(result.ok ? 0 : 1);
}

main().catch(error => {
  console.error(
    `[signup-readiness] crashed: ${
      error instanceof Error ? error.message : String(error)
    }`
  );
  process.exit(1);
});
