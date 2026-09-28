import assert from 'node:assert/strict';
import { readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';

import {
  buildCronCheckInUrl,
  CheckInDeliveryError,
  main,
  parseArgs,
  sendCheckIn,
} from './production-continuity-checkin.mjs';

const DSN = 'https://publickey@o123.ingest.sentry.io/456';
const CHECK_IN_ID = '12345678-1234-4234-8234-123456789abc';

describe('production continuity Sentry check-in', () => {
  it('derives the write-only Relay endpoint from a Sentry SaaS DSN', () => {
    assert.equal(
      buildCronCheckInUrl(DSN, 'jovie-production-continuity-schedule'),
      'https://o123.ingest.sentry.io/api/456/cron/jovie-production-continuity-schedule/publickey/'
    );
  });

  it('sends exact in-progress and terminal states with one stable id', async () => {
    const requests = [];
    const fetchImpl = async (url, init) => {
      requests.push({ body: JSON.parse(init.body), method: init.method, url });
      return { ok: true, status: 202 };
    };

    for (const status of ['in_progress', 'ok', 'error']) {
      await sendCheckIn({
        checkInId: CHECK_IN_ID,
        dsn: DSN,
        fetchImpl,
        monitorSlug: 'jovie-production-continuity-schedule',
        status,
      });
    }

    assert.deepEqual(requests[0].body, {
      check_in_id: CHECK_IN_ID,
      environment: 'production',
      monitor_config: {
        checkin_margin: 5,
        failure_issue_threshold: 1,
        max_runtime: 3,
        recovery_threshold: 1,
        schedule: { type: 'crontab', value: '*/5 * * * *' },
        timezone: 'UTC',
      },
      status: 'in_progress',
    });
    assert.deepEqual(
      requests.slice(1).map(({ body }) => body),
      ['ok', 'error'].map(status => ({
        check_in_id: CHECK_IN_ID,
        environment: 'production',
        status,
      }))
    );
    assert.ok(requests.every(({ method }) => method === 'POST'));
  });

  it('rejects malformed or non-Sentry DSNs before transmission', async () => {
    for (const dsn of [
      '',
      'http://publickey@o123.ingest.sentry.io/456',
      'https://publickey@example.com/456',
      'https://publickey@o123.ingest.sentry.io/not-a-project',
    ]) {
      assert.throws(
        () => buildCronCheckInUrl(dsn, 'jovie-production-continuity-schedule'),
        /required|HTTPS|Sentry SaaS|project id/
      );
    }
  });

  it('fails visibly when Sentry does not accept a check-in', async () => {
    await assert.rejects(
      sendCheckIn({
        checkInId: CHECK_IN_ID,
        dsn: DSN,
        fetchImpl: async () => ({ ok: false, status: 429 }),
        monitorSlug: 'jovie-production-continuity-schedule',
        sleepImpl: async () => {},
        status: 'ok',
      }),
      CheckInDeliveryError
    );
  });

  it('retries transient transport failures before succeeding', async () => {
    let calls = 0;
    const result = await sendCheckIn({
      checkInId: CHECK_IN_ID,
      dsn: DSN,
      fetchImpl: async () => {
        calls += 1;
        if (calls === 1) throw new TypeError('fetch failed');
        if (calls === 2) return { ok: false, status: 503 };
        return { ok: true, status: 202 };
      },
      monitorSlug: 'jovie-production-continuity-schedule',
      status: 'ok',
    });
    assert.equal(result, CHECK_IN_ID);
    assert.equal(calls, 3);
  });

  it('does not retry permanent rejections', async () => {
    let calls = 0;
    await assert.rejects(
      sendCheckIn({
        checkInId: CHECK_IN_ID,
        dsn: DSN,
        fetchImpl: async () => {
          calls += 1;
          return { ok: false, status: 400 };
        },
        monitorSlug: 'jovie-production-continuity-schedule',
        sleepImpl: async () => {},
        status: 'ok',
      }),
      /HTTP 400/
    );
    assert.equal(calls, 1);
  });

  it('rejects invalid status, id, and slug values', async () => {
    await assert.rejects(
      sendCheckIn({
        checkInId: 'latest',
        dsn: DSN,
        monitorSlug: 'jovie-production-continuity-schedule',
        status: 'ok',
      }),
      /id is invalid/
    );
    await assert.rejects(
      sendCheckIn({
        checkInId: CHECK_IN_ID,
        dsn: DSN,
        monitorSlug: 'jovie-production-continuity-schedule',
        status: 'unknown',
      }),
      /status is invalid/
    );
    assert.throws(
      () => buildCronCheckInUrl(DSN, '../other-monitor'),
      /slug is invalid/
    );
  });

  it('parses explicit ids, generates missing ids, and rejects stray arguments', () => {
    assert.deepEqual(
      parseArgs([`--status=ok`, `--check-in-id=${CHECK_IN_ID}`]),
      {
        checkInId: CHECK_IN_ID,
        status: 'ok',
      }
    );
    assert.deepEqual(
      parseArgs(['--status=in_progress'], () => CHECK_IN_ID),
      {
        checkInId: CHECK_IN_ID,
        status: 'in_progress',
      }
    );
    assert.throws(() => parseArgs(['--status', 'ok']), /Unsupported argument/);
  });

  it('runs the CLI boundary and emits the stable id for GitHub Actions', async () => {
    const outputPath = join(tmpdir(), `sentry-checkin-${process.pid}.txt`);
    writeFileSync(outputPath, '');
    const calls = [];

    try {
      await main({
        argv: ['--status=in_progress'],
        env: { GITHUB_OUTPUT: outputPath, SENTRY_DSN: DSN },
        sendCheckInImpl: async options => calls.push(options),
        uuidFactory: () => CHECK_IN_ID,
      });
      assert.equal(
        readFileSync(outputPath, 'utf8'),
        `check_in_id=${CHECK_IN_ID}\n`
      );
      assert.deepEqual(calls, [
        {
          checkInId: CHECK_IN_ID,
          dsn: DSN,
          monitorSlug: 'jovie-production-continuity-schedule',
          status: 'in_progress',
        },
      ]);

      await main({
        argv: [`--status=ok`, `--check-in-id=${CHECK_IN_ID}`],
        env: { SENTRY_DSN: DSN },
        sendCheckInImpl: async () => {},
      });
    } finally {
      unlinkSync(outputPath);
    }
  });

  it('degrades delivery outages to a warning but still emits the stable id', async () => {
    const outputPath = join(tmpdir(), `sentry-checkin-warn-${process.pid}.txt`);
    writeFileSync(outputPath, '');

    try {
      await main({
        argv: ['--status=in_progress'],
        env: { GITHUB_OUTPUT: outputPath, SENTRY_DSN: DSN },
        sendCheckInImpl: async () => {
          throw new CheckInDeliveryError(
            'Sentry check-in delivery failed: fetch failed'
          );
        },
        uuidFactory: () => CHECK_IN_ID,
      });
      assert.equal(
        readFileSync(outputPath, 'utf8'),
        `check_in_id=${CHECK_IN_ID}\n`
      );
    } finally {
      unlinkSync(outputPath);
    }
  });

  it('keeps configuration errors fatal', async () => {
    await assert.rejects(
      main({
        argv: ['--status=in_progress'],
        env: { SENTRY_DSN: DSN },
        sendCheckInImpl: async () => {
          throw new Error('SENTRY_DSN is required');
        },
        uuidFactory: () => CHECK_IN_ID,
      }),
      /SENTRY_DSN is required/
    );
  });
});
