#!/usr/bin/env node
// Files and closes Linear issues from a Mac dogfood run directory, prints the
// agent-found vs Tim-found metric, and answers the dead-man question.
//   node scripts/mac-dogfood-file.mjs --from DIR [--no-file] [--metrics]
//   node scripts/mac-dogfood-file.mjs --liveness DIR --max-staleness-minutes N
// Needs LINEAR_API_KEY (run on gem; the Mac host only observes).
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { linearRequest } from './lib/linear-cooldown.mjs';
import {
  closeLinearIssueByFingerprint,
  ensureLinearLabel,
  JOVIE_TEAM_ID,
  remediationTriggersEnabled,
  upsertLinearIssueByTitleFingerprint,
} from './lib/linear-issue-intake.mjs';
import {
  MAC_MISSIONS,
  macFindingIssue,
  macLiveness,
  macTargetKey,
  weeklyMacDefectMetrics,
} from './lib/mac-dogfood.mjs';
import { fingerprintFor } from './lib/prod-dogfood.mjs';

const LABELS = [
  ['dogfood-agent', '#10B981'],
  ['mac-dogfood', '#0EA5E9'],
  ['Bug', '#EB5757'],
  ['agent-ready', '#4EA7FC'],
];

const readJson = file => JSON.parse(readFileSync(file, 'utf8'));

/** Fingerprint of a check as the filer dedupes it. */
export function fingerprintOf({ channel, mission, check }) {
  return fingerprintFor({
    mission,
    check: check.id,
    target: macTargetKey(check.target),
  });
}

/**
 * Pure plan: which findings to file and which open issues the run proves fixed.
 * A fingerprint is "proven passing" only when a check with the same fingerprint
 * ran and passed in this run (unverified is never a close).
 */
export function planFiling({ findings, checks, run, openIssues }) {
  const byFp = new Map();
  for (const f of findings) {
    const fp = fingerprintOf(f);
    const group = byFp.get(fp) ?? { first: f, channels: [] };
    group.channels.push(f.channel);
    byFp.set(fp, group);
  }
  // A fingerprint is proven passing only if it never failed on any lane this run.
  const failing = new Set(byFp.keys());
  const passed = new Set(
    checks.filter(c => c.check.status === 'passed').map(c => fingerprintOf(c))
  );
  const toFile = [...byFp.values()].map(({ first, channels }) =>
    macFindingIssue({
      check: first.check,
      mission: MAC_MISSIONS.find(m => m.id === first.mission),
      observed: channels.map(channel => ({
        channel,
        identity: run[channel]?.identity,
        web: run[channel]?.web,
      })),
      runNote: `local cua-driver run at ${run[first.channel]?.completedAt ?? 'unknown time'}`,
    })
  );
  const toClose = openIssues
    .map(i => ({
      issue: i,
      fp: /^\[(dogfood-mac-[a-z0-9-]+)\]/.exec(i.title)?.[1],
    }))
    .filter(x => x.fp && !failing.has(x.fp) && passed.has(x.fp));
  return { toFile, toClose };
}

async function openMacIssues({ apiKey, fetchImpl = fetch }) {
  const out = [];
  let after = null;
  for (let page = 0; page < 5; page++) {
    const result = await linearRequest({
      key: apiKey,
      query: `query($team:ID!,$after:String){ issues(first:100, after:$after, filter:{ team:{id:{eq:$team}}, labels:{name:{eq:"mac-dogfood"}}, state:{type:{nin:["completed","canceled"]}} }){ pageInfo{hasNextPage endCursor} nodes{ identifier title url } } }`,
      variables: { team: JOVIE_TEAM_ID, after },
      fetchImpl,
    });
    const data = result.data?.data?.issues;
    if (!result.ok || !data)
      return { ok: false, reason: result.reason ?? `status ${result.status}` };
    out.push(...data.nodes);
    if (!data.pageInfo.hasNextPage) break;
    after = data.pageInfo.endCursor;
  }
  return { ok: true, issues: out };
}

