import { randomUUID } from 'node:crypto';
import { appendFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const ALLOWED_STATUSES = new Set(['in_progress', 'ok', 'error']);
const MAX_DELIVERY_ATTEMPTS = 3;

// Delivery failures are transient transport problems (DNS, TCP resets, Sentry
// 5xx/429). They must not fail the probe job: Sentry's own missed-check-in
// deadman is the alerting channel for a truly unreachable ingest.
export class CheckInDeliveryError extends Error {}
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
  sleepImpl = ms => new Promise(resolve => setTimeout(resolve, ms)),
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
      checkin_margin: 60,
      failure_issue_threshold: 1,
      max_runtime: 3,
      recovery_threshold: 1,
      schedule: { type: 'interval', unit: 'hour', value: 4 },
      timezone: 'UTC',
    };
  }

  const url = buildCronCheckInUrl(dsn, monitorSlug);
  let lastError;
  for (let attempt = 1; attempt <= MAX_DELIVERY_ATTEMPTS; attempt += 1) {
    try {
      const response = await fetchImpl(url, {
        body: JSON.stringify(payload),
        headers: { 'content-type': 'application/json' },
        method: 'POST',
        signal: AbortSignal.timeout(10_000),
      });
      if (response.ok) return checkInId;
      const error = new CheckInDeliveryError(
        `Sentry rejected the check-in with HTTP ${response.status}`
      );
      if (response.status !== 429 && response.status < 500) throw error;
      lastError = error;
    } catch (error) {
      if (error instanceof CheckInDeliveryError) throw error;
      lastError = new CheckInDeliveryError(
        `Sentry check-in delivery failed: ${error.message}`,
        { cause: error }
      );
    }
    if (attempt < MAX_DELIVERY_ATTEMPTS) await sleepImpl(250 * attempt);
  }
  throw lastError;
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
  try {
    await sendCheckInImpl({
      checkInId,
      dsn: env.SENTRY_DSN,
      monitorSlug: 'jovie-production-continuity-schedule',
      status,
    });
    console.log(`Sentry continuity check-in accepted: ${status}`);
  } catch (error) {
    if (!(error instanceof CheckInDeliveryError)) throw error;
    console.warn(`::warning::${error.message}`);
    console.log(`Sentry continuity check-in skipped: ${status}`);
  }

  if (env.GITHUB_OUTPUT)
    appendFileSync(env.GITHUB_OUTPUT, `check_in_id=${checkInId}\n`);
}

/* node:coverage ignore next 6 */
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => {
    console.error(`::error::${error.message}`);
    process.exitCode = 1;
  });
}
