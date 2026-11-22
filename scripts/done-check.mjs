#!/usr/bin/env node
/**
 * Done means seen working on production (Tim 2026-11-22). An agent or task may
 * report done, or propose done, only when this check passes for its PR:
 *
 *   1. merged:     the PR is merged.
 *   2. deployed:   the build jov.ie serves (/api/health/build-info) contains the merge.
 *   3. outcome:    a Post-Deploy Probes run on a build containing the merge concluded
 *                  success (golden-path certification and core outcome checks on
 *                  production, scripts/prod-cert.mjs).
 *   4. screenshot: that run kept production screenshots (pen-golden-path-pairs), or
 *                  the agent passes its own production capture with --screenshot.
 *
 *   pnpm done:check --pr 123 [--screenshot prod.png] [--json]
 *
 * Exit 0 done, 1 not done (reasons printed), 75 unknown (a read failed; never done).
 * Read-only: one plain production request plus a few GitHub reads.
 *
 * api-budget: github-app-core 350/hr - at most 35 reads per check (the PR, one page of probe runs, up to 32 compares, artifacts), about ten checks an hour fleet-wide
 */
import { existsSync, readFileSync, statSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { runGh } from '../packages/api-client/gh.ts';

export const REPO = 'JovieInc/Jovie';
export const ORIGIN = 'https://jov.ie';
export const PROBES_WORKFLOW = 'postdeploy-probes.yml';
export const SCREENSHOT_ARTIFACT = /^pen-golden-path-pairs-\d+$/;
const PNG = [0x89, 0x50, 0x4e, 0x47];
const JPEG = [0xff, 0xd8, 0xff];
const RUN_PAGE = 30;

/** @param {string} path */
export function screenshotFile(path) {
  if (!path || !existsSync(path) || !statSync(path).isFile()) return false;
  const head = [...readFileSync(path).subarray(0, 4)];
  return (
    PNG.every((byte, i) => head[i] === byte) ||
    JPEG.every((byte, i) => head[i] === byte)
  );
}

/** True when `sha` is `merge` or a descendant of it. */
async function contains(gh, merge, sha) {
  if (merge === sha) return true;
  const compare = await gh(`/repos/${REPO}/compare/${merge}...${sha}`);
  return compare.status === 'ahead' || compare.status === 'identical';
}

/**
 * @param {{ pr: number, screenshot?: string }} input
 * @param {{ gh: (path: string) => Promise<any>, served: () => Promise<{ sha: string }> }} deps
 */
export async function doneCheck({ pr, screenshot }, { gh, served }) {
  const reasons = [];
  /**
   * @type {{ pr: number, merged: boolean, deployed: boolean, outcome: boolean,
   *   screenshot: boolean, reasons: string[], status?: string, probeRun?: string,
   *   screenshotUrl?: string, screenshotFile?: string, mergeSha?: string,
   *   servedSha?: string }}
   */
  const verdict = {
    pr,
    merged: false,
    deployed: false,
    outcome: false,
    screenshot: false,
    reasons,
  };
  let pull;
  try {
    pull = await gh(`/repos/${REPO}/pulls/${pr}`);
  } catch (error) {
    return {
      ...verdict,
      status: 'unknown',
      reasons: [`pr unreadable: ${error.message}`],
    };
  }
  if (!pull.merged_at || !/^[0-9a-f]{40}$/.test(pull.merge_commit_sha ?? '')) {
    reasons.push('not merged');
    return { ...verdict, status: 'not-done' };
  }
  verdict.merged = true;
  verdict.mergeSha = pull.merge_commit_sha;
  try {
    const build = await served();
    verdict.servedSha = build.sha;
    verdict.deployed = await contains(gh, pull.merge_commit_sha, build.sha);
  } catch (error) {
    return {
      ...verdict,
      status: 'unknown',
      reasons: [`production build unreadable: ${error.message}`],
    };
  }
  if (!verdict.deployed)
    reasons.push(
      `production serves ${verdict.servedSha.slice(0, 12)}, which does not contain the merge yet`
    );
  let runs;
  try {
    const listed = await gh(
      `/repos/${REPO}/actions/workflows/${PROBES_WORKFLOW}/runs?branch=main&status=completed&created=%3E%3D${encodeURIComponent(pull.merged_at)}&per_page=${RUN_PAGE}`
    );
    runs = listed.workflow_runs ?? [];
  } catch (error) {
    return {
      ...verdict,
      status: 'unknown',
      reasons: [...reasons, `probe runs unreadable: ${error.message}`],
    };
  }
  let run = null;
  for (const candidate of runs) {
    try {
      if (await contains(gh, pull.merge_commit_sha, candidate.head_sha)) {
        run = candidate;
        break;
      }
    } catch (error) {
      return {
        ...verdict,
        status: 'unknown',
        reasons: [...reasons, `compare unreadable: ${error.message}`],
      };
    }
  }
  if (!run) {
    reasons.push(
      'no Post-Deploy Probes run on production has covered the merge yet'
    );
  } else {
    verdict.probeRun = run.html_url;
    verdict.outcome = run.conclusion === 'success';
    if (!verdict.outcome)
      reasons.push(
        `Post-Deploy Probes on a build with the merge concluded ${run.conclusion}: ${run.html_url}`
      );
    try {
      const artifacts =
        (
          await gh(
            `/repos/${REPO}/actions/runs/${run.id}/artifacts?per_page=100`
          )
        ).artifacts ?? [];
      const shot = artifacts.find(
        item =>
          SCREENSHOT_ARTIFACT.test(item.name) &&
          !item.expired &&
          item.size_in_bytes > 0
      );
      if (shot) {
        verdict.screenshot = true;
        verdict.screenshotUrl = `${run.html_url}/artifacts/${shot.id}`;
      }
    } catch (error) {
      return {
        ...verdict,
        status: 'unknown',
        reasons: [...reasons, `artifacts unreadable: ${error.message}`],
      };
    }
  }
  if (screenshot) {
    if (screenshotFile(screenshot)) {
      verdict.screenshot = true;
      verdict.screenshotFile = screenshot;
    } else {
      reasons.push(`--screenshot ${screenshot} is not a PNG or JPEG file`);
    }
  }
  if (!verdict.screenshot)
    reasons.push(
      'no production screenshot: attach one with --screenshot or wait for a probe run that keeps them'
    );
  const done =
    verdict.merged && verdict.deployed && verdict.outcome && verdict.screenshot;
  return { ...verdict, status: done ? 'done' : 'not-done' };
}

/** GitHub reads go through the shared client (quota ledger, retries, credentials). */
export function githubReader(run = runGh) {
  return async (/** @type {string} */ path) => {
    const result = await run(['api', path], { priority: 'report' });
    if (result.code !== 0)
      throw new Error(
        `GitHub read failed (exit ${result.code}) for ${path.split('?')[0]}`
      );
    return JSON.parse(result.stdout);
  };
}

export async function servedBuild(fetchImpl = fetch) {
  const response = await fetchImpl(new URL('/api/health/build-info', ORIGIN));
  if (response.status !== 200)
    throw new Error(`build-info HTTP ${response.status}`);
  const json = await response.json();
  if (!/^[0-9a-f]{40}$/.test(json.commitSha ?? ''))
    throw new Error('build-info has no commit sha');
  return { sha: json.commitSha };
}

async function main() {
  const { values } = parseArgs({
    options: {
      pr: { type: 'string' },
      screenshot: { type: 'string' },
      json: { type: 'boolean' },
    },
  });
  const pr = Number(values.pr);
  if (!Number.isInteger(pr) || pr <= 0) {
    console.error(
      'usage: pnpm done:check --pr <number> [--screenshot prod.png] [--json]'
    );
    process.exit(2);
  }
  const verdict = await doneCheck(
    { pr, screenshot: values.screenshot },
    { gh: githubReader(), served: () => servedBuild() }
  );
  if (values.json) console.log(JSON.stringify(verdict, null, 2));
  else {
    console.log(`PR #${pr}: ${verdict.status}`);
    for (const key of ['merged', 'deployed', 'outcome', 'screenshot'])
      console.log(`  ${verdict[key] ? 'ok ' : 'no '} ${key}`);
    for (const reason of verdict.reasons) console.log(`  - ${reason}`);
    if (verdict.probeRun) console.log(`  probe run: ${verdict.probeRun}`);
    if (verdict.screenshotUrl)
      console.log(`  screenshots: ${verdict.screenshotUrl}`);
  }
  process.exit(
    verdict.status === 'done' ? 0 : verdict.status === 'unknown' ? 75 : 1
  );
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) await main();
