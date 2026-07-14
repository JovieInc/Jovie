import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileGithubIssue, shouldMirrorLinear } from '../lib/tracker.mjs';
import {
  enqueueForEve,
  shouldFastTrack,
  writeRemediationManifest,
} from './autonomy.mjs';
import { persistGbrainFinding } from './gbrain.mjs';
import { buildEnrichedIssueBody, fileLinearIssue } from './linear.mjs';
import { getQaSwarmPaths, resolveQaSwarmRunDirectory } from './paths.mjs';
import { getRecipe } from './registry.mjs';
import { assertFindings } from './types.mjs';

function buildRunId() {
  const safeRandom = Math.random().toString(36).slice(2, 8);
  return `qa-swarm-${new Date().toISOString().replaceAll(/[:.]/g, '-')}-${safeRandom}`;
}

/**
 * @param {import('./types.mjs').QaSwarmProposeInput} input
 */
export async function proposeQaSwarmFindings(input) {
  assertFindings(input.findings);
  const recipe = getRecipe(input.recipeId);
  const paths = getQaSwarmPaths();
  const runId = input.runId ?? buildRunId();
  const eveEnabled = input.eveEnabled ?? false;
  const dryRun = input.dryRun ?? false;

  const runDir = resolveQaSwarmRunDirectory(runId, paths);
  mkdirSync(paths.runsRoot, { recursive: true });
  mkdirSync(runDir, { recursive: true });

  /** @type {Array<Record<string, unknown>>} */
  const proposed = [];

  for (const finding of input.findings) {
    const gbrain = persistGbrainFinding(finding, {
      recipeId: input.recipeId,
      runId,
    });

    const description = buildEnrichedIssueBody(finding, {
      recipeId: input.recipeId,
      runId,
      sourceIssue: input.sourceIssue,
      sourcePr: input.sourcePr,
      branch: input.branch,
      gbrainSlug: gbrain.slug,
    });

    const issueTitle =
      finding.priority === 'P0'
        ? `P0 QA: ${finding.title}`
        : `QA swarm (${recipe.id}): ${finding.title}`;

    // GitHub Issues is the primary tracker; Linear stays as a mirror during
    // the migration parallel-run and drops out with TRACKER_GITHUB_ONLY=1.
    const githubResult = dryRun
      ? { success: true, identifier: 'DRY-RUN', url: null, dryRun: true }
      : fileGithubIssue({
          title: issueTitle,
          body: description,
          labels: [...recipe.labels],
        });

    const linearResult =
      dryRun || !shouldMirrorLinear()
        ? {
            success: true,
            identifier: dryRun ? 'DRY-RUN' : 'SKIPPED',
            url: null,
            queued: false,
            dryRun,
          }
        : await fileLinearIssue({
            title: issueTitle,
            description,
            labels: [...recipe.labels],
            source: `qa-swarm:${recipe.id}`,
          });

    const trackerIssueUrl = githubResult.url ?? linearResult.url ?? null;

    let remediationPath = null;
    let eveQueued = false;
    if (shouldFastTrack(finding, eveEnabled)) {
      remediationPath = writeRemediationManifest(finding, {
        recipeId: input.recipeId,
        linearIssueUrl: trackerIssueUrl,
        gbrainSlug: gbrain.slug,
      });
    } else if (eveEnabled) {
      enqueueForEve(finding, {
        linearIssueUrl: trackerIssueUrl,
        gbrainSlug: gbrain.slug,
      });
      eveQueued = true;
    }

    proposed.push({
      findingId: finding.id,
      priority: finding.priority,
      gbrainSlug: gbrain.slug,
      gbrainPagePath: gbrain.pagePath,
      github: githubResult,
      linear: linearResult,
      remediationPath,
      eveQueued,
    });
  }

  const summary = {
    runId,
    recipeId: recipe.id,
    recipeCommand: recipe.command,
    dryRun,
    eveEnabled,
    proposedCount: proposed.length,
    fastTrackedCount: proposed.filter(item => item.remediationPath).length,
    eveQueuedCount: proposed.filter(item => item.eveQueued).length,
    proposed,
  };

  writeFileSync(
    path.join(runDir, 'summary.json'),
    `${JSON.stringify(summary, null, 2)}\n`,
    'utf8'
  );

  return summary;
}
