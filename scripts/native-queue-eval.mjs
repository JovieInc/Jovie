#!/usr/bin/env node
// Read-only evidence collector. Every gh invocation is an API query or a GET.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  digest,
  evaluate,
  inventoryIdentity,
  SCHEMA,
} from './lib/native-queue-eval.mjs';

/**
 * @param {string[]} argv
 * @param {(command: string, args: string[], options: import('node:child_process').ExecFileSyncOptions) => string} [exec]
 */
export function main(
  argv,
  exec = (command, args, options) =>
    execFileSync(command, args, options).toString()
) {
  const repository = 'JovieInc/Jovie';
  const [command, file, evaluatorSha] = argv;
  if (!['collect', 'evaluate'].includes(command) || !file) {
    throw new Error(
      'Usage: node scripts/native-queue-eval.mjs <collect|evaluate> <bundle.json> [evaluator-sha]'
    );
  }
  if (evaluatorSha && !/^[a-f0-9]{40}$/.test(evaluatorSha))
    throw new Error('Invalid evaluator SHA');
  function gh(args) {
    const result = JSON.parse(
      exec('gh', args, {
        encoding: 'utf8',
        timeout: 60_000,
        maxBuffer: 32 * 1024 * 1024,
      })
    );
    if (result.errors?.length) throw new Error(JSON.stringify(result.errors));
    return result;
  }
  const api = path => gh(['api', `repos/${repository}/${path}`]);
  const pages = path =>
    gh(['api', '--paginate', '--slurp', `repos/${repository}/${path}`]);
  const graphql = query =>
    gh(['api', 'graphql', '-f', `query=${query}`]).data.repository;
  const connection = c => {
    if (!Array.isArray(c?.nodes) || c.pageInfo?.hasNextPage !== false)
      throw new Error('Incomplete GraphQL connection');
    return c.nodes;
  };
  const entryFields =
    'id position state enqueuedAt headCommit {oid} baseCommit {oid} enqueuer {login}';
  function groupEvidence(run) {
    if (!run) return null;
    const jobs = pages(
      `actions/runs/${run.id}/attempts/${run.run_attempt}/jobs?per_page=100`
    ).flatMap(p => p.jobs);
    const readyJob = jobs.find(j => j.name === 'PR Ready');
    const name = `product-lane-final-${run.head_sha}-${run.run_attempt}`;
    const artifact = pages(`actions/runs/${run.id}/artifacts?per_page=100`)
      .flatMap(p => p.artifacts)
      .find(a => a.name === name);
    if (!readyJob || !artifact || artifact.expired) return null;
    const directory = mkdtempSync(join(tmpdir(), 'native-queue-eval-'));
    try {
      exec(
        'gh',
        [
          'run',
          'download',
          String(run.id),
          '--repo',
          repository,
          '--name',
          name,
          '--dir',
          directory,
        ],
        { timeout: 60_000 }
      );
      return {
        readyJob,
        artifact,
        laneReceipt: JSON.parse(
          readFileSync(join(directory, 'final.json'), 'utf8')
        ),
        readyLog: exec(
          'gh',
          ['api', `repos/${repository}/actions/jobs/${readyJob.id}/logs`],
          { encoding: 'utf8', timeout: 60_000, maxBuffer: 8 * 1024 * 1024 }
        ),
      };
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  }
  function checksFor(revision) {
    const checks = pages(
      `commits/${revision}/check-runs?per_page=100&filter=latest`
    ).flatMap(p => p.check_runs);
    const statuses = pages(`commits/${revision}/statuses?per_page=100`).flat();
    return [
      ...checks.map(c => ({
        name: c.name,
        sha: c.head_sha,
        appId: c.app.id,
        id: c.id,
        state: c.status === 'completed' ? c.conclusion : c.status,
        startedAt: c.started_at,
        completedAt: c.completed_at,
        url: c.details_url,
      })),
      ...statuses.map(c => ({
        name: c.context,
        sha: revision,
        id: c.id,
        state: c.state,
        startedAt: c.created_at,
        completedAt: c.updated_at,
        url: c.target_url,
        actor: c.creator.login,
      })),
    ];
  }
  let bundle;
  try {
    bundle = JSON.parse(readFileSync(file, 'utf8'));
  } catch (error) {
    if (command !== 'collect' || error.code !== 'ENOENT') throw error;
    bundle = {
      schema: SCHEMA,
      repository,
      startedAt: new Date().toISOString(),
      snapshots: [],
      merges: [],
    };
  }
  if (evaluatorSha) bundle.evaluatorSha = evaluatorSha;
  if (command === 'collect') {
    const s = {
      repository,
      startedAt: new Date().toISOString(),
      errors: [],
      prs: [],
      complete: false,
    };
    try {
      s.main = api('git/ref/heads/main').object.sha;
      s.policySha = s.main;
      const rules = api('rules/branches/main');
      const ids = [...new Set(rules.map(r => r.ruleset_id))];
      const full = ids.map(id => api(`rulesets/${id}`));
      const branch = graphql(
        'query {repository(owner:"JovieInc",name:"Jovie") {ref(qualifiedName:"refs/heads/main") {branchProtectionRule {id}}}}'
      );
      s.policy = {
        required: rules
          .filter(r => r.type === 'required_status_checks')
          .flatMap(r => r.parameters.required_status_checks),
        review: rules.find(r => r.type === 'pull_request')?.parameters,
        queue: rules.find(r => r.type === 'merge_queue')?.parameters,
        bypassActors: full.flatMap(r => r.bypass_actors ?? ['UNAVAILABLE']),
        classicProtection: branch.ref.branchProtectionRule,
        enforcement: full.every(r => r.enforcement === 'active')
          ? 'active'
          : 'unknown',
        rules,
        full,
      };
      s.policyDigest = digest(s.policy);
      // Snapshot the actual event-driven controller budget. No unrelated timer
      // or saved heartbeat is treated as proof of successful future execution.
      const policySource = path => ({
        ...api(`contents/${path}?ref=${s.main}`),
        ref: s.main,
      });
      s.scheduler = {
        workflow: policySource('.github/workflows/merge-queue-autoenroll.yml'),
        drain: policySource('scripts/drain-pr-queue.sh'),
      };
      // Historical source can be read later because the API lookup is pinned to
      // its immutable commit. Keep original snapshots intact and date this read.
      bundle.policySources ??= {};
      for (const ref of new Set(bundle.snapshots.map(snap => snap.policySha))) {
        if (bundle.policySources[ref]) continue;
        const source = path => ({ ...api(`contents/${path}?ref=${ref}`), ref });
        bundle.policySources[ref] = {
          readAt: new Date().toISOString(),
          workflow: source('.github/workflows/merge-queue-autoenroll.yml'),
          drain: source('scripts/drain-pr-queue.sh'),
        };
      }
      const prs = [];
      let cursor = null;
      do {
        const result =
          graphql(`query {repository(owner:"JovieInc",name:"Jovie") {pullRequests(first:10,states:OPEN${cursor ? `,after:${JSON.stringify(cursor)}` : ''}) {
        nodes {number title state isDraft headRefOid baseRefOid baseRefName mergeable reviewDecision isInMergeQueue
          labels(first:100) {nodes {name} pageInfo {hasNextPage}}
          files(first:100) {nodes {path} pageInfo {hasNextPage}}
          commits(last:1) {nodes {commit {oid statusCheckRollup {contexts(first:100) {
            nodes {__typename ... on CheckRun {databaseId name status conclusion startedAt completedAt detailsUrl checkSuite {app {databaseId}}}
              ... on StatusContext {id context state createdAt updatedAt targetUrl creator {login}}}
            pageInfo {hasNextPage}}}}}}
          mergeQueueEntry {${entryFields}} autoMergeRequest {enabledAt}}
        pageInfo {hasNextPage endCursor}}}}`).pullRequests;
        prs.push(
          ...result.nodes.map(p => ({
            ...p,
            observedAt: new Date().toISOString(),
          }))
        );
        cursor = result.pageInfo.hasNextPage ? result.pageInfo.endCursor : null;
        if (result.pageInfo.hasNextPage && !cursor)
          throw new Error('Missing inventory cursor');
      } while (cursor);
      // Keep per-PR evidence bound to the inventory's immutable source head.
      for (const p of prs) {
        try {
          p.labels = connection(p.labels).map(l => l.name);
          p.files = p.files?.pageInfo?.hasNextPage
            ? pages(`pulls/${p.number}/files?per_page=100`)
                .flat()
                .map(f => f.filename)
            : connection(p.files).map(f => f.path);
          const commit = p.commits.nodes[0]?.commit;
          if (commit?.oid !== p.headRefOid)
            throw new Error('Source checks head mismatch');
          p.checks = commit.statusCheckRollup?.contexts?.pageInfo?.hasNextPage
            ? checksFor(p.headRefOid)
            : (commit.statusCheckRollup === null
                ? []
                : connection(commit.statusCheckRollup?.contexts)
              ).map(c => ({
                name: c.name ?? c.context,
                sha: commit.oid,
                appId: c.checkSuite?.app?.databaseId,
                id: c.databaseId ?? c.id,
                state: (c.status
                  ? c.status === 'COMPLETED'
                    ? c.conclusion
                    : c.status
                  : c.state
                )?.toLowerCase(),
                startedAt: c.startedAt ?? c.createdAt,
                completedAt: c.completedAt ?? c.updatedAt,
                url: c.detailsUrl ?? c.targetUrl,
              }));
          delete p.commits;
        } catch (error) {
          s.errors.push(`PR ${p.number}: ${error.message}`);
          p.checks = null;
        }
        s.prs.push(p);
      }
      s.cycles = api(
        'actions/workflows/merge-queue-autoenroll.yml/runs?per_page=30'
      ).workflow_runs;
      const tracked = new Map(
        bundle.snapshots
          .flatMap(snap => snap.prs ?? [])
          .filter(p => p.isInMergeQueue && p.mergeQueueEntry?.headCommit?.oid)
          .map(p => [p.number, p])
      );
      for (const [number, p] of tracked) {
        const current = api(`pulls/${number}`);
        if (!current.merged) continue;
        const admission = bundle.snapshots.find(snap =>
          snap.prs?.some(
            q => q.number === number && q.headRefOid === p.headRefOid
          )
        );
        const timeline =
          graphql(`query {repository(owner:"JovieInc",name:"Jovie") {pullRequest(number:${number}) {
        timelineItems(last:100,itemTypes:[ADDED_TO_MERGE_QUEUE_EVENT,REMOVED_FROM_MERGE_QUEUE_EVENT,MERGED_EVENT]) {
          nodes {__typename ... on AddedToMergeQueueEvent {id createdAt actor {login} enqueuer {login}}
            ... on RemovedFromMergeQueueEvent {id createdAt reason actor {login} enqueuer {login} beforeCommit {oid}}
            ... on MergedEvent {id createdAt actor {login} commit {oid} mergeRefName}}
          pageInfo {hasPreviousPage}}}}}`).pullRequest.timelineItems;
        const groupHead = p.mergeQueueEntry.headCommit.oid;
        const runs = api(
          `actions/workflows/ci.yml/runs?head_sha=${groupHead}&event=merge_group&per_page=100`
        ).workflow_runs;
        const receipt = {
          repository,
          number,
          head: current.head.sha,
          commit: current.merge_commit_sha,
          groupHead,
          groupBase: p.mergeQueueEntry.baseCommit.oid,
          timeline,
          main: s.main,
          policyDigest: admission.policyDigest,
          observedAt: new Date().toISOString(),
          run: runs[0],
          checks: checksFor(groupHead),
          compare: api(`compare/${current.merge_commit_sha}...${s.main}`),
          gateEvidence: groupEvidence(runs[0]),
        };
        bundle.merges = bundle.merges.filter(m => m.number !== number);
        bundle.merges.push(receipt);
      }
      s.readback = connection(
        graphql(`query InventoryReadback {repository(owner:"JovieInc",name:"Jovie") {pullRequests(first:100,states:OPEN) {
        nodes {number headRefOid isInMergeQueue mergeQueueEntry {id headCommit {oid} baseCommit {oid}}} pageInfo {hasNextPage}}}}`)
          .pullRequests
      );
      s.readbackAt = new Date().toISOString();
      if (inventoryIdentity(s.prs) !== inventoryIdentity(s.readback))
        throw new Error('Inventory changed during collection');
      if (bundle.evaluatorSha) {
        const run = api(
          `actions/workflows/ci.yml/runs?head_sha=${bundle.evaluatorSha}&per_page=100`
        ).workflow_runs[0];
        const job =
          run?.status === 'completed'
            ? pages(
                `actions/runs/${run.id}/attempts/${run.run_attempt}/jobs?per_page=100`
              )
                .flatMap(page => page.jobs)
                .find(job => job.name === 'ci-fast (remaining)')
            : null;
        const log =
          job?.status === 'completed'
            ? exec(
                'gh',
                ['api', `repos/${repository}/actions/jobs/${job.id}/logs`],
                {
                  encoding: 'utf8',
                  timeout: 60000,
                  maxBuffer: 32 * 1024 * 1024,
                }
              )
            : null;
        bundle.validation = { run, job, log };
      }
      s.complete = s.errors.length === 0;
    } catch (error) {
      s.errors.push(error.message);
    }
    s.finishedAt = new Date().toISOString();
    bundle.snapshots.push(s);
    writeFileSync(file, `${JSON.stringify(bundle, null, 2)}\n`);
  }
  const result = evaluate(bundle);
  writeFileSync(`${file}.result.json`, `${JSON.stringify(result, null, 2)}\n`);
  /** @type {Record<string, number>} */
  const counts = {};
  for (const p of result.inventory) counts[p.type] = (counts[p.type] ?? 0) + 1;
  console.log(JSON.stringify({ ...result, inventory: counts }, null, 2));
  return result;
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  process.exitCode = main(process.argv.slice(2)).status === 'PASS' ? 0 : 1;
}
