#!/usr/bin/env node
// CI glue for the pre-promotion journey gate (extends promotion-journey-gate.mjs).
//   resolve-base --inspect inspect.json --build-info build-info.json
//     Prints the live production SHA. `vercel inspect --format=json` has no
//     commit field (printJson is id/url/readyState/target plus builds). The
//     SHA comes from https://jov.ie/api/health/build-info and is accepted
//     only when that deploymentId is the READY production inspect id.
//     An unresolved SHA prints nothing and a ::error:: reason; the range
//     grader then fail-closes. Exit 0 so the gate still records the block.
//   range --base <deployedSha> --candidate <sha> --out range.json
//     Grades the full deployed..candidate range. Any failure to resolve the
//     base or the changed paths writes an unknown (fail-closed) artifact.
//   fetch-evidence --repo owner/name --candidate <sha> --out-dir dir
//     Downloads the Golden Path evidence artifact for the exact candidate SHA.
//     Finding nothing is not an error here; the gate blocks on missing evidence.
import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { runGh, splitIncluded } from '../packages/api-client/gh.ts';
import { gradeReleaseRange } from './lib/release-range-risk.mjs';

const SHA = /^[0-9a-f]{40}$/;
const DEPLOYMENT_ID = /^dpl_[A-Za-z0-9]+$/;
const REPO = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
const RUN_ID = /^[1-9][0-9]*$/;
export const evidenceArtifactName = sha => `journey-evidence-${sha}`;
export const EVIDENCE_LIST_PAGE = 100;

function jsonObject(text) {
  try {
    const parsed = JSON.parse(text);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))
      return null;
    return parsed;
  } catch {
    return null;
  }
}

