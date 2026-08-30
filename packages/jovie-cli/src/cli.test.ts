import { describe, expect, it } from 'vitest';
import {
  CLI_VERSION_FALLBACK,
  type CliOutput,
  packageVersionFromText,
  resolveCliVersion,
  runCli,
} from './cli.js';
import type { FetchImplementation } from './client.js';

function createOutput() {
  let value = '';
  const output: CliOutput = {
    write(chunk: string) {
      value += chunk;
      return true;
    },
  };
  return { output, read: () => value };
}

function createFetch(body: string, status = 200) {
  const urls: string[] = [];
  const fetchImpl: FetchImplementation = async input => {
    urls.push(String(input));
    return new Response(body, { status });
  };
  return { fetchImpl, urls };
}

describe('jovie CLI', () => {
  it('prints help without making a request', async () => {
    const stdout = createOutput();
    const result = await runCli(['--help'], { stdout: stdout.output });

    expect(result).toBe(0);
    expect(stdout.read()).toContain('artist get <username>');
    expect(stdout.read()).toContain('No login, API key');
  });

  it('prints the pre-release version before command validation', async () => {
    const stdout = createOutput();

    await expect(
      runCli(['--version'], { stdout: stdout.output })
    ).resolves.toBe(0);
    expect(stdout.read()).toBe('0.0.0-private\n');
  });

  it('uses a staged package version and falls back for private source trees', () => {
    expect(packageVersionFromText('{"version":"26.8.1"}')).toBe('26.8.1');
    expect(packageVersionFromText('{}')).toBe(CLI_VERSION_FALLBACK);
    expect(packageVersionFromText('not json')).toBe(CLI_VERSION_FALLBACK);
    expect(resolveCliVersion('missing-package.json')).toBe(
      CLI_VERSION_FALLBACK
    );
  });

  it.each([
    {
      args: ['artist', 'get', 'demo'],
      body: '{"artist":{"username":"demo"}}',
      expectedPath: '/api/v1/demo',
      expectedOutput: { artist: { username: 'demo' } },
    },
    {
      args: ['artist', 'llms', 'demo'],
      body: '# artist guide',
      expectedPath: '/demo/llms.txt',
      expectedOutput: '# artist guide\n',
    },
    {
      args: ['api', 'openapi'],
      body: '{"openapi":"3.1.0"}',
      expectedPath: '/api/v1/openapi.json',
      expectedOutput: { openapi: '3.1.0' },
    },
    {
      args: ['docs', 'llms', '--full'],
      body: '# full guide',
      expectedPath: '/llms-full.txt',
      expectedOutput: '# full guide\n',
    },
  ])('runs the supported read-only command %#', async testCase => {
    const stdout = createOutput();
    const fetch = createFetch(testCase.body);
    const result = await runCli(testCase.args, {
      fetchImpl: fetch.fetchImpl,
      stdout: stdout.output,
    });

    expect(result).toBe(0);
    expect(fetch.urls).toEqual([`https://jov.ie${testCase.expectedPath}`]);
    if (typeof testCase.expectedOutput === 'string') {
      expect(stdout.read()).toBe(testCase.expectedOutput);
    } else {
      expect(JSON.parse(stdout.read())).toEqual(testCase.expectedOutput);
    }
  });

  it('emits a compact JSON envelope for text resources', async () => {
    const stdout = createOutput();
    const fetch = createFetch('# guide');

    await expect(
      runCli(['docs', 'llms', '--json'], {
        fetchImpl: fetch.fetchImpl,
        stdout: stdout.output,
      })
    ).resolves.toBe(0);
    expect(JSON.parse(stdout.read())).toEqual({ content: '# guide' });
  });

  it('supports a compatible deployment origin without adding headers', async () => {
    const stdout = createOutput();
    const fetch = createFetch('{"artist":{}}');

    await expect(
      runCli(
        [
          'artist',
          'get',
          'demo',
          '--base-url',
          'https://staging.jov.ie/',
          '--json',
        ],
        { fetchImpl: fetch.fetchImpl, stdout: stdout.output }
      )
    ).resolves.toBe(0);
    expect(fetch.urls).toEqual(['https://staging.jov.ie/api/v1/demo']);
  });

  it('returns structured errors for request failures in JSON mode', async () => {
    const stdout = createOutput();
    const stderr = createOutput();
    const fetch = createFetch('missing', 404);

    await expect(
      runCli(['artist', 'get', 'demo', '--json'], {
        fetchImpl: fetch.fetchImpl,
        stdout: stdout.output,
        stderr: stderr.output,
      })
    ).resolves.toBe(1);
    expect(JSON.parse(stdout.read())).toEqual({
      error: {
        code: 'REQUEST_FAILED',
        message: 'GET https://jov.ie/api/v1/demo returned HTTP 404',
        responseBody: 'missing',
        status: 404,
      },
    });
    expect(stderr.read()).toBe('');
  });

  it('returns usage errors without making a request', async () => {
    const stdout = createOutput();
    const stderr = createOutput();

    await expect(
      runCli(['unknown', '--json'], {
        stdout: stdout.output,
        stderr: stderr.output,
      })
    ).resolves.toBe(2);
    expect(JSON.parse(stdout.read())).toEqual({
      error: {
        code: 'USAGE_ERROR',
        message: 'Unknown command: unknown',
      },
    });

    const invalid = createOutput();
    await expect(
      runCli(['artist', 'get', 'demo', '--full'], { stderr: invalid.output })
    ).resolves.toBe(2);
    expect(invalid.read()).toContain('--full is only supported by docs llms');
  });

  it('rejects malformed parser options and unsafe base URLs', async () => {
    const parserError = createOutput();
    await expect(
      runCli(['docs', 'llms', '--unknown', '--json'], {
        stdout: parserError.output,
      })
    ).resolves.toBe(2);
    expect(JSON.parse(parserError.read()).error.code).toBe('CLI_ERROR');

    const baseError = createOutput();
    await expect(
      runCli(['docs', 'llms', '--base-url', 'https://jov.ie/path'], {
        stderr: baseError.output,
      })
    ).resolves.toBe(1);
    expect(baseError.read()).toContain('Base URL must be');
  });
});
