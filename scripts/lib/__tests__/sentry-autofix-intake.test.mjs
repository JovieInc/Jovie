import { spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  HOLD_EXIT,
  inspectSentryDispatch,
  MAX_EVENT_BYTES,
  runSentryIntake,
} from '../../sentry-autofix-intake.mjs';

/** @returns {any} Intentionally mutated into invalid external event shapes. */
const candidate = () => ({
  action: 'sentry-issue',
  repository: { full_name: 'JovieInc/Jovie' },
  client_payload: {
    issue_id: '123456',
    dedupe_key: 'root-0123456789abcdef0123',
    context: {
      root_cause_fingerprint: 'root-0123456789abcdef0123',
      environment: 'production',
      release: 'private-release-name',
      project: 'private-project',
    },
  },
});
const inspect = event => inspectSentryDispatch(event, 'repository_dispatch');

describe('Sentry hold boundary', () => {
  it('retains only an opaque incident identity without certifying the dispatch', () => {
    const result = inspect(candidate());
    expect(result).toEqual({
      reason: 'approved-source-adapter-uncommissioned',
      incidentKey: expect.stringMatching(/^[a-f0-9]{64}$/),
      releaseDigest: expect.stringMatching(/^[a-f0-9]{64}$/),
    });
    const sameRoot = candidate();
    sameRoot.client_payload.issue_id = '999';
    expect(inspect(sameRoot)).toEqual(result);
    const other = candidate();
    other.client_payload.context.environment = 'prod';
    expect(inspect(other).incidentKey).not.toBe(result.incidentKey);
  });

  it.each([
    null,
    [],
    {},
    { action: 'other' },
    { action: 'sentry-issue' },
    { action: 'sentry-issue', repository: { full_name: 'other/repo' } },
  ])('rejects an invalid event envelope %#', event => {
    expect(inspect(event)).toEqual({ reason: 'invalid-source-envelope' });
  });

  it('rejects events outside the supported GitHub event', () => {
    expect(inspectSentryDispatch(candidate(), 'workflow_dispatch')).toEqual({
      reason: 'invalid-source-envelope',
    });
  });

  it.each([
    null,
    [],
    {},
    { issue_id: 123, dedupe_key: 'root-0123456789abcdef0123' },
    { issue_id: '$(touch escaped)', dedupe_key: 'root-0123456789abcdef0123' },
    {
      issue_id: '123',
      dedupe_key: 'root-foo\n::set-output name=trusted::true',
    },
  ])('rejects malformed incident identity %#', payload => {
    const event = candidate();
    event.client_payload = payload;
    expect(inspect(event)).toEqual({ reason: 'invalid-incident-identity' });
  });

  it.each([
    null,
    [],
    {},
    { environment: 'preview' },
    { environment: 'production', release: '' },
    { environment: 'production', release: 'x'.repeat(129) },
    { environment: 'production', release: 123 },
    { environment: 'production', project: '' },
    { environment: 'production', project: 'x'.repeat(129) },
    { environment: 'production', project: 123 },
    { environment: 'production', root_cause_fingerprint: 'other' },
  ])('holds incomplete or nonproduction context %#', override => {
    const event = candidate();
    event.client_payload.context =
      override && !Array.isArray(override)
        ? { ...event.client_payload.context, ...override }
        : override;
    if (override && Object.keys(override).length === 0)
      event.client_payload.context = {};
    expect(inspect(event)).toEqual({ reason: 'missing-production-context' });
  });

  it.each(['candidate', 'malformed', 'oversized', 'missing', 'no-summary'])(
    'writes a durable hold and exits nonzero for %s input',
    mode => {
      const directory = mkdtempSync(join(tmpdir(), 'sentry-hold-'));
      try {
        const event = candidate();
        const privateText = 'PRIVATE_CONTACT_CONTENT';
        Object.assign(event.client_payload, {
          title: privateText,
          message: privateText,
          stacktrace: privateText,
          trusted: true,
          commissioned: true,
          provider: 'claude',
          command: 'touch escaped',
          verify_required: false,
          context: {
            ...event.client_payload.context,
            route: privateText,
            email: privateText,
          },
        });
        const path = join(directory, 'event.json');
        if (mode !== 'missing')
          writeFileSync(
            path,
            mode === 'malformed'
              ? '{broken'
              : mode === 'oversized'
                ? 'x'.repeat(MAX_EVENT_BYTES + 1)
                : JSON.stringify(event)
          );
        let tick = 0;
        const env = {
          GITHUB_EVENT_PATH: path,
          GITHUB_EVENT_NAME: 'repository_dispatch',
          RUNNER_TEMP: directory,
          ...(mode === 'no-summary'
            ? {}
            : { GITHUB_STEP_SUMMARY: join(directory, 'summary.md') }),
        };
        expect(
          runSentryIntake(
            env,
            () => ['2026-11-02T13:00:00Z', '2026-11-02T13:00:01Z'][tick++]
          )
        ).toBe(HOLD_EXIT);
        const text = readFileSync(
          join(directory, 'sentry-autofix-hold.json'),
          'utf8'
        );
        const receipt = JSON.parse(text);
        expect(receipt).toMatchObject({
          state: 'held',
          commissioned: false,
          taskCreated: false,
          workerStarted: false,
          enteredAt: '2026-11-02T13:00:00Z',
          exitedAt: '2026-11-02T13:00:01Z',
          owner: 'gem-ci-repair',
        });
        expect(receipt.reason).toBe(
          ['malformed', 'oversized', 'missing'].includes(mode)
            ? 'unreadable-or-oversized-event'
            : 'approved-source-adapter-uncommissioned'
        );
        for (const secret of [
          privateText,
          'claude',
          'touch escaped',
          'private-release-name',
          'private-project',
        ])
          expect(text).not.toContain(secret);
        expect(existsSync(join(directory, 'escaped'))).toBe(false);
      } finally {
        rmSync(directory, { recursive: true, force: true });
      }
    }
  );

  it('never returns success when receipt persistence fails', () => {
    expect(() =>
      runSentryIntake({
        GITHUB_EVENT_PATH: '/nonexistent/event',
        RUNNER_TEMP: '/nonexistent/state',
      })
    ).toThrow();
  });

  it('the actual workflow CLI cannot be commissioned by ambient environment or payload', () => {
    const directory = mkdtempSync(join(tmpdir(), 'sentry-cli-'));
    try {
      const event = candidate();
      Object.assign(event.client_payload, {
        commissioned: true,
        adapter: '/bin/sh',
        command: 'touch escaped',
      });
      const path = join(directory, 'event.json');
      writeFileSync(path, JSON.stringify(event));
      const result = spawnSync(
        process.execPath,
        [resolve(import.meta.dirname, '../../sentry-autofix-intake.mjs')],
        {
          cwd: directory,
          encoding: 'utf8',
          env: {
            ...process.env,
            GITHUB_EVENT_NAME: 'repository_dispatch',
            GITHUB_EVENT_PATH: path,
            RUNNER_TEMP: directory,
            GITHUB_STEP_SUMMARY: join(directory, 'summary.md'),
            SENTRY_AUTOFIX_COMMISSIONED: 'true',
          },
        }
      );
      expect(result.error).toBeUndefined();
      expect(result.status, result.stderr).toBe(HOLD_EXIT);
      expect(
        JSON.parse(
          readFileSync(join(directory, 'sentry-autofix-hold.json'), 'utf8')
        )
      ).toMatchObject({ commissioned: false, workerStarted: false });
      expect(existsSync(join(directory, 'escaped'))).toBe(false);
      expect(readFileSync(join(directory, 'summary.md'), 'utf8')).toContain(
        'No repair task or worker was started'
      );
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
