#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import {
  appendFileSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const STAGING_PATH = '.github/workflows/staging-controller.yml';
const CI_PATH = '.github/workflows/ci.yml';
const SHA = /^[a-f0-9]{40}$/;
const ID = /^[1-9][0-9]*$/;
function requireEvidence(condition, reason) {
  if (!condition) throw new Error(reason);
}
function exactRun(run, repository, path, event) {
  return (
    run &&
    ID.test(String(run.id)) &&
    ID.test(String(run.run_attempt)) &&
    ID.test(String(run.workflow_id)) &&
    SHA.test(run.head_sha) &&
    run.path === path &&
    run.event === event &&
    run.head_branch === 'main' &&
    run.status === 'completed' &&
    run.conclusion === 'success' &&
    run.repository?.full_name === repository &&
    run.head_repository?.full_name === repository &&
    ID.test(String(run.repository.id)) &&
    run.head_repository.id === run.repository.id
  );
}

/** Resolve completion evidence; never discover a newer CI attempt or poll for one. */
export function resolveStagingReleaseSource({
  repository,
  trigger,
  api,
  readArtifact,
}) {
  requireEvidence(repository === 'JovieInc/Jovie', 'repository mismatch');
  requireEvidence(
    exactRun(trigger, repository, STAGING_PATH, 'workflow_run'),
    'untrusted staging completion'
  );
  const workflow = api(
    `repos/${repository}/actions/workflows/staging-controller.yml`
  );
  requireEvidence(
    workflow?.id === trigger.workflow_id &&
      workflow.name === 'Staging Controller' &&
      workflow.path === STAGING_PATH &&
      workflow.state === 'active',
    'staging workflow identity mismatch'
  );
  const stage = api(
    `repos/${repository}/actions/runs/${trigger.id}/attempts/${trigger.run_attempt}`
  );
  requireEvidence(
    exactRun(stage, repository, STAGING_PATH, 'workflow_run') &&
      stage.id === trigger.id &&
      stage.run_attempt === trigger.run_attempt &&
      stage.workflow_id === trigger.workflow_id &&
      stage.head_sha === trigger.head_sha,
    'staging attempt mismatch'
  );
  const listing = api(
    `repos/${repository}/actions/runs/${trigger.id}/artifacts?per_page=100`
  );
  requireEvidence(
    Array.isArray(listing?.artifacts) &&
      listing.total_count === listing.artifacts.length,
    'incomplete staging artifact listing'
  );
  const select = name => {
    const found = listing.artifacts.filter(
      a => a?.name === name && a.expired === false
    );
    requireEvidence(
      found.length === 1 &&
        ID.test(String(found[0].id)) &&
        found[0].workflow_run?.id === trigger.id &&
        found[0].workflow_run.repository_id === stage.repository.id &&
        found[0].workflow_run.head_repository_id === stage.head_repository.id,
      'missing or ambiguous exact staging artifact'
    );
    return found[0];
  };
  const completionArtifact = select(
    `staging-completion-${trigger.run_attempt}`
  );
  const completion = readArtifact(
    completionArtifact.id,
    'staging-completion.json'
  );
  requireEvidence(
    completion?.schema === 'jovie-staging-completion/v1' &&
      completion.terminal === true &&
      completion.repository === repository &&
      SHA.test(completion.sha) &&
      completion.controllerRunId === String(trigger.id) &&
      completion.controllerRunAttempt === String(trigger.run_attempt) &&
      ID.test(completion.sourceCiRunId) &&
      ID.test(completion.sourceCiRunAttempt) &&
      ['deployed', 'not_applicable', 'superseded'].includes(completion.outcome),
    'staging completion binding mismatch'
  );
  const ci = api(
    `repos/${repository}/actions/runs/${completion.sourceCiRunId}/attempts/${completion.sourceCiRunAttempt}`
  );
  requireEvidence(
    exactRun(ci, repository, CI_PATH, 'push') &&
      ci.head_sha === completion.sha &&
      String(ci.id) === completion.sourceCiRunId &&
      String(ci.run_attempt) === completion.sourceCiRunAttempt,
    'source CI attempt mismatch'
  );
  let stagingArtifactId = '';
  if (completion.outcome === 'deployed') {
    const artifact = select(`staging-deployment-${completion.sha}`);
    const receipt = readArtifact(
      artifact.id,
      'staging-deployment-receipt.json'
    );
    requireEvidence(
      receipt?.schema === 'jovie-staging-deployment/v1' &&
        receipt.terminal === true &&
        ['current', 'superseded_after_mutation'].includes(receipt.state) &&
        receipt.repository === repository &&
        receipt.sha === completion.sha &&
        receipt.sourceCiRunId === completion.sourceCiRunId &&
        receipt.sourceCiRunAttempt === completion.sourceCiRunAttempt &&
        receipt.controllerRunId === completion.controllerRunId &&
        receipt.controllerRunAttempt === completion.controllerRunAttempt &&
        /^dpl_[A-Za-z0-9]+$/.test(receipt.deploymentId) &&
        receipt.alias === 'staging.jov.ie' &&
        receipt.environment === 'preview' &&
        receipt.exactIdentity === 'passed' &&
        receipt.routeSmoke === 'passed' &&
        receipt.privacy === 'robots-block-all-and-http-noindex',
      'staging deployment binding mismatch'
    );
    stagingArtifactId = String(artifact.id);
  }
  return {
    ci,
    eligible: completion.outcome !== 'superseded',
    stagingArtifactId,
  };
}

function command(args, options = {}) {
  const result = spawnSync(args[0], args.slice(1), {
    ...options,
    encoding: options.encoding ?? 'utf8',
  });
  requireEvidence(result.status === 0, `evidence transport failed: ${args[0]}`);
  return result.stdout;
}

export function runStagingReleaseSource(env = process.env) {
  const directory = mkdtempSync(
    join(env.RUNNER_TEMP || tmpdir(), 'staging-completion-')
  );
  try {
    const event = JSON.parse(readFileSync(env.GITHUB_EVENT_PATH, 'utf8'));
    const result = resolveStagingReleaseSource({
      repository: env.GITHUB_REPOSITORY,
      trigger: event.workflow_run,
      api: route => JSON.parse(command(['gh', 'api', route])),
      readArtifact: (id, name) => {
        const zip = join(directory, `${id}.zip`);
        writeFileSync(
          zip,
          command(
            [
              'gh',
              'api',
              `repos/${env.GITHUB_REPOSITORY}/actions/artifacts/${id}/zip`,
            ],
            { encoding: 'buffer' }
          )
        );
        // Read the one data entry; never extract executable artifact contents.
        return JSON.parse(command(['unzip', '-p', zip, name]));
      },
    });
    appendFileSync(
      env.GITHUB_OUTPUT,
      `ci=${JSON.stringify(result.ci)}\neligible=${result.eligible}\nstaging_artifact_id=${result.stagingArtifactId}\n`
    );
    return result;
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  try {
    runStagingReleaseSource();
  } catch (error) {
    console.error(`::error::Staging completion rejected: ${error.message}`);
    process.exitCode = 1;
  }
}