/** Same extraction as promote-production-deployment.sh, then the same projection. */
export function projectInspectDeployment(raw) {
  const text = String(raw ?? '');
  const candidates = [];
  const trimmed = text.trim();
  if (trimmed) candidates.push(trimmed);
  const prefixedAt = text.search(/^> /m);
  if (prefixedAt >= 0) candidates.push(text.slice(prefixedAt).replace(/^> /, ''));
  const braceAt = text.search(/^\s*\{/m);
  if (braceAt >= 0) candidates.push(text.slice(braceAt));
  for (const candidate of candidates) {
    const parsed = jsonObject(candidate);
    if (!parsed) continue;
    const { id, url, readyState, target } = parsed;
    if (
      typeof id !== 'string' ||
      typeof readyState !== 'string' ||
      typeof target !== 'string'
    )
      continue;
    return {
      id,
      url: typeof url === 'string' ? url : '',
      readyState,
      target,
    };
  }
  return null;
}

/**
 * Bind the public build-info receipt to the alias inspect id.
 * `.meta.githubCommitSha` is ignored even when a caller left it on the document.
 */
export function bindLiveProductionSha({ inspect, buildInfo }) {
  if (!inspect || !DEPLOYMENT_ID.test(inspect.id ?? ''))
    return {
      sha: '',
      reason:
        'vercel inspect did not contain a deployment id, readyState, and target',
    };
  if (String(inspect.readyState).toUpperCase() !== 'READY')
    return {
      sha: '',
      reason: `vercel inspect readyState is ${inspect.readyState}`,
    };
  if (String(inspect.target).toLowerCase() !== 'production')
    return { sha: '', reason: `vercel inspect target is ${inspect.target}` };
  if (!buildInfo || typeof buildInfo !== 'object' || Array.isArray(buildInfo))
    return { sha: '', reason: 'production build-info was not valid JSON' };
  const sha = typeof buildInfo.commitSha === 'string' ? buildInfo.commitSha : '';
  if (!SHA.test(sha))
    return {
      sha: '',
      reason: 'production build-info commitSha is not 40 hex characters',
    };
  if (buildInfo.deploymentId !== inspect.id)
    return {
      sha: '',
      reason:
        'production build-info deploymentId does not match the inspect id',
    };
  if (buildInfo.environment !== 'production')
    return {
      sha: '',
      reason: 'production build-info environment is not production',
    };
  return { sha, reason: '' };
}

export function buildGitFetchInvocation(base, candidate, env = process.env) {
  if (!SHA.test(base ?? '') || !SHA.test(candidate ?? '')) return null;
  const repo = env.GITHUB_REPOSITORY || env.REPO || '';
  if (!REPO.test(repo)) return null;
  const token = env.GH_TOKEN || env.GITHUB_TOKEN || '';
  if (!token) return null;
  const header = `AUTHORIZATION: basic ${Buffer.from(`x-access-token:${token}`).toString('base64')}`;
  const configKey = `http.https://github.com/${repo}.git.extraheader`;
  return {
    args: [
      '-c',
      'http.extraheader=',
      '-c',
      `${configKey}=`,
      `--config-env=${configKey}=JOVIE_GIT_AUTH_HEADER`,
      'fetch',
      '--quiet',
      '--no-tags',
      '--depth=1',
      `https://github.com/${repo}.git`,
      base,
      candidate,
    ],
    env: {
      ...env,
      JOVIE_GIT_AUTH_HEADER: header,
      GIT_TERMINAL_PROMPT: '0',
    },
  };
}

export function diffNameOnly(base, candidate, spawn = spawnSync) {
  const diff = spawn(
    'git',
    ['diff', '--name-only', `${base}..${candidate}`],
    { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }
  );
  if (diff.status !== 0) return null;
  return String(diff.stdout ?? '')
    .split('\n')
    .filter(Boolean);
}

export function changedPaths(base, candidate, env = process.env, spawn = spawnSync) {
  const plan = buildGitFetchInvocation(base, candidate, env);
  if (!plan) return null;
  const fetch = spawn('git', plan.args, { encoding: 'utf8', env: plan.env });
  if (fetch.status !== 0) {
    console.error('git fetch of the release range failed');
    return null;
  }
  const paths = diffNameOnly(base, candidate, spawn);
  if (!paths) console.error('git diff of the release range failed');
  return paths;
}

export function evidenceListPath(repo, candidate) {
  if (!REPO.test(repo ?? '') || !SHA.test(candidate ?? '')) return null;
  const name = encodeURIComponent(evidenceArtifactName(candidate));
  return `repos/${repo}/actions/artifacts?name=${name}&per_page=${EVIDENCE_LIST_PAGE}`;
}

export function unexpiredEvidenceRunIds(payload, candidate) {
  const artifacts = Array.isArray(payload?.artifacts) ? payload.artifacts : [];
  const seen = new Set();
  const ids = [];
  const ranked = artifacts
    .filter(
      artifact =>
        artifact &&
        artifact.expired === false &&
        artifact.workflow_run?.head_sha === candidate &&
        RUN_ID.test(String(artifact.workflow_run?.id ?? ''))
    )
    .sort((a, b) =>
      String(b.created_at ?? '').localeCompare(String(a.created_at ?? ''))
    );
  for (const artifact of ranked) {
    const id = String(artifact.workflow_run.id);
    if (seen.has(id)) continue;
    seen.add(id);
    ids.push(id);
  }
  return ids;
}

async function gh(args) {
  const r = await runGh(args, { priority: 'deploy' });
  if (r.code !== 0) return null;
  return args[0] === 'api'
    ? (splitIncluded(r.stdout)?.body ?? r.stdout)
    : r.stdout;
}

function readText(path) {
  try {
    return readFileSync(path, 'utf8');
  } catch {
    return '';
  }
}

export async function main(argv) {
  const sub = argv[0];
  const o = {};
  for (let i = 1; i < argv.length; i += 2)
    o[argv[i].replace(/^--/, '')] = argv[i + 1];
  if (sub === 'resolve-base') {
    const inspect = projectInspectDeployment(readText(o.inspect));
    const buildInfo = jsonObject(readText(o['build-info']));
    const bound = bindLiveProductionSha({ inspect, buildInfo });
    if (!bound.sha) console.error(`::error::${bound.reason}`);
    else console.error(`live production ${bound.sha} deployment ${inspect.id}`);
    if (bound.sha) console.log(bound.sha);
    return 0;
  }
  if (sub === 'range') {
    const range = gradeReleaseRange({
      baseDeployedSha: o.base,
      candidateSha: o.candidate,
      paths: changedPaths(o.base, o.candidate),
    });
    writeFileSync(o.out, `${JSON.stringify(range, null, 2)}\n`);
    console.log(
      `range ${o.base}..${o.candidate}: unknown=${range.unknown} auth=${range.affects.auth} billing=${range.affects.billing}`
    );
    return 0;
  }
  if (sub === 'fetch-evidence') {
    mkdirSync(o['out-dir'], { recursive: true });
    const name = evidenceArtifactName(o.candidate);
    const path = evidenceListPath(o.repo, o.candidate);
    if (!path) {
      console.error(
        `no unexpired ${name} artifact for candidate ${o.candidate ?? ''}`
      );
      return 0;
    }
    const listed = await gh(['api', path]);
    const payload = jsonObject(listed ?? '');
    const runIds = unexpiredEvidenceRunIds(payload, o.candidate);
    if (runIds.length === 0) {
      console.error(`no unexpired ${name} artifact for candidate ${o.candidate}`);
      return 0;
    }
    for (const runId of runIds) {
      const dir = `${o['out-dir']}/${runId}`;
      const got = await gh([
        'run',
        'download',
        runId,
        '--repo',
        o.repo,
        '-n',
        name,
        '-D',
        dir,
      ]);
      if (got !== null) console.log(`fetched ${name} from run ${runId}`);
    }
    return 0;
  }
  console.error(
    'usage: promotion-gate-ci.mjs resolve-base|range|fetch-evidence ...'
  );
  return 2;
}

if (import.meta.url === `file://${process.argv[1]}`)
  process.exit(await main(process.argv.slice(2)));
