import { execFileSync } from 'node:child_process';
import process from 'node:process';
import { runDesignTasteJuryLoop } from '@/lib/agent-os/design-taste-jury/loop';
import {
  type DesignTasteJurySignal,
  DesignTasteJurySignalSchema,
} from '@/lib/agent-os/design-taste-jury/types';

interface CliOptions {
  readonly runId: string;
  readonly baseRef: string;
  readonly changedFiles: readonly string[];
  readonly signals: readonly DesignTasteJurySignal[];
  readonly dryRun: boolean;
  readonly reviewer: string;
  readonly sourceLinearIssueId: string;
}

function parseBooleanFlag(value: string | undefined, defaultValue: boolean) {
  if (value === undefined) {
    return defaultValue;
  }

  const normalized = value.trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) {
    return true;
  }

  if (['0', 'false', 'no', 'off'].includes(normalized)) {
    return false;
  }

  return defaultValue;
}

function listChangedFiles(baseRef: string): string[] {
  const output = execFileSync(
    'git',
    ['diff', '--name-only', `${baseRef}...HEAD`],
    { encoding: 'utf8' }
  );

  return output
    .split('\n')
    .map(line => line.trim())
    .filter(line => line.length > 0);
}

function parseSignals(raw: string | undefined): DesignTasteJurySignal[] {
  if (!raw?.trim()) {
    return [];
  }

  const parsed = JSON.parse(raw) as unknown;
  if (!Array.isArray(parsed)) {
    throw new Error('Signals payload must be a JSON array.');
  }

  return parsed.map(entry => DesignTasteJurySignalSchema.parse(entry));
}

function parseArgs(argv: readonly string[]): CliOptions {
  const options: CliOptions = {
    runId: process.env.DESIGN_TASTE_JURY_RUN_ID ?? '',
    baseRef: process.env.DESIGN_TASTE_JURY_BASE_REF ?? 'origin/main',
    changedFiles: [],
    signals: [],
    dryRun: parseBooleanFlag(process.env.DESIGN_TASTE_JURY_DRY_RUN, true),
    reviewer: process.env.DESIGN_TASTE_JURY_REVIEWER ?? 'design-taste-jury',
    sourceLinearIssueId:
      process.env.DESIGN_TASTE_JURY_SOURCE_ISSUE ?? 'JOV-3214',
  };

  for (const arg of argv) {
    if (arg.startsWith('--run-id=')) {
      options.runId = arg.slice('--run-id='.length);
    } else if (arg.startsWith('--base-ref=')) {
      options.baseRef = arg.slice('--base-ref='.length);
    } else if (arg.startsWith('--changed-files=')) {
      options.changedFiles = arg
        .slice('--changed-files='.length)
        .split(',')
        .map(file => file.trim())
        .filter(file => file.length > 0);
    } else if (arg.startsWith('--signals=')) {
      options.signals = parseSignals(arg.slice('--signals='.length));
    } else if (arg.startsWith('--signals-json=')) {
      options.signals = parseSignals(arg.slice('--signals-json='.length));
    } else if (arg.startsWith('--reviewer=')) {
      options.reviewer = arg.slice('--reviewer='.length);
    } else if (arg.startsWith('--source-issue=')) {
      options.sourceLinearIssueId = arg.slice('--source-issue='.length);
    } else if (arg === '--dry-run') {
      options.dryRun = true;
    } else if (arg === '--file-issues') {
      options.dryRun = false;
    }
  }

  if (!options.runId.trim()) {
    throw new Error(
      'Missing run id. Pass --run-id=<id> or DESIGN_TASTE_JURY_RUN_ID.'
    );
  }

  return options;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const changedFiles =
    options.changedFiles.length > 0
      ? options.changedFiles
      : listChangedFiles(options.baseRef);

  const result = await runDesignTasteJuryLoop({
    runId: options.runId,
    changedFiles,
    signals: options.signals,
    dryRun: options.dryRun,
    reviewer: options.reviewer,
    sourceLinearIssueId: options.sourceLinearIssueId,
  });

  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

void main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
