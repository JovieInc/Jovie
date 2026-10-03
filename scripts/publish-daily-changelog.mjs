#!/usr/bin/env node
/** Exact Production Verified artifact → curated release PR. No email sends. */
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { collectCustomerCandidates } from './lib/daily-changelog-collector.mjs';
import {
  assertTrustedControllerRun,
  checkPublicationBinding,
  planDailyPublication,
} from './lib/daily-changelog-publication.mjs';
import { isStampAllowedBranch } from './version-fanout-guard.mjs';

const option = name => process.argv[process.argv.indexOf(name) + 1];
const markerPath = process.argv.includes('--marker')
  ? option('--marker')
  : null;
if (!markerPath)
  throw new Error(
    'Usage: publish-daily-changelog.mjs --marker FILE --output DIRECTORY [--seed FILE] [--write]'
  );
const output = resolve(
  process.argv.includes('--output')
    ? option('--output')
    : '.artifacts/daily-changelog'
);
mkdirSync(output, { recursive: true });
const git = async (args, options = {}) => {
  try {
    const result = execFileSync('git', args, { encoding: 'utf8' });
    return options.status ? 0 : result;
  } catch (error) {
    if (options.status) return error.status;
    throw error;
  }
};
const gh = args =>
  JSON.parse(
    execFileSync('gh', args, { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 })
  );
// Never follow redirects outside the allowlisted public evidence origin.
const fetchPage = url =>
  fetch(url, { redirect: 'error', signal: AbortSignal.timeout(15000) });
const marker = JSON.parse(readFileSync(markerPath, 'utf8'));
if (
  !/^\d+$/.test(marker.controllerRun ?? '') ||
  !/^\d+$/.test(marker.controllerAttempt ?? '')
)
  throw new Error('Invalid controller run');
const run = gh([
  'api',
  `repos/JovieInc/Jovie/actions/runs/${marker.controllerRun}/attempts/${marker.controllerAttempt}`,
]);
assertTrustedControllerRun(marker, run);
const jobs = gh([
  'api',
  `repos/JovieInc/Jovie/actions/runs/${marker.controllerRun}/attempts/${marker.controllerAttempt}/jobs?per_page=100`,
]);
const controller = {
  runId: run.id,
  attempt: run.run_attempt,
  verified: jobs.jobs.some(
    job => job.name === 'Production Verified' && job.conclusion === 'success'
  ),
};
const observedAt = new Date().toISOString();
const buildResponse = await fetchPage('https://jov.ie/api/health/build-info');
if (!buildResponse.ok) throw new Error('Public build identity unavailable');
const buildInfo = await buildResponse.json();
const binding = checkPublicationBinding(marker, buildInfo, controller);
if (binding.status === 'deferred') {
  writeFileSync(
    resolve(output, 'plan.json'),
    `${JSON.stringify({ ...binding, observedAt }, null, 2)}\n`
  );
  process.stdout.write(`${JSON.stringify(binding)}\n`);
  process.exit(0);
}
const markdown = readFileSync('CHANGELOG.md', 'utf8');
const seed = process.argv.includes('--seed')
  ? JSON.parse(readFileSync(option('--seed'), 'utf8'))
  : [];
const candidates = await collectCustomerCandidates({
  markdown,
  marker,
  seed,
  git,
  observedAt,
  fetchPage,
  graphql: async query =>
    JSON.parse(
      execFileSync('gh', ['api', 'graphql', '--input', '-'], {
        input: JSON.stringify({ query }),
        encoding: 'utf8',
        maxBuffer: 32 * 1024 * 1024,
      })
    ),
});
// Large recovery scans can span a production handoff. Bind again before output.
const finalResponse = await fetchPage('https://jov.ie/api/health/build-info');
if (!finalResponse.ok)
  throw new Error('Final public build identity unavailable');
const finalBinding = checkPublicationBinding(
  marker,
  await finalResponse.json(),
  controller
);
if (finalBinding.status === 'deferred') {
  writeFileSync(
    resolve(output, 'plan.json'),
    `${JSON.stringify({ ...finalBinding, observedAt }, null, 2)}\n`
  );
  process.stdout.write(`${JSON.stringify(finalBinding)}\n`);
  process.exit(0);
}
const plan = planDailyPublication({
  markdown,
  marker,
  buildInfo,
  controller,
  candidates,
  windowKey: observedAt.slice(0, 10),
  observedAt,
});
writeFileSync(
  resolve(output, 'plan.json'),
  `${JSON.stringify({ ...plan, content: undefined }, null, 2)}\n`
);
writeFileSync(resolve(output, 'CHANGELOG.md'), plan.content);
process.stdout.write(
  `${JSON.stringify({ status: plan.status, outcomes: plan.result.stories.length, audit: plan.audit.length, deferred: plan.deferred.length, output })}\n`
);
if (process.argv.includes('--write') && plan.status === 'publish') {
  const branch = (await git(['branch', '--show-current'])).trim();
  if (
    !branch.startsWith('release/daily-changelog-') ||
    !isStampAllowedBranch(branch)
  )
    throw new Error('Only the dedicated release branch may publish notes');
  if ((await git(['status', '--porcelain'])).trim())
    throw new Error('Publisher requires a clean release checkout');
  writeFileSync('CHANGELOG.md', plan.content);
}
