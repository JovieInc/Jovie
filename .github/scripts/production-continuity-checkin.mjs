import { randomUUID } from 'node:crypto';
import { appendFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const ALLOWED_STATUSES = new Set(['in_progress', 'ok', 'error']);
const CHECK_IN_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MONITOR_SLUG_PATTERN = /^[a-z0-9][a-z0-9_-]{0,63}$/;

export function buildCronCheckInUrl(dsn, monitorSlug) {
  if (!dsn) throw new Error('SENTRY_DSN is required');
  if (!MONITOR_SLUG_PATTERN.test(monitorSlug)) {
    throw new Error('Sentry monitor slug is invalid');
  }

  const parsed = new URL(dsn);
  if (parsed.protocol !== 'https:')
    throw new Error('SENTRY_DSN must use HTTPS');
  if (!parsed.username || parsed.password || parsed.search || parsed.hash) {
    throw new Error('SENTRY_DSN has an invalid shape');
  }
  if (!/(^|\.)ingest(?:\.us)?\.sentry\.io$/.test(parsed.hostname)) {
    throw new Error('SENTRY_DSN must target Sentry SaaS ingestion');
  }

  const projectId = parsed.pathname.replace(/^\/+|\/+$/g, '');
  if (!/^\d+$/.test(projectId))
    throw new Error('SENTRY_DSN project id is invalid');

  return `https://${parsed.host}/api/${projectId}/cron/${monitorSlug}/${parsed.username}/`;
}

export async function sendCheckIn({
  checkInId,
  dsn,
  environment = 'production',
  fetchImpl = fetch,
  monitorSlug,
  status,
}) {
  if (!ALLOWED_STATUSES.has(status))
    throw new Error('Check-in status is invalid');
  if (!CHECK_IN_ID_PATTERN.test(checkInId))
    throw new Error('Check-in id is invalid');

  const payload = {
    check_in_id: checkInId,
    environment,
    status,
  };
  if (status === 'in_progress') {
    payload.monitor_config = {
      checkin_margin: 5,
      failure_issue_threshold: 1,
      max_runtime: 3,
      recovery_threshold: 1,
      schedule: { type: 'crontab', value: '*/5 * * * *' },
      timezone: 'UTC',
    };
  }

  const response = await fetchImpl(buildCronCheckInUrl(dsn, monitorSlug), {
    body: JSON.stringify(payload),
    headers: { 'content-type': 'application/json' },
    method: 'POST',
    signal: AbortSignal.timeout(10_000),
  });

  if (!response.ok) {
    throw new Error(
      `Sentry rejected the check-in with HTTP ${response.status}`
    );
  }

  return checkInId;
}

export function parseArgs(argv, uuidFactory = randomUUID) {
  const options = Object.fromEntries(
    argv.map(argument => {
      const match = argument.match(/^--([a-z-]+)=(.*)$/);
      if (!match) throw new Error(`Unsupported argument: ${argument}`);
      return [match[1], match[2]];
    })
  );
  const status = options.status;
  const checkInId = options['check-in-id'] || uuidFactory();

  return { checkInId, status };
}

export async function main({
  argv = process.argv.slice(2),
  env = process.env,
  sendCheckInImpl = sendCheckIn,
  uuidFactory,
} = {}) {
  const { checkInId, status } = parseArgs(argv, uuidFactory);
  await sendCheckInImpl({
    checkInId,
    dsn: env.SENTRY_DSN,
    monitorSlug: 'jovie-production-continuity-schedule',
    status,
  });

  if (env.GITHUB_OUTPUT)
    appendFileSync(env.GITHUB_OUTPUT, `check_in_id=${checkInId}\n`);
  console.log(`Sentry continuity check-in accepted: ${status}`);
}

/* node:coverage ignore next 6 */
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => {
    console.error(`::error::${error.message}`);
    process.exitCode = 1;
  });
}
