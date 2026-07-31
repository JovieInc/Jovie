import process from 'node:process';
import { runProfileRedesignProposalLoop } from '@/lib/agent-os/design-lab/profile-redesign-loop';
import {
  PROFILE_REDESIGN_TARGET_KINDS,
  type ProfileRedesignTargetKind,
} from '@/lib/agent-os/design-lab/profile-targets';

interface CliOptions {
  readonly dayBucket: string | null;
  readonly dryRun: boolean;
  readonly maxProposals: number | null;
  readonly kinds: readonly ProfileRedesignTargetKind[];
}

function parseArgs(argv: readonly string[]): CliOptions {
  const options: {
    dayBucket: string | null;
    dryRun: boolean;
    maxProposals: number | null;
    kinds: ProfileRedesignTargetKind[];
  } = {
    dayBucket: process.env.PROFILE_REDESIGN_DAY_BUCKET?.trim() || null,
    dryRun: process.env.PROFILE_REDESIGN_DRY_RUN === '1',
    maxProposals: null,
    kinds: [],
  };

  for (const arg of argv) {
    if (arg === '--') {
      continue;
    }
    if (arg.startsWith('--day-bucket=')) {
      options.dayBucket = arg.slice('--day-bucket='.length).trim() || null;
    } else if (arg === '--dry-run') {
      options.dryRun = true;
    } else if (arg.startsWith('--max-proposals=')) {
      const raw = arg.slice('--max-proposals='.length).trim();
      const parsed = Number.parseInt(raw, 10);
      if (!Number.isFinite(parsed) || parsed < 0) {
        throw new Error(`Invalid --max-proposals value: ${raw}`);
      }
      options.maxProposals = parsed;
    } else if (arg.startsWith('--kind=')) {
      const kind = arg.slice('--kind='.length).trim();
      if (
        !PROFILE_REDESIGN_TARGET_KINDS.includes(
          kind as ProfileRedesignTargetKind
        )
      ) {
        throw new Error(
          `Invalid --kind value: ${kind}. Expected one of ${PROFILE_REDESIGN_TARGET_KINDS.join(', ')}.`
        );
      }
      options.kinds = [...options.kinds, kind as ProfileRedesignTargetKind];
    } else if (arg === '--help' || arg === '-h') {
      process.stdout.write(
        [
          'Usage: pnpm --filter @jovie/web run profile:redesign-loop -- [options]',
          '',
          'Generate pending Design Lab proposals for owned profiles and selected',
          'competitor handles (JOV-1951). Output is always gated by D2 review.',
          '',
          'Options:',
          '  --day-bucket=YYYY-MM-DD  Proposal day directory (default: UTC today)',
          '  --kind=owned|competitor  Repeatable target filter',
          '  --max-proposals=N        Cap ranked proposals written',
          '  --dry-run                Build proposals without writing files',
          '',
        ].join('\n')
      );
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return options;
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const result = await runProfileRedesignProposalLoop({
    dayBucket: options.dayBucket ?? undefined,
    dryRun: options.dryRun,
    maxProposals: options.maxProposals ?? undefined,
    kinds: options.kinds.length > 0 ? options.kinds : undefined,
  });

  process.stdout.write(
    `${JSON.stringify(
      {
        dayBucket: result.dayBucket,
        dryRun: result.dryRun,
        proposalCount: result.proposals.length,
        skippedRejectedDirections: result.skippedRejectedDirections,
        proposalIds: result.proposals.map(proposal => proposal.id),
        writtenPaths: result.writtenPaths,
      },
      null,
      2
    )}\n`
  );
}

main().catch(error => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`[profile-redesign-loop] ${message}\n`);
  process.exitCode = 1;
});
