#!/usr/bin/env node

import { readFileSync, realpathSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

import {
  DEFAULT_BASE_URL,
  type FetchImplementation,
  JovieInputError,
  JovieRequestError,
  normalizeBaseUrl,
} from './client.js';
import { COMMANDS, findCommand } from './commands.js';
import { installSkill } from './init.js';
import { serveMcp } from './mcp.js';
import { SKILL_MD } from './skill.js';

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
  readonly stdin?: NodeJS.ReadableStream;
  readonly homeDir?: string;
}

type CliValues = {
  readonly baseUrl?: string;
  readonly dir?: string;
  readonly full?: boolean;
  readonly help?: boolean;
  readonly json?: boolean;
  readonly version?: boolean;
};

class UsageError extends Error {
  readonly code = 'USAGE_ERROR' as const;
}

function usage(): string {
  const width = 28;
  const lines = COMMANDS.map(command => {
    const name = [
      ...command.path,
      ...(command.arg ? [`<${command.arg.name}>`] : []),
    ].join(' ');
    return `  ${name.padEnd(width)} ${command.summary}`;
  });
  return `Usage: jovie <command> [options]

Jovie for agents: create artist profiles from Spotify and read public artist
data. No login or API key. Every command supports --json.

Commands:
${lines.join('\n')}
  ${'mcp'.padEnd(width)} Run as an MCP server over stdio (same tools as above)
  ${'init'.padEnd(width)} Install the Jovie skill into Claude, Codex, OpenClaw, Hermes
  ${'skill'.padEnd(width)} Print the Jovie SKILL.md

Options:
  --base-url <url>       Compatible Jovie deployment origin (default: ${DEFAULT_BASE_URL})
  --json                 Emit compact JSON; text resources use {"content":"..."}
  --full                 Fetch /llms-full.txt (only with docs llms)
  --dir <path>           Skills directory for init (default: every installed agent)
  -h, --help             Show this help
  -v, --version          Show the installed CLI version

Examples:
  jovie profile create https://open.spotify.com/artist/<id> --json
  jovie artist get <username> --json
  npx -y @jovie/cli mcp
`;
}

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
      ...(error.apiCode ? { apiCode: error.apiCode } : {}),
      ...(error.status === undefined ? {} : { status: error.status }),
      ...(error.responseBody ? { responseBody: error.responseBody } : {}),
      ...(error.retryAfterSeconds === undefined
        ? {}
        : { retryAfterSeconds: error.retryAfterSeconds }),
    };
  }

  if (error instanceof JovieInputError) {
    return { code: error.code, message: error.message };
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
      dir: { type: 'string' },
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
    readonly dir?: string;
    readonly full?: boolean;
    readonly help?: boolean;
    readonly json?: boolean;
    readonly version?: boolean;
  };

  return {
    values: {
      baseUrl: values['base-url'],
      dir: values.dir,
      full: values.full,
      help: values.help,
      json: values.json,
      version: values.version,
    },
    positionals: parsed.positionals,
  };
}

async function execute(
  positionals: readonly string[],
  values: CliValues,
  dependencies: CliDependencies
): Promise<string | unknown> {
  const baseUrl = normalizeBaseUrl(values.baseUrl);
  const [first] = positionals;

  if (positionals.length === 1 && first === 'skill') return SKILL_MD;
  if (positionals.length === 1 && first === 'init') {
    return installSkill(dependencies.homeDir ?? homedir(), values.dir);
  }

  const command = findCommand(positionals);
  const expectedLength = command?.arg ? 3 : 2;
  if (!command || positionals.length !== expectedLength) {
    throw new UsageError(`Unknown command: ${positionals.join(' ')}`);
  }
  if (values.full && !command.acceptsFull) {
    throw new UsageError('--full is only supported by docs llms');
  }
  return command.run(
    { arg: positionals[2], full: values.full === true },
    {
      baseUrl,
      fetchImpl: dependencies.fetchImpl,
      userAgent: `jovie-cli/${CLI_VERSION}`,
    }
  );
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
    const usageError = new UsageError(
      error instanceof Error ? error.message : String(error)
    );
    const payload = errorPayload(usageError);
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
    writeText(stdout, usage());
    return 0;
  }

  if (positionals.length === 1 && positionals[0] === 'mcp') {
    try {
      await serveMcp((dependencies.stdin ?? process.stdin) as never, stdout, {
        version: CLI_VERSION,
        baseUrl: normalizeBaseUrl(values.baseUrl),
        fetchImpl: dependencies.fetchImpl,
      });
      return 0;
    } catch (error) {
      writeLine(stderr, errorPayload(error).message as string);
      return 2;
    }
  }

  try {
    const result = await execute(positionals, values, dependencies);
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
    return error instanceof UsageError || error instanceof JovieInputError
      ? 2
      : 1;
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
