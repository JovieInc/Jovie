#!/usr/bin/env node

import { readFileSync, realpathSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

import {
  DEFAULT_BASE_URL,
  type FetchImplementation,
  fetchArtist,
  fetchArtistLlms,
  fetchOpenApi,
  fetchSiteLlms,
  JovieRequestError,
  normalizeBaseUrl,
} from './client.js';

export const CLI_VERSION_FALLBACK = '0.0.0-private';

export function packageVersionFromText(manifestText: string): string {
  try {
    const parsed: unknown = JSON.parse(manifestText);
    if (
      parsed !== null &&
      typeof parsed === 'object' &&
      !Array.isArray(parsed)
    ) {
      const version = (parsed as { readonly version?: unknown }).version;
      if (typeof version === 'string' && version.trim()) {
        return version.trim();
      }
    }
  } catch {
    // Source and private worktrees may not have a release version yet.
  }
  return CLI_VERSION_FALLBACK;
}

export function resolveCliVersion(
  manifestPath = resolve(
    dirname(fileURLToPath(import.meta.url)),
    '../package.json'
  )
): string {
  try {
    return packageVersionFromText(readFileSync(manifestPath, 'utf8'));
  } catch {
    return CLI_VERSION_FALLBACK;
  }
}

const CLI_VERSION = resolveCliVersion();

export interface CliOutput {
  write(chunk: string): unknown;
}

export interface CliDependencies {
  readonly fetchImpl?: FetchImplementation;
  readonly stdout?: CliOutput;
  readonly stderr?: CliOutput;
}

type CliValues = {
  readonly baseUrl?: string;
  readonly full?: boolean;
  readonly help?: boolean;
  readonly json?: boolean;
  readonly version?: boolean;
};

class UsageError extends Error {
  readonly code = 'USAGE_ERROR' as const;
}

const USAGE = `Usage: jovie <command> [options]

Read-only public Jovie resources for agents and scripts. No login, API key,
OAuth flow, file writes, or mutation is performed.

Commands:
  artist get <username>  Fetch an artist profile from GET /api/v1/{username}
  artist llms <username> Fetch an artist guide from GET /{username}/llms.txt
  api openapi            Fetch the public OpenAPI contract
  docs llms               Fetch /llms.txt (use --full for /llms-full.txt)

Options:
  --base-url <url>       Compatible Jovie deployment origin (default: ${DEFAULT_BASE_URL})
  --json                 Emit compact JSON; text resources use {"content":"..."}
  --full                 Fetch /llms-full.txt (only with docs llms)
  -h, --help             Show this help
  -v, --version          Show the pre-release CLI version

Examples:
  jovie artist get <artist-username> --json
  jovie artist llms <artist-username>
  jovie api openapi --json
  jovie docs llms --full
`;

function writeLine(output: CliOutput, value: string): void {
  output.write(`${value}\n`);
}

function writeText(output: CliOutput, value: string): void {
  output.write(value.endsWith('\n') ? value : `${value}\n`);
}

function errorPayload(error: unknown): Record<string, unknown> {
  if (error instanceof JovieRequestError) {
    return {
      code: error.code,
      message: error.message,
      ...(error.status === undefined ? {} : { status: error.status }),
      ...(error.responseBody ? { responseBody: error.responseBody } : {}),
    };
  }

  if (error instanceof UsageError) {
    return { code: error.code, message: error.message };
  }

  return {
    code: 'CLI_ERROR',
    message: error instanceof Error ? error.message : String(error),
  };
}

function parseCliArgs(argv: readonly string[]): {
  readonly values: CliValues;
  readonly positionals: readonly string[];
} {
  const parsed = parseArgs({
    args: [...argv],
    options: {
      'base-url': { type: 'string' },
      full: { type: 'boolean' },
      help: { type: 'boolean', short: 'h' },
      json: { type: 'boolean' },
      version: { type: 'boolean', short: 'v' },
    },
    allowPositionals: true,
    strict: true,
  });

  const values = parsed.values as {
    readonly 'base-url'?: string;
    readonly full?: boolean;
    readonly help?: boolean;
    readonly json?: boolean;
    readonly version?: boolean;
  };

  return {
    values: {
      baseUrl: values['base-url'],
      full: values.full,
      help: values.help,
      json: values.json,
      version: values.version,
    },
    positionals: parsed.positionals,
  };
}

function requireCommand(
  positionals: readonly string[],
  expected: readonly string[]
): void {
  if (
    positionals.length !== expected.length ||
    expected.some((value, index) => positionals[index] !== value)
  ) {
    throw new UsageError(`Expected command: ${expected.join(' ')}`);
  }
}

async function execute(
  positionals: readonly string[],
  values: CliValues,
  fetchImpl?: FetchImplementation
): Promise<string | unknown> {
  const baseUrl = normalizeBaseUrl(values.baseUrl);
  const options = { baseUrl, fetchImpl };
  const [domain, action, argument] = positionals;

  if (
    domain === 'artist' &&
    action === 'get' &&
    argument &&
    positionals.length === 3
  ) {
    if (values.full) {
      throw new UsageError('--full is only supported by docs llms');
    }
    return fetchArtist(argument, options);
  }

  if (
    domain === 'artist' &&
    action === 'llms' &&
    argument &&
    positionals.length === 3
  ) {
    if (values.full) {
      throw new UsageError('--full is only supported by docs llms');
    }
    return fetchArtistLlms(argument, options);
  }

  if (domain === 'api' && action === 'openapi') {
    requireCommand(positionals, ['api', 'openapi']);
    if (values.full) {
      throw new UsageError('--full is only supported by docs llms');
    }
    return fetchOpenApi(options);
  }

  if (domain === 'docs' && action === 'llms') {
    requireCommand(positionals, ['docs', 'llms']);
    return fetchSiteLlms(values.full === true, options);
  }

  throw new UsageError(`Unknown command: ${positionals.join(' ') || '(none)'}`);
}

export async function runCli(
  argv: readonly string[],
  dependencies: CliDependencies = {}
): Promise<number> {
  const stdout = dependencies.stdout ?? process.stdout;
  const stderr = dependencies.stderr ?? process.stderr;
  const requestedJson = argv.includes('--json');
  let parsed: ReturnType<typeof parseCliArgs>;

  try {
    parsed = parseCliArgs(argv);
  } catch (error) {
    const payload = errorPayload(error);
    if (requestedJson) {
      writeLine(stdout, JSON.stringify({ error: payload }));
    } else {
      writeLine(stderr, `${payload.message}`);
      writeLine(stderr, 'Run `jovie --help` for usage.');
    }
    return 2;
  }

  const { values, positionals } = parsed;
  if (values.version) {
    writeLine(stdout, CLI_VERSION);
    return 0;
  }

  if (values.help || positionals.length === 0) {
    writeText(stdout, USAGE);
    return 0;
  }

  try {
    const result = await execute(positionals, values, dependencies.fetchImpl);
    if (typeof result === 'string') {
      if (values.json) {
        writeLine(stdout, JSON.stringify({ content: result }));
      } else {
        writeText(stdout, result);
      }
    } else {
      writeLine(stdout, JSON.stringify(result, null, values.json ? 0 : 2));
    }
    return 0;
  } catch (error) {
    const payload = errorPayload(error);
    if (requestedJson || values.json) {
      writeLine(stdout, JSON.stringify({ error: payload }));
    } else {
      writeLine(stderr, payload.message as string);
    }
    return error instanceof UsageError ? 2 : 1;
  }
}

const isMain =
  process.argv[1] !== undefined &&
  realpathSync(fileURLToPath(import.meta.url)) ===
    realpathSync(resolve(process.argv[1]));

if (isMain) {
  runCli(process.argv.slice(2)).then(code => {
    process.exitCode = code;
  });
}
