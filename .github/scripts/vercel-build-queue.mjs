#!/usr/bin/env node
// Measures how long a production-path Vercel deployment waited in the team
// build queue and what it waited behind. Observability only: it never mutates
// Vercel and never fails a release (2026-10-20: two staging generations sat
// QUEUED 30+ min behind 77 log-your-body backup/** previews in a one-slot team
// and surfaced only as a vague canary timeout).
import { appendFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const API_BASE = 'https://api.vercel.com';
export const QUEUE_WARN_SECONDS = 120;
const BOT_BRANCH =
  /^(?:codex|claude|cursor|grok|devin|gem|bot|dependabot|renovate|copilot|codegen-bot|linear)[/-]/;

const seconds = ms => Math.max(0, Math.round(ms / 1000));
const timestamp = value => {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
};

/** Branch class of a deployment, used to name what production waited behind. */
export function classifyDeployment(deployment) {
  const project = String(deployment?.name ?? 'unknown');
  const ref = String(deployment?.meta?.githubCommitRef ?? '');
  if (deployment?.target === 'production') return `${project}/production`;
  if (!ref) return `${project}/cli-preview`;
  if (ref.startsWith('backup/')) return `${project}/backup`;
  if (['main', 'master', 'production'].includes(ref)) return `${project}/main`;
  if (BOT_BRANCH.test(ref)) return `${project}/bot-branch`;
  return `${project}/branch`;
}

/** Queue wait (created -> buildingAt, or until now while QUEUED) and build time. */
export function deploymentTiming(deployment, now = Date.now()) {
  const state = String(
    deployment?.readyState ?? deployment?.state ?? 'UNKNOWN'
  ).toUpperCase();
  const created = timestamp(deployment?.createdAt ?? deployment?.created);
  const building = timestamp(deployment?.buildingAt);
  const ready = timestamp(deployment?.ready);
  const queueSeconds =
    created === null
      ? null
      : building !== null
        ? seconds(building - created)
        : state === 'QUEUED' || state === 'INITIALIZING'
          ? seconds(now - created)
          : null;
  const buildSeconds =
    building !== null && ready !== null && state === 'READY'
      ? seconds(ready - building)
      : null;
  return { state, queueSeconds, buildSeconds };
}

/** Team-wide occupants of the build queue, largest class first. */
export function summarizeTeamQueue(deployments, now = Date.now()) {
  const classes = new Map();
  for (const deployment of deployments) {
    const { state, queueSeconds } = deploymentTiming(deployment, now);
    if (state !== 'QUEUED' && state !== 'BUILDING') continue;
    const key = classifyDeployment(deployment);
    const entry = classes.get(key) ?? {
      class: key,
      queued: 0,
      building: 0,
      oldestQueuedSeconds: 0,
    };
    if (state === 'BUILDING') entry.building += 1;
    else {
      entry.queued += 1;
      entry.oldestQueuedSeconds = Math.max(
        entry.oldestQueuedSeconds,
        queueSeconds ?? 0
      );
    }
    classes.set(key, entry);
  }
  return [...classes.values()].sort(
    (a, b) => b.queued + b.building - (a.queued + a.building)
  );
}

export function renderReport({ lane, deployment, timing, occupants }) {
  const fmt = value => (value === null ? 'n/a' : `${value}s`);
  const lines = [
    `### Vercel build queue (${lane})`,
    '',
    `Deployment \`${deployment}\`: state ${timing.state}, queue wait ${fmt(timing.queueSeconds)}, Vercel build ${fmt(timing.buildSeconds)}.`,
    '',
  ];
  if (occupants.length === 0) {
    lines.push('Team build queue was empty when measured.');
  } else {
    lines.push('| Queue occupant | Queued | Building | Oldest queued |');
    lines.push('|---|---|---|---|');
    for (const o of occupants.slice(0, 10)) {
      lines.push(
        `| ${o.class} | ${o.queued} | ${o.building} | ${o.oldestQueuedSeconds}s |`
      );
    }
  }
  return `${lines.join('\n')}\n`;
}

export function queueVerdict({ lane, timing, occupants }) {
  if (timing.queueSeconds === null || timing.queueSeconds < QUEUE_WARN_SECONDS)
    return null;
  const top = occupants
    .filter(o => !o.class.startsWith('jovie/'))
    .slice(0, 3)
    .map(o => `${o.class} x${o.queued + o.building}`)
    .join(', ');
  return `${lane} deployment waited ${timing.queueSeconds}s in the Vercel build queue${top ? ` behind ${top}` : ''} (vercel-build-queue-starved).`;
}

async function vercelJson(path, { token, teamId, fetchImpl }) {
  const url = new URL(path, API_BASE);
  if (teamId.startsWith('team_')) url.searchParams.set('teamId', teamId);
  const response = await fetchImpl(url, {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error(`Vercel API ${response.status}`);
  return response.json();
}

export async function measureBuildQueue({
  lane,
  deployment,
  token,
  teamId,
  fetchImpl = fetch,
  now = Date.now(),
}) {
  const id = deployment.replace(/^https?:\/\//, '').replace(/\/$/, '');
  const detail = await vercelJson(
    `/v13/deployments/${encodeURIComponent(id)}`,
    { token, teamId, fetchImpl }
  );
  const active = [];
  for (const state of ['QUEUED', 'BUILDING']) {
    const page = await vercelJson(`/v6/deployments?state=${state}&limit=100`, {
      token,
      teamId,
      fetchImpl,
    });
    active.push(...(page.deployments ?? []));
  }
  const timing = deploymentTiming(detail, now);
  const occupants = summarizeTeamQueue(active, now);
  return {
    lane,
    deployment: detail.id ?? detail.uid ?? id,
    timing,
    occupants,
  };
}

export async function runCli({
  argv = process.argv.slice(2),
  env = process.env,
  fetchImpl = fetch,
} = {}) {
  const [lane, deployment] = argv;
  try {
    if (!lane || !deployment) throw new Error('usage: <lane> <deployment>');
    if (!env.VERCEL_TOKEN || !env.VERCEL_ORG_ID)
      throw new Error('VERCEL_TOKEN and VERCEL_ORG_ID are required');
    const result = await measureBuildQueue({
      lane,
      deployment,
      token: env.VERCEL_TOKEN,
      teamId: env.VERCEL_ORG_ID,
      fetchImpl,
    });
    const report = renderReport(result);
    console.log(report);
    if (env.GITHUB_STEP_SUMMARY)
      appendFileSync(env.GITHUB_STEP_SUMMARY, report);
    if (env.GITHUB_OUTPUT) {
      appendFileSync(
        env.GITHUB_OUTPUT,
        `queue_seconds=${result.timing.queueSeconds ?? ''}\nbuild_seconds=${result.timing.buildSeconds ?? ''}\n`
      );
    }
    const verdict = queueVerdict(result);
    if (verdict) console.log(`::warning::${verdict}`);
    return result;
  } catch (error) {
    // Measurement never blocks a release.
    console.log(
      `::warning::Vercel build queue measurement unavailable: ${error.message}`
    );
    return null;
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  await runCli();
}
