#!/usr/bin/env node

import { execFile } from 'node:child_process';
import { appendFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const REMINDER_WINDOW_MS = 30 * 60 * 1000;

const parseCollection = (payload, field) => {
  const parsed = JSON.parse(payload);
  if (!Array.isArray(parsed?.[field])) {
    throw new Error(`GitHub response omitted ${field}`);
  }
  return parsed[field];
};

export const executeGhApi = async (
  endpoint,
  { execFileImpl = execFileAsync } = {}
) => {
  const { stdout } = await execFileImpl('gh', ['api', endpoint], {
    encoding: 'utf8',
    maxBuffer: 4 * 1024 * 1024,
  });
  return stdout;
};

export async function decideFounderAlert({
  ghApi = executeGhApi,
  incidentKey,
  now = new Date(),
  repository,
} = {}) {
  if (!incidentKey || !repository) {
    throw new Error('alert dedupe requires an incident key and repository');
  }
  const cutoff = new Date(now).getTime() - REMINDER_WINDOW_MS;
  try {
    const runs = parseCollection(
      await ghApi(
        `repos/${repository}/actions/workflows/production-continuity.yml/runs?status=completed&per_page=20`
      ),
      'workflow_runs'
    );
    for (const run of runs) {
      const createdAt = Date.parse(run?.created_at);
      if (!Number.isInteger(run?.id) || !Number.isFinite(createdAt)) continue;
      if (createdAt < cutoff) continue;
      const jobs = parseCollection(
        await ghApi(
          `repos/${repository}/actions/runs/${run.id}/jobs?per_page=100`
        ),
        'jobs'
      );
      const expectedName = `Notify production on-call (${incidentKey})`;
      const acknowledged = jobs.some(
        job =>
          job?.name === expectedName &&
          job.steps?.some(
            step =>
              step?.name === 'Deliver immediate founder alert' &&
              step?.conclusion === 'success'
          )
      );
      if (acknowledged) {
        return { shouldNotify: false, reason: 'recent-transport-receipt' };
      }
    }
    return { shouldNotify: true, reason: 'no-recent-transport-receipt' };
  } catch (error) {
    return {
      shouldNotify: true,
      reason: 'history-unavailable-fail-open',
      warning: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function runCli({
  appendFileImpl = appendFile,
  env = process.env,
  ghApi = executeGhApi,
  now = new Date(),
  stdout = process.stdout,
} = {}) {
  const result = await decideFounderAlert({
    ghApi,
    incidentKey: env.INCIDENT_KEY,
    now,
    repository: env.REPOSITORY,
  });
  if (!env.GITHUB_OUTPUT) {
    throw new Error('alert dedupe requires GITHUB_OUTPUT');
  }
  await appendFileImpl(
    env.GITHUB_OUTPUT,
    `should_notify=${result.shouldNotify}\ndedupe_reason=${result.reason}\n`,
    'utf8'
  );
  if (result.warning) {
    stdout.write(`::warning::Alert history unavailable: ${result.warning}\n`);
  }
  stdout.write(`${JSON.stringify(result)}\n`);
  return result;
}

/* node:coverage disable */
if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  runCli().catch(error => {
    process.stderr.write(
      `production-continuity-dedupe: ${error instanceof Error ? error.message : String(error)}\n`
    );
    process.exitCode = 1;
  });
}
/* node:coverage enable */
