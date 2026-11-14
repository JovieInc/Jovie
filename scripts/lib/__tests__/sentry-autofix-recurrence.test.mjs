import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';
import { runSentryRecurrenceObservations } from '../../sentry-autofix-recurrence.mjs';

const LINEAR_API = 'https://api.linear.app/graphql';

function jsonResponse(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('sentry recurrence observations runner', () => {
  it('only scans observation registrations and never touches GitHub or Sentry status', async () => {
    const fetchImpl = vi.fn(async url => {
      if (String(url) !== LINEAR_API) throw new Error('legacy path reached');
      return jsonResponse(200, {
        data: { issues: { nodes: [], pageInfo: { hasNextPage: false } } },
      });
    });
    expect(
      await runSentryRecurrenceObservations({
        githubToken: 'gh',
        sentryToken: 'sentry',
        linearApiKey: 'linear',
        fetchImpl,
      })
    ).toEqual({ ok: true, observations: { ok: true, results: [] } });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('fails closed without tokens or a Linear key', async () => {
    const fetchImpl = vi.fn();
    await expect(
      runSentryRecurrenceObservations({ githubToken: '', fetchImpl })
    ).resolves.toEqual({ ok: false, reason: 'missing_github_token' });
    await expect(
      runSentryRecurrenceObservations({
        githubToken: 'gh',
        sentryToken: '',
        fetchImpl,
      })
    ).resolves.toEqual({ ok: false, reason: 'missing_sentry_auth_token' });
    await expect(
      runSentryRecurrenceObservations({
        githubToken: 'gh',
        sentryToken: 'sentry',
        linearApiKey: '',
        fetchImpl,
      })
    ).resolves.toMatchObject({
      ok: false,
      reason: 'missing_linear_api_key',
    });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('surfaces an unreadable registration scan as red', async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse(401, {
        data: { issues: { nodes: [], pageInfo: { hasNextPage: false } } },
      })
    );
    const result = await runSentryRecurrenceObservations({
      githubToken: 'github-fixture',
      sentryToken: 'sentry-fixture',
      linearApiKey: 'linear-fixture',
      fetchImpl,
    });
    expect(result).toMatchObject({
      ok: false,
      reason: 'linear_http_401',
      observations: { ok: false, results: [] },
    });
  });

  it('propagates a pending-artifact deferral as a non-failing deferred run', async () => {
    const deferred = {
      reason: 'verified_production_artifact_pending',
      sha: '2'.repeat(40),
      retry: 'next sentry-autofix-recurrence clock tick re-dispatches',
    };
    vi.resetModules();
    vi.doMock('../../lib/sentry-validation-observation.mjs', () => ({
      runSentryValidationObservations: vi.fn(async () => ({
        ok: true,
        results: [],
        deferred,
      })),
    }));
    try {
      const { runSentryRecurrenceObservations: run } = await import(
        '../../sentry-autofix-recurrence.mjs'
      );
      expect(
        await run({
          githubToken: 'gh',
          sentryToken: 'sentry',
          linearApiKey: 'linear',
          fetchImpl: vi.fn(),
        })
      ).toMatchObject({ ok: true, deferred });
    } finally {
      vi.doUnmock('../../lib/sentry-validation-observation.mjs');
      vi.resetModules();
    }
  });
});

describe('sentry recurrence CLI artifacts', () => {
  async function runCli(env, fetchImpl) {
    const previousEntry = process.argv[1];
    const previousExitCode = process.exitCode;
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const exit = vi.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('Immediate exit would truncate the CLI artifact');
    });
    try {
      for (const [key, value] of Object.entries(env)) vi.stubEnv(key, value);
      if (fetchImpl) vi.stubGlobal('fetch', fetchImpl);
      process.argv[1] = fileURLToPath(
        new URL('../../sentry-autofix-recurrence.mjs', import.meta.url)
      );
      vi.resetModules();
      await import('../../sentry-autofix-recurrence.mjs');
      await vi.waitFor(() => expect(log).toHaveBeenCalledTimes(1));
      // main() reports a red result on the next tick, after the JSON line.
      await new Promise(resolve => setTimeout(resolve, 0));
      return {
        result: JSON.parse(log.mock.calls[0][0]),
        errors: [...error.mock.calls],
        exitCode: process.exitCode,
        previousExitCode,
        exited: exit.mock.calls.length > 0,
      };
    } finally {
      process.argv[1] = previousEntry;
      process.exitCode = previousExitCode;
      vi.unstubAllEnvs();
      vi.unstubAllGlobals();
      log.mockRestore();
      error.mockRestore();
      exit.mockRestore();
      vi.resetModules();
    }
  }

  it.each([
    ['', '', 'missing_github_token'],
    ['github-fixture', '', 'missing_sentry_auth_token'],
    ['github-fixture', 'sentry-fixture', 'missing_linear_api_key'],
  ])(
    'preserves a red JSON result for %s / %s',
    async (github, sentry, reason) => {
      const run = await runCli({
        GH_TOKEN: github,
        SENTRY_AUTH_TOKEN: sentry,
        LINEAR_API_KEY: '',
      });
      expect(run.result).toMatchObject({ ok: false, reason });
      expect(run.errors).toEqual([[reason]]);
      expect(run.exitCode).toBe(1);
      expect(run.exited).toBe(false);
    }
  );

  it('keeps the successful CLI result machine-readable without a failure exit', async () => {
    const fetchImpl = vi.fn(async url => {
      if (String(url) !== LINEAR_API) throw new Error('Unexpected CLI request');
      return jsonResponse(200, {
        data: { issues: { nodes: [], pageInfo: { hasNextPage: false } } },
      });
    });
    const run = await runCli(
      {
        GH_TOKEN: 'github-fixture',
        SENTRY_AUTH_TOKEN: 'sentry-fixture',
        LINEAR_API_KEY: 'linear-fixture',
      },
      fetchImpl
    );
    expect(run.result).toEqual({
      ok: true,
      observations: { ok: true, results: [] },
    });
    expect(run.errors).toEqual([]);
    expect(run.exitCode).toBe(run.previousExitCode);
    expect(run.exited).toBe(false);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});
