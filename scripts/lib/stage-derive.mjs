/**
 * Derive jovie-stage-event/v1 rows from durable receipts (GitHub PR timelines,
 * check suites, controller jobs, Linear history, producer feeds). Pure: the
 * collector (scripts/lib/stage-collect.mjs) supplies the raw evidence. Because
 * every derived stage comes from a receipt that already exists, re-running
 * the derivation over a 28d window backfills history on day one.
 */

import { chainStages } from './stage-events.mjs';

const JOV_ID = /\bjov-(\d+)\b/i;
const RED = new Set(['FAILURE', 'ERROR', 'TIMED_OUT', 'STARTUP_FAILURE']);
const PR_EVENTS = new Set(['pull_request', 'pull_request_target']);
const ms = at => Date.parse(at);
const earliest = list =>
  list.filter(Boolean).sort((a, b) => ms(a) - ms(b))[0] ?? null;
const latest = list =>
  list.filter(Boolean).sort((a, b) => ms(b) - ms(a))[0] ?? null;

/** JOV-123 from the branch first (lanes branches carry it), then the title. */
export function linearIdFor(pr) {
  const match =
    String(pr?.headRefName ?? '').match(JOV_ID) ??
    String(pr?.title ?? '').match(JOV_ID);
  return match ? `JOV-${match[1]}` : null;
}

/** Same lane classifier as the SLO lead-time split. */
export function laneFor(pr) {
  const first = String(pr?.headRefName ?? '')
    .toLowerCase()
    .split('/')[0];
  if (first === 'devin-ai-integration') return 'devin';
  return ['devin', 'codex', 'claude', 'dependabot'].includes(first)
    ? first
    : (pr?.author ?? 'other');
}

/**
 * Production generations from Production Controller runs. Main is linear
 * (squash merges through the queue), so a generation whose head is PR X's
 * merge commit ships every PR merged at or before X. `shaMergedAt` maps merge
 * commit → mergedAt; the head commit timestamp is only a fallback because a
 * merge-group commit is created before the PR is marked merged.
 */
export function releaseGenerations(controllers, shaMergedAt = new Map()) {
  const generations = [];
  for (const run of controllers?.production ?? []) {
    const jobs = run.jobs ?? [];
    const ok = name =>
      jobs.find(j => j.conclusion === 'SUCCESS' && name(j.name ?? ''));
    const promote = ok(n => n.endsWith('Promote to Production'));
    const verified = ok(n => n === 'Production Verified');
    if (!promote && !verified) continue;
    generations.push({
      sha: run.headSha,
      headCommitAt:
        shaMergedAt.get(run.headSha) ?? run.headCommitAt ?? run.createdAt,
      promoteStartedAt: promote?.startedAt ?? null,
      deployedAt: promote?.completedAt ?? null,
      verifiedAt: verified?.completedAt ?? null,
      runUrl: run.url,
    });
  }
  return generations.sort((a, b) => ms(a.headCommitAt) - ms(b.headCommitAt));
}

function firstGeneration(generations, mergedAt, field) {
  const candidates = generations
    .filter(g => g[field] && ms(g.headCommitAt) >= ms(mergedAt))
    .sort((a, b) => ms(a[field]) - ms(b[field]));
  return candidates[0] ?? null;
}

function feedStampsFor(feedStamps, keys) {
  return keys.flatMap(key => feedStamps.get(key) ?? []);
}

/** Index producer-feed events as stamps keyed by entityId. */
export function indexFeedEvents(events) {
  const out = new Map();
  for (const event of events ?? []) {
    const key = `${event.entityType}\u0000${event.entityId}`;
    if (!out.has(key)) out.set(key, []);
    out.get(key).push({
      stage: event.stage,
      at: event.enteredAt,
      actor: event.actor,
      sourceReceipt: event.sourceReceipt,
    });
  }
  return out;
}