async function macDefectRows({ apiKey, weeks = 5, fetchImpl = fetch }) {
  const since = new Date(Date.now() - weeks * 7 * 86_400_000).toISOString();
  const rows = [];
  let after = null;
  for (let page = 0; page < 10; page++) {
    const result = await linearRequest({
      key: apiKey,
      query: `query($team:ID!,$since:DateTimeOrDuration!,$after:String){ issues(first:100, after:$after, filter:{ team:{id:{eq:$team}}, createdAt:{gte:$since}, labels:{ name:{ in:["mac-dogfood","escaped-defect"] } } }){ pageInfo{hasNextPage endCursor} nodes{ identifier createdAt labels{nodes{name}} } } }`,
      variables: { team: JOVIE_TEAM_ID, since, after },
      fetchImpl,
    });
    const data = result.data?.data?.issues;
    if (!result.ok || !data)
      return {
        ok: false,
        rows,
        reason: result.reason ?? `status ${result.status}`,
      };
    rows.push(
      ...data.nodes.map(n => ({
        id: n.identifier,
        createdAt: n.createdAt,
        labels: n.labels.nodes.map(l => l.name),
      }))
    );
    if (!data.pageInfo.hasNextPage) break;
    after = data.pageInfo.endCursor;
  }
  return { ok: true, rows };
}

function parseArgs(argv) {
  const a = { file: true };
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    if (k === '--from') a.from = argv[++i];
    else if (k === '--no-file') a.file = false;
    else if (k === '--metrics') a.metrics = true;
    else if (k === '--liveness') a.liveness = argv[++i];
    else if (k === '--max-staleness-minutes') a.maxStale = Number(argv[++i]);
  }
  return a;
}

export async function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  if (args.liveness) {
    const certification = readJson(
      path.join(args.liveness, 'certification.json')
    );
    const res = macLiveness({
      certification,
      maxStalenessMinutes: args.maxStale ?? 1500,
    });
    console.log(JSON.stringify(res));
    process.exitCode = res.alive ? 0 : 3;
    return;
  }
  const apiKey = process.env.LINEAR_API_KEY ?? '';
  if (args.metrics) {
    const got = apiKey
      ? await macDefectRows({ apiKey })
      : { ok: false, reason: 'no LINEAR_API_KEY' };
    console.log(
      JSON.stringify(
        got.ok ? weeklyMacDefectMetrics(got.rows) : { error: got.reason },
        null,
        2
      )
    );
    return;
  }
  if (!args.from) throw new Error('--from DIR is required');
  const findings = readJson(path.join(args.from, 'findings.json'));
  const checks = readJson(path.join(args.from, 'checks.json'));
  const run = readJson(path.join(args.from, 'run.json'));
  const open = apiKey
    ? await openMacIssues({ apiKey })
    : { ok: false, reason: 'no LINEAR_API_KEY' };
  const plan = planFiling({
    findings,
    checks,
    run,
    openIssues: open.ok ? open.issues : [],
  });
  const filed = [];
  const closed = [];
  const notes = [];
  if (args.file && apiKey && remediationTriggersEnabled(process.env)) {
    const labelIds = [];
    for (const [name, color] of LABELS) {
      const l = await ensureLinearLabel({
        name,
        apiKey,
        fetchImpl: fetch,
        color,
      });
      if (l.ok && l.id) labelIds.push(l.id);
    }
    for (const issue of plan.toFile) {
      const res = await upsertLinearIssueByTitleFingerprint({
        fingerprint: issue.fingerprint,
        labelKey: issue.fingerprint,
        title: issue.title,
        description: issue.description,
        priority: issue.priority,
        createStateName: 'Todo',
        createLabelIds: labelIds,
        keepLabelIds: labelIds.slice(0, 2),
        reopenTerminal: true,
        apiKey,
      });
      filed.push({
        fingerprint: issue.fingerprint,
        ok: res.ok,
        action: res.action,
        id: res.identifier ?? res.issue?.identifier ?? null,
        reason: res.reason,
      });
    }
    for (const { issue, fp } of plan.toClose) {
      const res = await closeLinearIssueByFingerprint({
        fingerprint: fp,
        labelKey: fp,
        comment: `Verified passing in the installed Mac app by the Mac dogfood agent (${new Date().toISOString()}).`,
        runId: String(Date.now()),
        apiKey,
      });
      closed.push({ fingerprint: fp, ok: res.ok, id: issue.identifier });
    }
  } else {
    notes.push(
      args.file
        ? 'filing skipped: no LINEAR_API_KEY or triggers disabled'
        : 'dry run (--no-file)'
    );
  }
  if (!open.ok)
    notes.push(`could not list open mac-dogfood issues: ${open.reason}`);
  const result = {
    planned: plan.toFile.map(i => i.fingerprint),
    filed,
    closed,
    notes,
  };
  writeFileSync(
    path.join(args.from, 'filing.json'),
    `${JSON.stringify(result, null, 2)}\n`
  );
  console.log(JSON.stringify(result, null, 2));
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  main().catch(err => {
    console.error(err);
    process.exitCode = 1;
  });
}
