#!/usr/bin/env tsx
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parse } from 'dotenv';
import {
  formatSignedInAuthProbeReport,
  formatSignedInAuthReport,
  probeSignedInAuthDeployment,
  type SignedInAuthSource,
  type SignedInAuthTarget,
  verifySignedInAuthConfig,
} from '@/lib/readiness/signed-in-auth';

interface CliOptions {
  readonly target: SignedInAuthTarget;
  readonly source: SignedInAuthSource;
  readonly file?: string;
  readonly probe: boolean;
  readonly baseUrl?: string;
  readonly outputDir?: string;
}

const scriptDir = dirname(fileURLToPath(import.meta.url));
const webRoot = resolve(scriptDir, '..');
const repoRoot = resolve(webRoot, '..', '..');

function parseArgValue(arg: string, name: string): string | null {
  const prefix = `${name}=`;
  if (arg.startsWith(prefix)) return arg.slice(prefix.length);
  return null;
}

function parseCliArgs(argv: readonly string[]): CliOptions {
  let target: SignedInAuthTarget = 'local';
  let source: SignedInAuthSource = 'env';
  let file: string | undefined;
  let probe = false;
  let baseUrl: string | undefined;
  let outputDir: string | undefined;

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
    const baseUrlValue =
      parseArgValue(arg, '--base-url') ??
      (arg === '--base-url' ? argv[++index] : null);
    const outputDirValue =
      parseArgValue(arg, '--output-dir') ??
      (arg === '--output-dir' ? argv[++index] : null);

    if (targetValue) {
      if (!['local', 'stg', 'prd'].includes(targetValue)) {
        throw new Error(`Invalid --target: ${targetValue}`);
      }
      target = targetValue as SignedInAuthTarget;
      continue;
    }

    if (sourceValue) {
      if (!['env', 'vercel-file'].includes(sourceValue)) {
        throw new Error(`Invalid --source: ${sourceValue}`);
      }
      source = sourceValue as SignedInAuthSource;
      continue;
    }

    if (fileValue) {
      file = fileValue;
      continue;
    }

    if (baseUrlValue) {
      baseUrl = baseUrlValue;
      continue;
    }

    if (outputDirValue) {
      outputDir = outputDirValue;
      continue;
    }

    if (arg === '--probe') {
      probe = true;
      continue;
    }

    if (arg === '--help' || arg === '-h') {
      printUsage();
      process.exit(0);
    }
  }

  return { target, source, file, probe, baseUrl, outputDir };
}

function defaultVercelEnvFile(target: SignedInAuthTarget): string {
  if (target === 'prd') return '.vercel/.env.production.local';
  if (target === 'stg') return '.vercel/.env.preview.local';
  return '.env.local';
}

function defaultBaseUrl(target: SignedInAuthTarget): string {
  if (target === 'prd') return 'https://jov.ie';
  if (target === 'stg') return 'https://staging.jov.ie';
  return 'http://localhost:3000';
}

export function resolveEnvFilePath(path: string): string {
  const candidates = isAbsolute(path)
    ? [path]
    : [
        resolve(process.cwd(), path),
        resolve(webRoot, path),
        resolve(repoRoot, path),
      ];
  const resolvedPath = candidates.find(candidate => existsSync(candidate));

  if (!resolvedPath) {
    throw new Error(
      `Env file not found: ${path} (checked ${candidates.join(', ')})`
    );
  }

  return resolvedPath;
}

function readEnvFile(path: string): Record<string, string> {
  const resolvedPath = resolveEnvFilePath(path);
  return parse(readFileSync(resolvedPath));
}

function printUsage() {
  console.log(`Usage: tsx scripts/verify-signed-in-auth.ts [options]

Options:
  --target=local|stg|prd       Environment target (default: local)
  --source=env|vercel-file     Read current process env or a pulled Vercel env file
  --file=<path>                Env file path when --source=vercel-file
  --probe                      Probe a running deployment for Clerk key status
  --base-url=<url>             Base URL for --probe (defaults by target)
  --output-dir=<path>          Write JSON evidence report to this directory

Examples:
  doppler run --config dev -- tsx scripts/verify-signed-in-auth.ts --target=local --probe
  doppler run --config stg -- tsx scripts/verify-signed-in-auth.ts --target=stg
  doppler run --config prd -- tsx scripts/verify-signed-in-auth.ts --target=prd --probe --base-url=https://jov.ie
`);
}

function writeEvidenceReport(
  outputDir: string | undefined,
  payload: Record<string, unknown>
) {
  if (!outputDir) return;

  const resolvedDir = isAbsolute(outputDir)
    ? outputDir
    : resolve(webRoot, outputDir);
  mkdirSync(resolvedDir, { recursive: true });
  const reportPath = resolve(resolvedDir, 'signed-in-auth-report.json');
  writeFileSync(reportPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  console.log(`[signed-in-auth] evidence=${reportPath}`);
}

async function main() {
  const options = parseCliArgs(process.argv.slice(2));
  const env =
    options.source === 'env'
      ? process.env
      : readEnvFile(options.file ?? defaultVercelEnvFile(options.target));

  const configResult = verifySignedInAuthConfig({
    env,
    target: options.target,
    source: options.source,
  });

  console.log(formatSignedInAuthReport(configResult));

  let probeResult = null;
  if (options.probe) {
    const baseUrl = options.baseUrl ?? defaultBaseUrl(options.target);
    probeResult = await probeSignedInAuthDeployment(baseUrl);
    console.log(formatSignedInAuthProbeReport(probeResult));
  }

  writeEvidenceReport(options.outputDir, {
    generatedAt: new Date().toISOString(),
    config: configResult,
    probe: probeResult,
  });

  const ok = configResult.ok && (probeResult ? probeResult.ok : true);
  process.exit(ok ? 0 : 1);
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  main().catch(error => {
    console.error(
      `[signed-in-auth] crashed: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
    process.exit(1);
  });
}
