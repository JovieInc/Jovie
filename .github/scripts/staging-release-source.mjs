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
// Completed runs may retain artifacts across reruns. Read every bounded page;
// incomplete, changing, or duplicated listings never authorize production.
function completeRunListing(api, route, key, reason) {
  const first = api(route);
  const total = first?.total_count;
  requireEvidence(
    Number.isSafeInteger(total) && total >= 0 && total <= 1000,
    reason
  );
  const rows = [];
  const seen = new Set();
  for (let page = 1; page <= Math.max(1, Math.ceil(total / 100)); page++) {
    const listing = page === 1 ? first : api(`${route}&page=${page}`);
    const items = listing?.[key];
    requireEvidence(
      listing?.total_count === total &&
        Array.isArray(items) &&
        items.length === Math.min(100, total - rows.length),
      reason
    );
    for (const item of items) {
      const id = String(item?.id);
      requireEvidence(
        ID.test(id) && !seen.has(id),
        `${reason}: ambiguous identifiers`
      );
      seen.add(id);
      rows.push(item);
    }
  }
  requireEvidence(rows.length === total, reason);
  return { total_count: total, [key]: rows };
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
  const listing = completeRunListing(
    api,
    `repos/${repository}/actions/runs/${trigger.id}/artifacts?per_page=100`,
    'artifacts',
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
        ID.test(receipt.controllerRunAttempt) &&
        Number(receipt.controllerRunAttempt) <= trigger.run_attempt &&
        /^dpl_[A-Za-z0-9]+$/.test(receipt.deploymentId) &&
        receipt.alias === 'staging.jov.ie' &&
        receipt.environment === 'preview' &&
        receipt.exactIdentity === 'passed' &&
        receipt.routeSmoke === 'passed' &&
        receipt.privacy === 'robots-block-all-and-http-noindex',
      'staging deployment binding mismatch'
    );
    // A failed-only publisher rerun retains successful deployment jobs from
    // an earlier attempt. Authenticate that producer rather than rebinding it
    // to the completion publisher's newer attempt.
    const producer = api(
      `repos/${repository}/actions/runs/${trigger.id}/attempts/${receipt.controllerRunAttempt}`
    );
    requireEvidence(
      producer?.id === stage.id &&
        String(producer.run_attempt) === receipt.controllerRunAttempt &&
        producer.workflow_id === stage.workflow_id &&
        producer.path === STAGING_PATH &&
        producer.event === 'workflow_run' &&
        producer.head_branch === 'main' &&
        producer.head_sha === stage.head_sha &&
        producer.repository?.id === stage.repository.id &&
        producer.repository.full_name === repository &&
        producer.head_repository?.id === stage.head_repository.id &&
        producer.head_repository.full_name === repository &&
        producer.status === 'completed' &&
        ['success', 'failure', 'cancelled', 'timed_out'].includes(
          producer.conclusion
        ),
      'staging deployment producer attempt mismatch'
    );
    const jobs = completeRunListing(
      api,
      `repos/${repository}/actions/runs/${trigger.id}/attempts/${receipt.controllerRunAttempt}/jobs?per_page=100`,
      'jobs',
      'staging deployment producer job listing mismatch'
    );
    requireEvidence(
      Array.isArray(jobs?.jobs) &&
        jobs.total_count === jobs.jobs.length &&
        jobs.jobs.every(
          job =>
            ID.test(String(job.id)) &&
            job.run_id === producer.id &&
            job.run_attempt === producer.run_attempt &&
            job.head_sha === producer.head_sha &&
            job.head_branch === 'main'
        ),
      'staging deployment producer job listing mismatch'
    );
    const receiptJobs = jobs.jobs.filter(
      job =>
        job.name ===
        'staging-release / Preserve exact staging deployment receipt'
    );
    requireEvidence(
      receiptJobs.length === 1 &&
        receiptJobs[0].status === 'completed' &&
        receiptJobs[0].conclusion === 'success',
      'staging deployment producer job mismatch'
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
