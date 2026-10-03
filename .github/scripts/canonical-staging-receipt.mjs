import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  completeRunListing,
  resolveStagingReleaseSource,
} from './staging-release-source.mjs';

function requireProof(condition, reason) {
  if (!condition) throw new Error(reason);
}

// Reuse only a uniquely authenticated receipt for the deployment currently
// served by the canonical alias. Never select an arbitrary latest artifact.
export function resolveCanonicalStagingReceipt({
  repository,
  expectedSha,
  identity,
  api,
  readArtifact,
}) {
  requireProof(
    repository === 'JovieInc/Jovie' &&
      /^[a-f0-9]{40}$/.test(expectedSha ?? '') &&
      identity?.commitSha === expectedSha &&
      /^dpl_[A-Za-z0-9]+$/.test(identity?.deploymentId ?? ''),
    'canonical staging identity mismatch'
  );
  const name = `staging-deployment-${expectedSha}`;
  const listing = completeRunListing(
    api,
    `repos/${repository}/actions/artifacts?name=${name}&per_page=100`,
    'artifacts',
    'incomplete canonical staging artifact listing'
  );
  const matches = [];
  for (const artifact of listing.artifacts) {
    if (artifact.name !== name || artifact.expired !== false) continue;
    const receipt = readArtifact(
      artifact.id,
      'staging-deployment-receipt.json'
    );
    requireProof(
      receipt?.sha === expectedSha &&
        receipt.repository === repository &&
        /^[1-9][0-9]*$/.test(receipt.controllerRunId ?? '') &&
        /^[1-9][0-9]*$/.test(receipt.controllerRunAttempt ?? '') &&
        String(artifact.workflow_run?.id) === receipt.controllerRunId,
      'canonical staging artifact binding mismatch'
    );
    if (receipt.deploymentId !== identity.deploymentId) continue;
    const producer = api(
      `repos/${repository}/actions/runs/${receipt.controllerRunId}/attempts/${receipt.controllerRunAttempt}`
    );
    requireProof(
      artifact.workflow_run?.head_sha === producer.head_sha,
      'canonical staging artifact source mismatch'
    );
    const resolved = resolveStagingReleaseSource({
      repository,
      trigger: producer,
      api,
      readArtifact,
    });
    requireProof(
      resolved.eligible === true &&
        resolved.ci.head_sha === expectedSha &&
        resolved.stagingArtifactId === String(artifact.id),
      'canonical staging completion mismatch'
    );
    matches.push(String(artifact.id));
  }
  requireProof(
    matches.length === 1,
    'canonical staging receipt missing or ambiguous'
  );
  return matches[0];
}

export function runCanonicalStagingReceipt(env = process.env) {
  const directory = mkdtempSync(
    join(env.RUNNER_TEMP || tmpdir(), 'canonical-stage-')
  );
  function command(args, encoding = 'utf8', maxBuffer = 4 * 1024 * 1024) {
    const result = spawnSync(args[0], args.slice(1), {
      encoding,
      timeout: 60_000,
      maxBuffer,
      env,
    });
    requireProof(
      result.status === 0,
      'canonical staging evidence transport failed'
    );
    return result.stdout;
  }
  try {
    return resolveCanonicalStagingReceipt({
      repository: env.REPOSITORY,
      expectedSha: env.EXPECTED_SHA,
      identity: JSON.parse(env.CANONICAL_STAGING_IDENTITY),
      api: route => JSON.parse(command(['gh', 'api', route])),
      readArtifact: (id, name) => {
        const zip = join(directory, `${id}.zip`);
        writeFileSync(
          zip,
          command(
            [
              'gh',
              'api',
              `repos/${env.REPOSITORY}/actions/artifacts/${id}/zip`,
            ],
            'buffer',
            16 * 1024 * 1024
          )
        );
        // Read data through a bounded pipe; do not extract ZIP paths.
        return JSON.parse(command(['unzip', '-p', zip, name]));
      },
    });
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  try {
    console.log(runCanonicalStagingReceipt());
  } catch (error) {
    console.error(
      `::error::Canonical staging receipt rejected: ${error.message}`
    );
    process.exitCode = 1;
  }
}
