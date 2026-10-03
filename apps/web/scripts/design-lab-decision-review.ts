/**
 * Prepare an offline Design Lab decision packet from exact JSON inputs.
 *
 * This command never obtains model funding, dispatches a worker, generates an
 * artifact, publishes a page, or activates an experiment. Without a per-check
 * semantic evaluator option the adapter records Jev as not admitted, which is
 * useful for a review-ready packet and keeps the CLI safe by default.
 *
 * Usage:
 *   NODE_OPTIONS=--conditions=react-server pnpm --filter @jovie/web exec tsx \
 *     scripts/design-lab-decision-review.ts --input=/absolute/request.json
 *
 * The JSON request uses PrepareDesignLabDecisionReviewParams. `semanticInputs`
 * carries exact per-candidate check bindings; callback options are intentionally
 * not representable in JSON, so file mode remains offline/advisory.
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import {
  type PrepareDesignLabDecisionReviewParams,
  prepareDesignLabDecisionReview,
  readDesignLabDecisionReviewArtifact,
} from '@/lib/agent-os/design-lab/decision-review';

interface CliOptions {
  readonly inputPath: string | null;
  readonly artifactRootDirectory: string | null;
  readonly readReviewId: string | null;
}

function parseArgs(argv: readonly string[]): CliOptions {
  let inputPath: string | null = null;
  let artifactRootDirectory: string | null = null;
  let readReviewId: string | null = null;
  for (const arg of argv) {
    if (arg === '--help' || arg === '-h') {
      process.stdout.write(
        [
          'Usage: NODE_OPTIONS=--conditions=react-server pnpm --filter @jovie/web exec tsx scripts/design-lab-decision-review.ts --input=/absolute/request.json',
          '',
          'Options:',
          '  --input=PATH          Exact JSON request for offline packet preparation.',
          '  --artifact-root=PATH  Existing Design Lab artifact root override (tests/local review).',
          '  --read=REVIEW_ID      Read back an existing review-ready packet.',
          '',
        ].join('\n')
      );
      process.exit(0);
    }
    if (arg.startsWith('--input=')) {
      inputPath = arg.slice('--input='.length).trim() || null;
    } else if (arg.startsWith('--artifact-root=')) {
      artifactRootDirectory =
        arg.slice('--artifact-root='.length).trim() || null;
    } else if (arg.startsWith('--read=')) {
      readReviewId = arg.slice('--read='.length).trim() || null;
    } else if (arg !== '--') {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  if (inputPath && readReviewId) {
    throw new Error('--input and --read are mutually exclusive.');
  }
  if (!inputPath && !readReviewId) {
    throw new Error('Provide --input=PATH or --read=REVIEW_ID.');
  }
  return { inputPath, artifactRootDirectory, readReviewId };
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  if (options.readReviewId) {
    const artifact = await readDesignLabDecisionReviewArtifact(
      options.readReviewId,
      options.artifactRootDirectory
        ? { artifactRootDirectory: path.resolve(options.artifactRootDirectory) }
        : undefined
    );
    if (!artifact) throw new Error('Review-ready artifact was not found.');
    process.stdout.write(`${JSON.stringify(artifact, null, 2)}\n`);
    return;
  }

  const input = JSON.parse(
    await fs.readFile(path.resolve(options.inputPath!), 'utf8')
  ) as PrepareDesignLabDecisionReviewParams;
  const result = await prepareDesignLabDecisionReview({
    ...input,
    artifactRootDirectory: options.artifactRootDirectory
      ? path.resolve(options.artifactRootDirectory)
      : input.artifactRootDirectory,
  });
  process.stdout.write(
    `${JSON.stringify(
      {
        reviewId: result.artifact.reviewId,
        artifactPath: result.artifactPath,
        decisionStatus: result.artifact.decisionStatus,
        semanticReviewCount: result.artifact.semanticReviews.length,
        certified: result.artifact.certified,
        dispatchTriggered: result.artifact.dispatchTriggered,
        generationTriggered: result.artifact.generationTriggered,
        published: result.artifact.published,
      },
      null,
      2
    )}\n`
  );
}

main().catch(error => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`[design-lab-decision-review] ${message}\n`);
  process.exitCode = 1;
});
