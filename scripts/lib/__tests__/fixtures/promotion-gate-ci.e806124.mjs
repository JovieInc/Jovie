#!/usr/bin/env node
// CI glue for the pre-promotion journey gate (extends promotion-journey-gate.mjs).
//   range --base <deployedSha> --candidate <sha> --out range.json
//     Grades the full deployed..candidate range. Any failure to resolve the
//     base or the changed paths writes an unknown (fail-closed) artifact.
//   fetch-evidence --repo owner/name --candidate <sha> --out-dir dir
//     Downloads the Golden Path evidence artifact for the exact candidate SHA.
//     Finding nothing is not an error here; the gate blocks on missing evidence.
import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { runGh, splitIncluded } from '../packages/api-client/gh.ts';
import { gradeReleaseRange } from './lib/release-range-risk.mjs';

const SHA = /^[0-9a-f]{40}$/;
export const evidenceArtifactName = sha => `journey-evidence-${sha}`;

function changedPaths(base, candidate) {
  if (!SHA.test(base ?? '') || !SHA.test(candidate ?? '')) return null;
  const fetch = spawnSync(
    'git',
    ['fetch', '--no-tags', '--depth=1', 'origin', base, candidate],
    { encoding: 'utf8' }
  );
  if (fetch.status !== 0) return null;
  const diff = spawnSync(
    'git',
    ['diff', '--name-only', `${base}..${candidate}`],
    { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }
  );
  if (diff.status !== 0) return null;
  return diff.stdout.split('\n').filter(Boolean);
}

async function gh(args) {
  const r = await runGh(args, { priority: 'deploy' });
  if (r.code !== 0) return null;
  return args[0] === 'api'
    ? (splitIncluded(r.stdout)?.body ?? r.stdout)
    : r.stdout;
}

export async function main(argv) {
  const sub = argv[0];
  const o = {};
  for (let i = 1; i < argv.length; i += 2)
    o[argv[i].replace(/^--/, '')] = argv[i + 1];
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
    const listed = await gh([
      'api',
      `repos/${o.repo}/actions/artifacts?name=${name}&per_page=20`,
      '--jq',
      `[.artifacts[] | select(.expired == false and .workflow_run.head_sha == "${o.candidate}")] | sort_by(.created_at) | reverse | .[].workflow_run.id`,
    ]);
    for (const runId of (listed ?? '').split('\n').filter(Boolean)) {
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
  console.error('usage: promotion-gate-ci.mjs range|fetch-evidence ...');
  return 2;
}

if (import.meta.url === `file://${process.argv[1]}`)
  process.exit(await main(process.argv.slice(2)));
