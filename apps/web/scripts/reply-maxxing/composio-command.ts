import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export interface CommandOutput {
  readonly stdout: string;
  readonly stderr: string;
  readonly exitCode: number;
}

export type CommandRunner = (args: readonly string[]) => Promise<CommandOutput>;

export interface ComposioToolExecutor {
  (slug: string, input: Readonly<Record<string, unknown>>): Promise<unknown>;
}

interface ExecFileFailure extends Error {
  readonly code?: number | string;
  readonly stdout?: string;
  readonly stderr?: string;
}

export class ComposioResponseParseError extends Error {
  readonly stdout: string;

  constructor(stdout: string) {
    super('Composio returned output that was not valid JSON');
    this.name = 'ComposioResponseParseError';
    this.stdout = stdout;
  }
}

export class ComposioCommandError extends Error {
  readonly command: readonly string[];
  readonly stdout: string;
  readonly stderr: string;
  readonly exitCode: number;
  /** A failed write can have reached the provider before the CLI failed. */
  readonly mayHaveSucceeded: boolean;

  constructor(
    command: readonly string[],
    output: CommandOutput,
    options: { readonly mayHaveSucceeded: boolean }
  ) {
    super(
      `Composio command failed (exit ${output.exitCode}): ${
        output.stderr.trim() || 'no stderr output'
      }`
    );
    this.name = 'ComposioCommandError';
    this.command = command;
    this.stdout = output.stdout;
    this.stderr = output.stderr;
    this.exitCode = output.exitCode;
    this.mayHaveSucceeded = options.mayHaveSucceeded;
  }
}

export class ComposioToolError extends Error {
  readonly slug: string;
  readonly response: unknown;
  /** The provider may have accepted a mutation even when it reported an error. */
  readonly mayHaveSucceeded: boolean;

  constructor(slug: string, response: unknown) {
    const message =
      isRecord(response) && typeof response.error === 'string'
        ? response.error
        : `Composio tool ${slug} reported unsuccessful`;
    super(message);
    this.name = 'ComposioToolError';
    this.slug = slug;
    this.response = response;
    this.mayHaveSucceeded = slug.includes('CREATE_');
  }
}

/**
 * Runs the published Composio CLI without going through a shell.
 *
 * Keeping this boundary small makes the adapter straightforward to test and
 * prevents a batch payload from becoming shell syntax.
 */
export function createComposioCommandRunner(options?: {
  readonly command?: string;
  readonly cwd?: string;
  readonly env?: NodeJS.ProcessEnv;
  readonly maxBuffer?: number;
}): CommandRunner {
  const command = options?.command ?? 'composio';
  const maxBuffer = options?.maxBuffer ?? 4 * 1024 * 1024;

  return async args => {
    try {
      const result = await execFileAsync(command, [...args], {
        cwd: options?.cwd,
        env: options?.env,
        maxBuffer,
        encoding: 'utf8',
      });

      return {
        stdout: result.stdout,
        stderr: result.stderr,
        exitCode: 0,
      };
    } catch (error: unknown) {
      const failure = isExecFileFailure(error) ? error : undefined;
      return {
        stdout: failure?.stdout ?? '',
        stderr: failure?.stderr ?? getErrorMessage(error),
        exitCode: getExitCode(failure?.code),
      };
    }
  };
}

/**
 * Extracts the last JSON value from CLI output while tolerating diagnostic
 * lines emitted before it. Composio normally emits one JSON object, but this
 * also handles a CLI warning followed by a pretty-printed response.
 */
export function parseComposioJson(stdout: string): unknown {
  const trimmed = stdout.trim();
  if (!trimmed) throw new ComposioResponseParseError(stdout);

  try {
    return JSON.parse(trimmed) as unknown;
  } catch {
    // Continue with the balanced-value scanner below.
  }

  let valueStart = -1;
  let depth = 0;
  let inString = false;
  let escaped = false;
  let lastCompleteValue: string | undefined;

  for (let index = 0; index < stdout.length; index += 1) {
    const character = stdout[index];

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (character === '\\') {
        escaped = true;
      } else if (character === '"') {
        inString = false;
      }
      continue;
    }

    if (character === '"') {
      inString = true;
      continue;
    }

    if (character === '{' || character === '[') {
      if (depth === 0) valueStart = index;
      depth += 1;
      continue;
    }

    if (character === '}' || character === ']') {
      if (depth === 0) continue;
      depth -= 1;
      if (depth === 0 && valueStart >= 0) {
        lastCompleteValue = stdout.slice(valueStart, index + 1);
        valueStart = -1;
      }
    }
  }

  if (lastCompleteValue) {
    try {
      return JSON.parse(lastCompleteValue) as unknown;
    } catch {
      // Throw the same stable error below with the original output attached.
    }
  }

  throw new ComposioResponseParseError(stdout);
}

/** Execute one authenticated Composio tool call. */
export function createComposioToolExecutor(
  runner: CommandRunner
): ComposioToolExecutor {
  return async (slug, input) => {
    const args = ['execute', slug, '-d', JSON.stringify(input)];
    const output = await runner(args);

    if (output.exitCode !== 0) {
      throw new ComposioCommandError(args, output, {
        // A mutation can have been accepted before a CLI/network failure.
        mayHaveSucceeded: slug.includes('CREATE_'),
      });
    }

    const response = parseComposioJson(output.stdout);
    if (isRecord(response) && response.successful === false) {
      throw new ComposioToolError(slug, response);
    }

    return response;
  };
}

function isExecFileFailure(value: unknown): value is ExecFileFailure {
  return value instanceof Error;
}

function getExitCode(value: number | string | undefined): number {
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
    const parsed = Number.parseInt(value, 10);
    if (Number.isFinite(parsed)) return parsed;
  }
  return 1;
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
