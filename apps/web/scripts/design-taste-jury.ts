import { execSync } from 'node:child_process';
import process from 'node:process';
import { runDesignTasteJuryLoop } from '@/lib/agent-os/design-taste-jury/loop';

interface CliOptions {
  readonly runId: string;
  readonly baseRef: string;
  readonly forceAll: boolean;
  readonly changedFiles: readonly string[];
}

function parseArgs(argv: readonly string[]): CliOptions {
  const options: CliOptions = {
    runId: process.env.DESIGN_TASTE_JURY_RUN_ID?.trim() ?? '',
    baseRef: process.env.DESIGN_TASTE_JURY_BASE_REF?.trim() || 'origin/main',
    forceAll: false,
    changedFiles: [],
  };

  for (const arg of argv) {
    if (arg.startsWith('--run-id=')) {
      options.runId = arg.slice('--run-id='.length).trim();
    } else if (arg.startsWith('--base-ref=')) {
      options.baseRef = arg.slice('--base-ref='.length).trim();
    } else if (arg === '--force-all') {
      options.forceAll = true;
    } else if (arg.startsWith('--changed-file=')) {
      options.changedFiles = [
        ...options.changedFiles,
        arg.slice('--changed-file='.length).trim(),
      ];
    }
  }

  if (!options.runId) {
    throw new Error(
      'Missing run id. Pass --run-id=<id> or DESIGN_TASTE_JURY_RUN_ID.'
    );
  }

  return options;
}

function resolveChangedFiles(baseRef: string): string[] {
  const output = execSync(`git diff --name-only ${baseRef}...HEAD`, {
    encoding: 'utf8',
  });

  return output
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean);
}

function resolveGitSha(): string | null {
  try {
    return execSync('git rev-parse HEAD', { encoding: 'utf8' }).trim();
  } catch {
    return null;
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const changedFiles =
    options.changedFiles.length > 0
      ? options.changedFiles
      : resolveChangedFiles(options.baseRef);

  const result = await runDesignTasteJuryLoop({
    runId: options.runId,
    changedFiles,
    gitSha: resolveGitSha(),
    forceAll: options.forceAll,
  });

  console.log(
    JSON.stringify(
      {
        runId: result.manifest.runId,
        isNonUiPush: result.manifest.capturePlan.isNonUiPush,
        captureCount: result.manifest.capturePlan.capture.length,
        skippedCount: result.manifest.capturePlan.skipped.length,
        consensusSurfaces: result.manifest.consensus.length,
        issueFilings: result.manifest.issueFilings.length,
        manifestPath: result.manifestPath,
        issueFilingsPath: result.issueFilingsPath,
      },
      null,
      2
    )
  );
}

void main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
