import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  type CommandRunner,
  type ComposioToolExecutor,
  createComposioCommandRunner,
  createComposioToolExecutor,
} from './composio-command';
import {
  createYouTubeComposioAdapter,
  DEFAULT_MIN_DELAY_MS,
  parseYouTubeReplyBatch,
  runYouTubeReplyBatch,
  type YouTubeBatchReceipt,
  type YouTubeReplyMode,
} from './youtube-composio-adapter';

export interface YouTubeCliArgs {
  readonly batchPath: string;
  readonly mode: YouTubeReplyMode;
  readonly approvalId?: string;
  readonly expectedChannelId?: string;
  readonly minDelayMs: number;
  readonly composioCommand: string;
}

export class CliArgumentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CliArgumentError';
  }
}

export interface YouTubeCliDependencies {
  readonly readFile?: (path: string, encoding: 'utf8') => Promise<string>;
  readonly commandRunner?: CommandRunner;
  readonly execute?: ComposioToolExecutor;
  readonly sleep?: (milliseconds: number) => Promise<void>;
  readonly now?: () => Date;
}

export function parseYouTubeCliArgs(argv: readonly string[]): YouTubeCliArgs {
  let batchPath: string | undefined;
  let mode: YouTubeReplyMode = 'dry-run';
  let approvalId: string | undefined;
  let expectedChannelId: string | undefined;
  let minDelayMs = DEFAULT_MIN_DELAY_MS;
  let composioCommand = 'composio';

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    switch (argument) {
      case '--batch':
        batchPath = requireValue(argv, ++index, '--batch');
        break;
      case '--execute':
        mode = 'execute';
        break;
      case '--approval-id':
        approvalId = requireValue(argv, ++index, '--approval-id');
        break;
      case '--expected-channel-id':
        expectedChannelId = requireValue(
          argv,
          ++index,
          '--expected-channel-id'
        );
        break;
      case '--min-delay-ms':
        minDelayMs = parseDelay(requireValue(argv, ++index, '--min-delay-ms'));
        break;
      case '--composio-command':
        composioCommand = requireValue(argv, ++index, '--composio-command');
        break;
      case '--help':
      case '-h':
        throw new CliArgumentError(usage());
      default:
        throw new CliArgumentError(`Unknown argument: ${argument}`);
    }
  }

  if (!batchPath) throw new CliArgumentError('--batch is required');
  if (mode === 'execute' && !approvalId) {
    throw new CliArgumentError('--execute requires --approval-id');
  }

  return {
    batchPath,
    mode,
    ...(approvalId ? { approvalId } : {}),
    ...(expectedChannelId ? { expectedChannelId } : {}),
    minDelayMs,
    composioCommand,
  };
}

export async function runYouTubeCli(
  argv: readonly string[],
  dependencies: YouTubeCliDependencies = {}
): Promise<YouTubeBatchReceipt> {
  const args = parseYouTubeCliArgs(argv);
  const read = dependencies.readFile ?? readFile;
  const batchText = await read(args.batchPath, 'utf8');
  let rawBatch: unknown;
  try {
    rawBatch = JSON.parse(batchText) as unknown;
  } catch {
    throw new CliArgumentError(`Batch is not valid JSON: ${args.batchPath}`);
  }

  const batch = parseYouTubeReplyBatch(rawBatch, {
    expectedChannelId: args.expectedChannelId,
  });
  const execute =
    dependencies.execute ??
    createComposioToolExecutor(
      dependencies.commandRunner ??
        createComposioCommandRunner({ command: args.composioCommand })
    );
  const adapter = createYouTubeComposioAdapter({
    execute,
    minDelayMs: args.minDelayMs,
    sleep: dependencies.sleep,
    now: dependencies.now,
  });

  return runYouTubeReplyBatch(
    batch,
    adapter,
    {
      mode: args.mode,
      ...(args.approvalId ? { approvalId: args.approvalId } : {}),
    },
    dependencies.now
  );
}

export function usage(): string {
  return [
    'Usage: pnpm exec tsx scripts/reply-maxxing/youtube-composio-cli.ts --batch <file> [options]',
    '',
    'Defaults to a read-only dry run. Public writes require both flags:',
    '  --execute --approval-id <exact-approved-action-id>',
    '',
    'Options:',
    '  --expected-channel-id <UC...>  Fail closed if the connected channel differs',
    `  --min-delay-ms <n>             Delay between provider calls (default ${DEFAULT_MIN_DELAY_MS})`,
    '  --composio-command <path>      Composio executable (default composio)',
  ].join('\n');
}

async function main(): Promise<void> {
  try {
    const receipt = await runYouTubeCli(process.argv.slice(2));
    process.stdout.write(`${JSON.stringify(receipt, null, 2)}\n`);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`${message}\n`);
    process.exitCode = 1;
  }
}

function requireValue(
  argv: readonly string[],
  index: number,
  flag: string
): string {
  const value = argv[index];
  if (!value || value.startsWith('--')) {
    throw new CliArgumentError(`${flag} requires a value`);
  }
  return value;
}

function parseDelay(value: string): number {
  const delay = Number(value);
  if (!Number.isInteger(delay) || delay < 0) {
    throw new CliArgumentError('--min-delay-ms must be a non-negative integer');
  }
  return delay;
}

const invokedPath = process.argv[1];
if (
  invokedPath &&
  resolve(fileURLToPath(import.meta.url)) === resolve(invokedPath)
) {
  void main();
}