export function deriveShippingEvents(
  { prs, linearIssues = {}, generations = [], feed = new Map() },
  manifest
) {
  const events = [];
  for (const pr of prs ?? []) {
    if (!pr?.mergedAt) continue;
    const entityId = `${pr.repository}#${pr.number}`;
    const prUrl = `https://github.com/${pr.repository}/pull/${pr.number}`;
    const timeline = pr.timeline ?? [];
    const before = type =>
      timeline
        .filter(e => e.type === type && ms(e.at) <= ms(pr.mergedAt))
        .map(e => e.at);
    const stamps = [
      { stage: 'pr-open', at: pr.createdAt, sourceReceipt: prUrl },
      {
        stage: 'ready',
        at: latest(before('ready_for_review')) ?? pr.createdAt,
        sourceReceipt: prUrl,
      },
      {
        stage: 'queued',
        at: latest(before('added_to_merge_queue')),
        sourceReceipt: prUrl,
      },
      { stage: 'merged', at: pr.mergedAt, sourceReceipt: prUrl },
    ];
    const deployed = firstGeneration(generations, pr.mergedAt, 'deployedAt');
    if (deployed)
      stamps.push({
        stage: 'deployed',
        at: deployed.deployedAt,
        sourceReceipt: deployed.runUrl,
      });
    const verified = firstGeneration(generations, pr.mergedAt, 'verifiedAt');
    if (verified)
      stamps.push({
        stage: 'verified',
        at: verified.verifiedAt,
        sourceReceipt: verified.runUrl,
      });
    const linearId = linearIdFor(pr);
    const issue = linearId ? linearIssues[linearId] : null;
    if (issue?.createdAt) {
      const url = `https://linear.app/jovie/issue/${linearId}`;
      const toType = type =>
        earliest(
          (issue.history ?? []).filter(h => h.toType === type).map(h => h.at)
        );
      stamps.push(
        { stage: 'issue', at: issue.createdAt, sourceReceipt: url },
        {
          stage: 'eligible',
          at:
            toType('unstarted') ??
            (issue.initialType === 'unstarted' ? issue.createdAt : null),
          sourceReceipt: url,
        },
        {
          stage: 'admitted',
          at: issue.startedAt ?? toType('started'),
          sourceReceipt: url,
        }
      );
    }
    stamps.push(
      ...feedStampsFor(feed, [
        `shipping\u0000${entityId}`,
        ...(linearId ? [`shipping\u0000${linearId}`] : []),
      ])
    );
    // Stages are observed independently; drop any that land after merge
    // except the post-merge ones so a re-labelled issue cannot invert order.
    const kept = stamps.filter(
      s =>
        s.at &&
        (['deployed', 'verified'].includes(s.stage) ||
          ms(s.at) <= ms(pr.mergedAt))
    );
    events.push(
      ...chainStages('shipping', entityId, kept, manifest, {
        actor: laneFor(pr),
      })
    );
  }
  return events;
}

/** Red→green episodes on merged PRs, from commit check rollups. */
export function deriveRemediationEvents({ prs, feed = new Map() }, manifest) {
  const events = [];
  for (const pr of prs ?? []) {
    const commits = [...(pr?.commits ?? [])].sort(
      (a, b) => ms(a.committedDate) - ms(b.committedDate)
    );
    const prUrl = `https://github.com/${pr.repository}/pull/${pr.number}`;
    let red = null;
    for (const commit of commits) {
      const suites = (commit.suites ?? []).filter(s => PR_EVENTS.has(s.event));
      const failing = suites.filter(s => RED.has(s.conclusion));
      if (!red && (RED.has(commit.rollup) || failing.length)) {
        red = {
          sha: commit.oid,
          at: earliest(failing.map(s => s.updatedAt)) ?? commit.committedDate,
        };
        continue;
      }
      if (red && commit.rollup === 'SUCCESS') {
        const greenAt =
          latest(suites.map(s => s.updatedAt)) ?? commit.committedDate;
        const entityId = `${pr.repository}#${pr.number}@${String(red.sha).slice(0, 12)}`;
        const classified = earliest(
          (pr.timeline ?? [])
            .filter(
              e =>
                e.type === 'labeled' &&
                String(e.label ?? '').startsWith('lane-fix-') &&
                ms(e.at) >= ms(red.at) &&
                ms(e.at) <= ms(greenAt)
            )
            .map(e => e.at)
        );
        const stamps = [
          { stage: 'red', at: red.at, sourceReceipt: prUrl },
          { stage: 'classified', at: classified, sourceReceipt: prUrl },
          { stage: 'green', at: greenAt, sourceReceipt: prUrl },
          ...feedStampsFor(feed, [`remediation\u0000${entityId}`]),
        ].filter(s => s.at && ms(s.at) >= ms(red.at));
        events.push(
          ...chainStages('remediation', entityId, stamps, manifest, {
            actor: laneFor(pr),
          })
        );
        red = null;
      }
    }
  }
  return events;
}

