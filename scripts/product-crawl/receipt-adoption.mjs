// Existing resolve-target authority downloads original reviewed crawl evidence.
// Only a bounded public projection crosses to contents-read crawler jobs.
import { appendFileSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { createGitHubTransport } from '../postdeploy-probe-admission.mjs';
import { producerScope, REPOSITORY, WORKFLOW } from './receipt-producer.mjs';
import { publicPacket } from './receipt-reuse.mjs';

export function lookupPublicReceipt({
  scope,
  inventory,
  transport,
  now = Date.now(),
  force = false,
}) {
  if (!scope || force) return null;
  try {
    const runs = transport.getJson(
      `repos/${REPOSITORY}/actions/workflows/postdeploy-probes.yml/runs?event=workflow_dispatch&branch=main&head_sha=${scope.sourceSha}&per_page=10`
    );
    if (
      !Array.isArray(runs.workflow_runs) ||
      runs.total_count !== runs.workflow_runs.length ||
      runs.total_count > 10
    )
      return null;
    const candidates = runs.workflow_runs
      .filter(
        r =>
          r.id !== scope.invocation.runId &&
          r.path === WORKFLOW &&
          r.event === 'workflow_dispatch' &&
          r.head_branch === 'main' &&
          r.head_sha === scope.sourceSha &&
          r.head_repository?.full_name === REPOSITORY &&
          r.status === 'completed' &&
          r.conclusion === 'success' &&
          Number.isSafeInteger(r.run_attempt) &&
          r.run_attempt > 0
      )
      .sort((a, b) => b.id - a.id)
      .slice(0, 3);
    for (const run of candidates) {
      const index = transport.getJson(
        `repos/${REPOSITORY}/actions/runs/${run.id}/artifacts?per_page=100`
      );
      if (
        !Array.isArray(index.artifacts) ||
        index.total_count !== index.artifacts.length ||
        index.total_count > 100
      )
        continue;
      const matches = index.artifacts.filter(
        a => a.name === `product-crawl-receipt-${run.id}`
      );
      if (matches.length !== 1) continue;
      const artifact = matches[0];
      if (
        artifact.expired !== false ||
        artifact.workflow_run?.id !== run.id ||
        artifact.workflow_run?.head_sha !== run.head_sha ||
        !Number.isSafeInteger(artifact.id) ||
        artifact.id < 1 ||
        !Number.isSafeInteger(artifact.size_in_bytes) ||
        artifact.size_in_bytes < 1 ||
        artifact.size_in_bytes > 2 * 1024 * 1024 ||
        !/^sha256:[a-f0-9]{64}$/u.test(artifact.digest)
      )
        continue;
      const document = transport.getCrawlReceipt(
        REPOSITORY,
        artifact.id,
        artifact.digest
      );
      const original = document.producerScope?.invocation;
      if (
        !original ||
        original.runId !== run.id ||
        original.runAttempt !== run.run_attempt ||
        original.workflowSha !== run.head_sha ||
        original.repository !== REPOSITORY ||
        original.workflow !== WORKFLOW
      )
        continue;
      const packet = publicPacket(
        document,
        scope,
        inventory,
        {
          runId: run.id,
          runAttempt: run.run_attempt,
          workflowSha: run.head_sha,
          artifactId: artifact.id,
          digest: artifact.digest,
        },
        now
      );
      if (packet) return packet;
    }
  } catch {
    /* Unknown history, quota, malformed ZIP/JSON: keep cold coverage. */
  }
  return null;
}

export function main(argv = process.argv.slice(2), env = process.env) {
  const { values: args } = parseArgs({
    args: argv,
    options: {
      origin: { type: 'string' },
      sha: { type: 'string' },
      'deployment-id': { type: 'string' },
      'github-output': { type: 'string' },
      force: { type: 'string', default: 'false' },
    },
  });
  const root = process.cwd();
  const scope = producerScope(
    root,
    { origin: args.origin, sha: args.sha, deploymentId: args['deployment-id'] },
    env
  );
  const inventory = JSON.parse(
    readFileSync(
      resolve(root, 'docs/product/generated/artist-launch-inventory.json'),
      'utf8'
    )
  ).inventory;
  const packet = lookupPublicReceipt({
    scope,
    inventory,
    transport: createGitHubTransport({ env }),
    force: args.force === 'true',
  });
  const value = packet
    ? Buffer.from(JSON.stringify(packet)).toString('base64')
    : '';
  if (args['github-output'])
    appendFileSync(args['github-output'], `crawl_public_reuse_b64=${value}\n`);
  console.log(
    packet
      ? `[crawl] eligible public observations: ${packet.rows.length}; current auth/discovery/walks remain fresh`
      : '[crawl] no eligible public receipt; cold coverage retained'
  );
  return 0;
}
if (
  process.argv[1] &&
  pathToFileURL(resolve(process.argv[1])).href === import.meta.url
)
  process.exitCode = main();
