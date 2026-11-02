#!/usr/bin/env node
// No model, network, shell, board trust or execution boundary lives here.
// The existing relay owns durable repair tasks; a dispatch alone is not authority.
import { createHash } from 'node:crypto';
import { readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

export const MAX_EVENT_BYTES = 64 * 1024;
export const HOLD_EXIT = 78;
const REPOSITORY = 'JovieInc/Jovie';
const object = value =>
  value !== null && typeof value === 'object' && !Array.isArray(value);
const hash = value => createHash('sha256').update(value).digest('hex');

/** Shape checks are not authentication. Nothing in client_payload commissions execution. */
export function inspectSentryDispatch(event, eventName) {
  if (
    !object(event) ||
    eventName !== 'repository_dispatch' ||
    event.action !== 'sentry-issue' ||
    event.repository?.full_name !== REPOSITORY
  )
    return { reason: 'invalid-source-envelope' };
  const payload = event.client_payload;
  if (
    !object(payload) ||
    typeof payload.issue_id !== 'string' ||
    !/^[0-9]{1,24}$/.test(payload.issue_id) ||
    typeof payload.dedupe_key !== 'string' ||
    !/^root-[a-f0-9]{20}$/.test(payload.dedupe_key)
  ) {
    return { reason: 'invalid-incident-identity' };
  }
  const context = payload.context;
  if (
    !object(context) ||
    context.root_cause_fingerprint !== payload.dedupe_key ||
    !['production', 'prod'].includes(context.environment) ||
    typeof context.release !== 'string' ||
    context.release.length < 1 ||
    context.release.length > 128 ||
    typeof context.project !== 'string' ||
    context.project.length < 1 ||
    context.project.length > 128
  ) {
    return { reason: 'missing-production-context' };
  }
  // Hash even seemingly harmless identifiers: the repo and Actions artifacts are public.
  // Titles/messages/routes/stacks/users/contacts are never retained, even on rejection.
  return {
    reason: 'approved-source-adapter-uncommissioned',
    incidentKey: hash(
      JSON.stringify([REPOSITORY, payload.dedupe_key, context.environment])
    ),
    releaseDigest: hash(context.release),
  };
}

/** Fail visibly with a durable, allowlisted receipt; never claim a task/lease/repair. */
export function runSentryIntake(
  env = process.env,
  now = () => new Date().toISOString()
) {
  const enteredAt = now();
  let observation;
  try {
    if (statSync(env.GITHUB_EVENT_PATH).size > MAX_EVENT_BYTES)
      throw new Error('oversized');
    observation = inspectSentryDispatch(
      JSON.parse(readFileSync(env.GITHUB_EVENT_PATH, 'utf8')),
      env.GITHUB_EVENT_NAME
    );
  } catch {
    observation = { reason: 'unreadable-or-oversized-event' };
  }
  const receipt = {
    schema: 'jovie.sentry-autofix-hold/v1',
    repository: REPOSITORY,
    state: 'held',
    commissioned: false,
    taskCreated: false,
    workerStarted: false,
    owner: 'gem-ci-repair',
    enteredAt,
    exitedAt: now(),
    ...observation,
    nextAction:
      'Qualify authenticated Sentry source → existing relay/board task → approved fx/WorkersAI or subscription Codex route with a live lease. Require CI, merge, deploy and post-deploy recurrence proof separately.',
  };
  // A receipt write error propagates as failure; absence can never be a green run.
  writeFileSync(
    join(env.RUNNER_TEMP, 'sentry-autofix-hold.json'),
    `${JSON.stringify(receipt)}\n`,
    { mode: 0o600 }
  );
  if (env.GITHUB_STEP_SUMMARY)
    writeFileSync(
      env.GITHUB_STEP_SUMMARY,
      `Sentry autofix held: ${observation.reason}. No repair task or worker was started. Owner: gem-ci-repair. See the bounded hold artifact and docs/ops/SENTRY_AUTOFIX_COMMISSIONING.md.\n`,
      { flag: 'a' }
    );
  return HOLD_EXIT;
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  process.exitCode = runSentryIntake();
}