/** One release entity per production generation that promoted or verified. */
export function deriveReleaseEvents({ controllers }, manifest) {
  const staging = new Map();
  for (const run of controllers?.staging ?? [])
    if (run.headSha && !staging.has(run.headSha)) staging.set(run.headSha, run);
  const events = [];
  for (const run of controllers?.production ?? []) {
    const jobs = run.jobs ?? [];
    const ok = name =>
      jobs.find(j => j.conclusion === 'SUCCESS' && name(j.name ?? ''));
    const promote = ok(n => n.endsWith('Promote to Production'));
    const verified = ok(n => n === 'Production Verified');
    if (!promote && !verified) continue;
    const stagingRun = staging.get(run.headSha);
    const canary = (stagingRun?.jobs ?? []).find(
      j => j.conclusion === 'SUCCESS' && /Canary Health Gate/.test(j.name ?? '')
    );
    const stamps = [
      {
        stage: 'staging',
        at: stagingRun?.createdAt ?? null,
        sourceReceipt: stagingRun?.url,
      },
      {
        stage: 'canary',
        at: canary?.startedAt,
        sourceReceipt: stagingRun?.url,
      },
      { stage: 'prod', at: promote?.startedAt, sourceReceipt: run.url },
      { stage: 'verified', at: verified?.completedAt, sourceReceipt: run.url },
    ].filter(s => s.at && s.sourceReceipt);
    events.push(
      ...chainStages(
        'release',
        `JovieInc/Jovie@${run.headSha}`,
        stamps,
        manifest,
        {
          actor: 'production-controller',
        }
      )
    );
  }
  return events;
}

/** LogYourBody iOS Release Loop runs → merge/testflight/review (+feed). */
export function deriveIosReleaseEvents({ lyb, feed = new Map() }, manifest) {
  const events = [];
  for (const run of lyb?.runs ?? []) {
    const jobs = run.jobs ?? [];
    const done = prefix =>
      jobs.find(
        j => j.conclusion === 'SUCCESS' && (j.name ?? '').startsWith(prefix)
      )?.completedAt ?? null;
    const testflight = done('Deploy to TestFlight');
    if (!testflight) continue;
    const entityId = `JovieInc/LogYourBody@${run.headSha}`;
    const stamps = [
      { stage: 'merge', at: run.createdAt, sourceReceipt: run.url },
      { stage: 'testflight', at: testflight, sourceReceipt: run.url },
      {
        stage: 'review',
        at: done('Deploy to App Store'),
        sourceReceipt: run.url,
      },
      ...feedStampsFor(feed, [`ios-release\u0000${entityId}`]),
    ].filter(s => s.at);
    events.push(
      ...chainStages('ios-release', entityId, stamps, manifest, {
        actor: 'ios-release-loop',
      })
    );
  }
  return events;
}

/**
 * All derived + fed events. Feed events for entity types with no derivation
 * (summer-turn) pass through as-is; feed stamps for derived entity types are
 * merged into the derived chains above.
 */
export function deriveStageEvents(raw, manifest) {
  const feedEvents = Object.values(raw?.feeds ?? {}).flatMap(
    feed => feed?.events ?? []
  );
  const feed = indexFeedEvents(feedEvents);
  const shaMergedAt = new Map(
    (raw?.prs ?? [])
      .filter(pr => pr?.mergeCommitSha && pr.mergedAt)
      .map(pr => [pr.mergeCommitSha, pr.mergedAt])
  );
  const generations = releaseGenerations(raw?.controllers, shaMergedAt);
  const derivedTypes = new Set([
    'shipping',
    'remediation',
    'release',
    'ios-release',
  ]);
  return [
    ...deriveShippingEvents(
      {
        prs: raw?.prs,
        linearIssues: raw?.linearIssues,
        generations,
        feed,
      },
      manifest
    ),
    ...deriveRemediationEvents({ prs: raw?.prs, feed }, manifest),
    ...deriveReleaseEvents({ controllers: raw?.controllers }, manifest),
    ...deriveIosReleaseEvents({ lyb: raw?.lyb, feed }, manifest),
    ...feedEvents.filter(event => !derivedTypes.has(event.entityType)),
  ];
}
