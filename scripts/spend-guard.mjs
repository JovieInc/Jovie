#!/usr/bin/env node
/**
 * Vercel spend guard. Reads budget, usage and project settings with the Vercel CLI (VERCEL_TOKEN or
 * the local login), evaluates scripts/lib/spend-guard.mjs, and prints one JSON report.
 *
 *   node scripts/spend-guard.mjs [--apply] [--audit <file.jsonl>] [--now <ISO>]
 *
 * Without --apply it is read-only. --apply performs only the actions the policy marks autoApply
 * (setting a project's ignored-build command), each logged to the audit trail with the previous
 * value so it can be reverted. It never changes a budget.
 */
import { execFileSync } from 'node:child_process';
import { appendFileSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildAnomalies,
  dailySeries,
  evaluate,
  oneLiner,
  projectAnomalies,
  projectTotals,
  topDriver,
  totalCost,
} from './lib/spend-guard.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const policyFile = JSON.parse(
  readFileSync(resolve(ROOT, 'ops/registry/vercel-projects.json'), 'utf8')
);
const args = process.argv.slice(2);
const flag = n => args.includes(n);
const opt = n => {
  const i = args.indexOf(n);
  return i >= 0 ? args[i + 1] : undefined;
};
const now = opt('--now') ? new Date(opt('--now')) : new Date();
const scope = process.env.VERCEL_SCOPE || policyFile.team;
const bin = (process.env.VERCEL_BIN || 'npx -y vercel@latest').split(' ');

function vercel(rest) {
  const out = execFileSync(
    bin[0],
    [
      ...bin.slice(1),
      ...rest,
      '--scope',
      scope,
      ...(process.env.VERCEL_TOKEN
        ? ['--token', process.env.VERCEL_TOKEN]
        : []),
    ],
    {
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'ignore'],
    }
  );
  const start = out.search(/[[{]/u);
  return JSON.parse(out.slice(start));
}
/** Vercel usage days are midnight to midnight Los Angeles time. */
const isoDay = d =>
  d.toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' });
const cycleStart = (d, day) => {
  const s = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), day));
  if (d.getUTCDate() < day) s.setUTCMonth(s.getUTCMonth() - 1);
  return s;
};

const budgets = vercel(['budgets', '--format', 'json']).budgets ?? [];
const team = budgets.find(b => b.scope === 'team');
const budgetUsd = Number(team?.amount ?? policyFile.budget.amountUsd);
const start = cycleStart(now, policyFile.budget.cycleStartDay);
const cycleUsage = vercel(['usage', '--since', isoDay(start), '--json']);
const spentUsd =
  totalCost(cycleUsage.services) * policyFile.spentCalibration.factor;
const series = dailySeries(
  vercel([
    'usage',
    '--breakdown',
    'daily',
    '--since',
    isoDay(new Date(now.getTime() - 14 * 86_400_000)),
    '--json',
  ])
);
const baseline = projectTotals(
  vercel([
    'usage',
    '--group-by',
    'project',
    '--since',
    isoDay(new Date(now.getTime() - 8 * 86_400_000)),
    '--until',
    isoDay(new Date(now.getTime() - 86_400_000)),
    '--json',
  ])
);
let todayTotals = {};
try {
  todayTotals = projectTotals(
    vercel(['usage', '--group-by', 'project', '--since', isoDay(now), '--json'])
  );
} catch {
  /* no usage yet today */
}
const la = new Date(
  now.toLocaleString('en-US', { timeZone: 'America/Los_Angeles' })
);
const hoursElapsed = la.getHours() + la.getMinutes() / 60;

const apiProjects = vercel(['api', '/v9/projects?limit=100']).projects ?? [];
const projects = apiProjects.map(p => ({
  id: p.id,
  name: p.name,
  ignoreCommand: p.commandForIgnoringBuildStep ?? null,
  active: Boolean(p.latestDeployments?.length || p.targets?.production),
}));
const buildCounts = {};
try {
  const since = now.getTime() - 24 * 3_600_000;
  const deployments =
    vercel(['api', `/v6/deployments?limit=100&since=${since}`]).deployments ??
    [];
  for (const d of deployments) {
    const name = d.name,
      hour = Math.floor((now.getTime() - d.createdAt) / 3_600_000);
    if (hour < 0 || hour > 23) continue;
    (buildCounts[name] ??= new Array(24).fill(0))[23 - hour] += 1;
  }
} catch {
  /* deployment counts are best-effort */
}

const policy = Object.fromEntries(
  Object.entries(policyFile.projects)
    .filter(([, v]) => v.ignoreCommand)
    .map(([k, v]) => [k, { ignoreCommand: v.ignoreCommand }])
);
const anomalies = [
  ...projectAnomalies({ todayTotals, baselineTotals: baseline, hoursElapsed }),
  ...buildAnomalies(buildCounts),
];
const report = evaluate({
  budgetUsd,
  spentUsd,
  series,
  periodEnd: policyFile.budget.periodEnd,
  now,
  anomalies,
  projects,
  policy,
  watch: Object.keys(policyFile.projects),
});
const today = series.find(d => d.day === isoDay(now)) ?? series.at(-1);
const driver = topDriver(today?.services);
const unprotected = projects
  .filter(p => policyFile.projects[p.name] && !p.ignoreCommand && p.active)
  .map(p => p.name);

const audit = opt('--audit') ?? process.env.SPEND_GUARD_AUDIT;
const log = entry => {
  if (audit)
    appendFileSync(
      audit,
      `${JSON.stringify({ at: new Date().toISOString(), actor: 'spend-guard', ...entry })}\n`
    );
};
const autoFixed = [];
for (const a of report.actions.filter(x => x.autoApply)) {
  if (!flag('--apply')) {
    log({ ...a, applied: false, reason: 'dry-run' });
    continue;
  }
  try {
    vercel([
      'api',
      `/v9/projects/${a.projectId}`,
      '-X',
      'PATCH',
      '-F',
      `commandForIgnoringBuildStep=${a.to}`,
    ]);
    autoFixed.push(`ignored-build:${a.project}`);
    log({ ...a, applied: true });
  } catch (error) {
    log({ ...a, applied: false, error: String(error.message).slice(0, 200) });
  }
}
const percent = (spentUsd / budgetUsd) * 100;
const message = oneLiner({
  percent,
  spentUsd,
  budgetUsd,
  projectedPauseDate: report.projection.projectedPauseDate,
  driver: anomalies[0]
    ? `${anomalies[0].project} (${driver?.resource ?? 'unknown resource'})`
    : driver
      ? `${driver.resource} $${driver.usd.toFixed(2)}/day`
      : undefined,
  autoFixed,
  decision: report.level >= 75 ? 'raise budget or accept pause' : undefined,
});
process.stdout.write(
  `${JSON.stringify({ ...report, unprotectedProjects: unprotected, message, webhookConfigured: Boolean(team?.webhookUrl) })}\n`
);
