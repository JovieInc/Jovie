#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { extractDeprecations } from './deprecation-intake.mjs';
import {
  deprecationFingerprint,
  formatDeprecationObservation,
  parseDeprecationObservation,
} from './lib/deprecation-observation.mjs';
import { linearRequest } from './lib/linear-cooldown.mjs';
import {
  addLinearIssueComment,
  JOVIE_TEAM_ID,
} from './lib/linear-issue-intake.mjs';
import {
  createProductionFacts,
  githubClient,
  pullImplementsIssue,
} from './lib/validation-sync.mjs';
export const MAX_OBSERVATIONS = 25;
const FIELDS = `id identifier title updatedAt comments(first: 50) { nodes { body } pageInfo { hasNextPage } } attachments(first: 50) { nodes { url } pageInfo { hasNextPage } }`;
export async function recordDeprecationObservations({
  log,
  source,
  github,
  facts,
  linear,
  comment,
}) {
  if (
    source?.schema !== 'jovie.build-log-observation/v1' ||
    source.complete !== true ||
    !/^[0-9a-f]{40}$/.test(source.headSha ?? '') ||
    !Array.isArray(source.jobIds) ||
    source.jobIds.length === 0 ||
    source.logSha256 !== createHash('sha256').update(log).digest('hex')
  )
    throw new Error('incomplete-build-observation');
  const match =
    /^https:\/\/github\.com\/JovieInc\/Jovie\/actions\/runs\/([1-9][0-9]*)$/.exec(
      source.runUrl ?? ''
    );
  if (!match) throw new Error('invalid-build-run-url');
  const prefix = 'repos/JovieInc/Jovie';
  const { body: run } = await github(`${prefix}/actions/runs/${match[1]}`);
  if (
    run.event !== 'merge_group' ||
    run.path !== '.github/workflows/ci.yml' ||
    run.conclusion !== 'success' ||
    run.head_sha !== source.headSha ||
    !Number.isFinite(Date.parse(run.updated_at))
  )
    throw new Error('unverified-build-run');
  const jobs = [];
  let webBuild = false;
  for (let page = 1; page <= 10; page++) {
    const { body, link } = await github(
      `${prefix}/actions/runs/${match[1]}/jobs?per_page=100&page=${page}`
    );
    if (!Array.isArray(body.jobs)) throw new Error('invalid-build-jobs');
    webBuild ||= body.jobs.some(
      job =>
        ['Build + Layout (combined)', 'Build (public routes)'].includes(
          job.name
        ) && job.conclusion === 'success'
    );
    jobs.push(
      ...body.jobs
        .filter(job => /^Build/.test(job.name) && job.conclusion === 'success')
        .map(job => job.id)
    );
    if (!link?.includes('rel="next"')) break;
    if (page === 10) throw new Error('incomplete-build-jobs');
  }
  if (
    !webBuild ||
    !/Compiled successfully/.test(log) ||
    jobs.length === 0 ||
    JSON.stringify([...jobs].sort()) !==
      JSON.stringify([...source.jobIds].sort())
  )
    throw new Error('incomplete-build-logs');
  const data = await linear(
    `query DeprecationObservations($team: ID!) { issues(first: 100, filter: {team: {id: {eq: $team}}, title: {contains: "[deprecation-"}, state: {type: {nin: ["completed", "canceled"]}}}) { nodes { ${FIELDS} } pageInfo { hasNextPage } } }`,
    { team: JOVIE_TEAM_ID }
  );
  if (
    !Array.isArray(data.issues?.nodes) ||
    data.issues.pageInfo?.hasNextPage !== false
  )
    throw new Error('incomplete-deprecation-inventory');
  const seen = new Set(extractDeprecations(log).map(w => w.fingerprint));
  const production = await facts.servedGeneration();
  const results = [];
  for (const issue of [...data.issues.nodes]
    .sort((a, b) => Date.parse(a.updatedAt) - Date.parse(b.updatedAt))
    .slice(0, MAX_OBSERVATIONS)) {
    const fingerprint = deprecationFingerprint(issue);
    if (
      !fingerprint ||
      issue.comments?.pageInfo?.hasNextPage !== false ||
      issue.attachments?.pageInfo?.hasNextPage !== false
    ) {
      results.push({
        issue: issue.identifier,
        action: 'hold',
        reason: 'incomplete-issue-evidence',
      });
      continue;
    }
    const status = seen.has(fingerprint) ? 'red' : 'green';
    if (status === 'green') {
      if (
        production.status !== 'verified' ||
        production.sha !== source.headSha
      ) {
        results.push({
          issue: issue.identifier,
          action: 'hold',
          reason: 'build-is-not-current-verified-production',
        });
        continue;
      }
      const urls = issue.attachments.nodes
        .map(a => a.url)
        .filter(url =>
          /^https:\/\/github\.com\/JovieInc\/Jovie\/pull\/[1-9][0-9]*$/.test(
            url
          )
        );
      if (urls.length === 0) {
        results.push({
          issue: issue.identifier,
          action: 'hold',
          reason: 'no-repair-binding',
        });
        continue;
      }
      let merged = false;
      let clear = true;
      for (const url of urls) {
        const { body: pull } = await github(
          `${prefix}/pulls/${url.split('/').at(-1)}`
        );
        if (pull.state !== 'closed') {
          clear = false;
          break;
        }
        if (
          pull.merged === true &&
          pullImplementsIssue(pull, issue.identifier) &&
          /^[0-9a-f]{40}$/.test(pull.merge_commit_sha ?? '')
        ) {
          merged = true;
          if (!(await facts.contains(pull.merge_commit_sha, source.headSha))) {
            clear = false;
            break;
          }
        }
      }
      if (!merged || !clear) {
        results.push({
          issue: issue.identifier,
          action: 'hold',
          reason: 'repair-not-in-build-or-active-pull',
        });
        continue;
      }
    }
    const observation = {
      schema: 'jovie.deprecation-observation/v1',
      issue: issue.identifier,
      fingerprint,
      status,
      headSha: source.headSha,
      runUrl: source.runUrl,
      observedAt: run.updated_at,
    };
    const previous = issue.comments.nodes
      .map(c => parseDeprecationObservation(c.body))
      .filter(
        v => v && v.issue === issue.identifier && v.fingerprint === fingerprint
      );
    if (previous.some(v => v.runUrl === source.runUrl && v.status === status)) {
      results.push({ issue: issue.identifier, action: 'replay' });
      continue;
    }
    if (
      previous.some(
        v => Date.parse(v.observedAt) > Date.parse(observation.observedAt)
      )
    ) {
      results.push({
        issue: issue.identifier,
        action: 'hold',
        reason: 'newer-observation-exists',
      });
      continue;
    }
    // Re-read immediately before writing; a new claim, PR or finding holds this snapshot.
    const current = await linear(
      `query DeprecationCurrent($id: String!) { issue(id: $id) { ${FIELDS} } }`,
      { id: issue.id }
    );
    if (JSON.stringify(current.issue) !== JSON.stringify(issue)) {
      results.push({
        issue: issue.identifier,
        action: 'hold',
        reason: 'issue-changed',
      });
      continue;
    }
    const body = formatDeprecationObservation(observation);
    const written = await comment({ issueId: issue.id, body });
    if (!written.ok || !written.id)
      throw new Error(`deprecation-comment-failed:${issue.identifier}`);
    const readback = await linear(
      'query DeprecationComment($id: String!) { comment(id: $id) { body } }',
      { id: written.id }
    );
    if (readback.comment?.body !== body)
      throw new Error(
        `deprecation-comment-readback-failed:${issue.identifier}`
      );
    results.push({
      issue: issue.identifier,
      action: 'recorded',
      status,
      commentId: written.id,
    });
  }
  return {
    results,
    deferred: Math.max(0, data.issues.nodes.length - MAX_OBSERVATIONS),
  };
}
export async function runDeprecationClearance(
  args,
  env = process.env,
  fetchImpl = fetch
) {
  if (!args[0] || !args[1] || !env.LINEAR_API_KEY || !env.GH_TOKEN)
    throw new Error(
      'log, observation, LINEAR_API_KEY and GH_TOKEN are required'
    );
  const github = githubClient(fetchImpl, env.GH_TOKEN);
  const linear = async (query, variables) => {
    const result = await linearRequest({
      key: env.LINEAR_API_KEY,
      query,
      variables,
      fetchImpl,
    });
    if (!result.ok || result.rateLimited || result.data?.errors?.length)
      throw new Error('deprecation-linear-unavailable');
    return result.data.data;
  };
  return recordDeprecationObservations({
    log: readFileSync(args[0], 'utf8'),
    source: JSON.parse(readFileSync(args[1], 'utf8')),
    github,
    facts: createProductionFacts({
      fetchImpl,
      github,
      repository: 'JovieInc/Jovie',
    }),
    linear,
    comment: args =>
      addLinearIssueComment({ ...args, apiKey: env.LINEAR_API_KEY, fetchImpl }),
  });
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  runDeprecationClearance(process.argv.slice(2))
    .then(value => console.log(JSON.stringify(value)))
    .catch(error => {
      console.error(error.message);
      process.exitCode = 1;
    });
