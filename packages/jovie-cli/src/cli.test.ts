import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
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

function createFetch(
  body: string,
  status = 200,
  headers: Record<string, string> = {}
) {
  const urls: string[] = [];
  const fetchImpl: FetchImplementation = async input => {
    urls.push(String(input));
    return new Response(body, { status, headers });
  };
  return { fetchImpl, urls };
}

describe('jovie CLI', () => {
  it('prints help without making a request', async () => {
    const stdout = createOutput();
    const result = await runCli(['--help'], { stdout: stdout.output });

    expect(result).toBe(0);
    expect(stdout.read()).toContain('artist get <username>');
    expect(stdout.read()).toContain('profile create <url>');
    expect(stdout.read()).toContain(
      'No login or API key is needed for public commands.'
    );
  });

  it('prints the source fallback version before command validation', async () => {
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
      args: ['creator', 'lookup', 'https://youtube.com/@creator'],
      body: '{"platform":"youtube","displayName":"Creator"}',
      expectedPath:
        '/api/agents/creator-lookup?url=https%3A%2F%2Fyoutube.com%2F%40creator',
      expectedOutput: { platform: 'youtube', displayName: 'Creator' },
    },
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

  it.each([
    [429, '{"error":"Too many requests"}'],
    [503, '{"error":"Public API temporarily unavailable"}'],
  ])('returns retry guidance for HTTP %s failures', async (status, body) => {
    const stdout = createOutput();
    const stderr = createOutput();
    const fetch = createFetch(body, status, { 'Retry-After': '30' });

    await expect(
      runCli(['artist', 'get', 'demo', '--json'], {
        fetchImpl: fetch.fetchImpl,
        stdout: stdout.output,
        stderr: stderr.output,
      })
    ).resolves.toBe(1);

    expect(JSON.parse(stdout.read())).toMatchObject({
      error: {
        code: 'REQUEST_FAILED',
        responseBody: body,
        retryAfterSeconds: 30,
        status,
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

  it('reports a missing command argument instead of an unknown command', async () => {
    const stdout = createOutput();
    const stderr = createOutput();

    await expect(
      runCli(['artist', 'get', '--json'], {
        stdout: stdout.output,
        stderr: stderr.output,
      })
    ).resolves.toBe(2);
    expect(JSON.parse(stdout.read())).toEqual({
      error: {
        code: 'USAGE_ERROR',
        message: 'Missing required argument <username> for artist get',
      },
    });

    const text = createOutput();
    await expect(
      runCli(['profile', 'create'], { stderr: text.output })
    ).resolves.toBe(2);
    expect(text.read()).toContain(
      'Missing required argument <url> for profile create'
    );
    expect(text.read()).not.toContain('Unknown command');
  });

  it('rejects malformed parser options and unsafe base URLs', async () => {
    const parserError = createOutput();
    await expect(
      runCli(['docs', 'llms', '--unknown', '--json'], {
        stdout: parserError.output,
      })
    ).resolves.toBe(2);
    expect(JSON.parse(parserError.read()).error.code).toBe('USAGE_ERROR');

    const baseError = createOutput();
    await expect(
      runCli(['docs', 'llms', '--base-url', 'https://jov.ie/path'], {
        stderr: baseError.output,
      })
    ).resolves.toBe(2);
    expect(baseError.read()).toContain('Base URL must be');

    const usernameError = createOutput();
    await expect(
      runCli(['artist', 'get', 'ab', '--json'], {
        stdout: usernameError.output,
      })
    ).resolves.toBe(2);
    expect(JSON.parse(usernameError.read())).toEqual({
      error: {
        code: 'INVALID_INPUT',
        message:
          'Username must be 3-30 characters and contain only letters, numbers, dots, underscores, or hyphens.',
      },
    });

    const textParserError = createOutput();
    await expect(
      runCli(['docs', 'llms', '--unknown'], {
        stderr: textParserError.output,
      })
    ).resolves.toBe(2);
    expect(textParserError.read()).toContain('Run `jovie --help` for usage.');
  });

  it('rejects --full for the OpenAPI command before making a request', async () => {
    const stderr = createOutput();
    const fetch = createFetch('{"openapi":"3.1.0"}');

    await expect(
      runCli(['api', 'openapi', '--full'], {
        fetchImpl: fetch.fetchImpl,
        stderr: stderr.output,
      })
    ).resolves.toBe(2);
    expect(fetch.urls).toEqual([]);
    expect(stderr.read()).toContain('--full is only supported by docs llms');
  });

  it('reports response stream failure with a stable request code', async () => {
    const stdout = createOutput();
    const fetchImpl: FetchImplementation = async () =>
      new Response(
        new ReadableStream({
          start(controller) {
            controller.error(new Error('body stream unavailable'));
          },
        })
      );

    await expect(
      runCli(['docs', 'llms', '--json'], {
        fetchImpl,
        stdout: stdout.output,
      })
    ).resolves.toBe(1);
    expect(JSON.parse(stdout.read())).toEqual({
      error: {
        code: 'REQUEST_FAILED',
        message: 'body stream unavailable',
        status: 200,
      },
    });
  });

  it('creates a profile and prints the claim URL as JSON', async () => {
    const stdout = createOutput();
    const fetch = createFetch(
      '{"username":"demo","claimUrl":"https://jov.ie/demo/claim"}',
      201
    );
    await expect(
      runCli(
        ['profile', 'create', 'https://open.spotify.com/artist/abc', '--json'],
        { fetchImpl: fetch.fetchImpl, stdout: stdout.output }
      )
    ).resolves.toBe(0);
    expect(fetch.urls).toEqual(['https://jov.ie/api/agents/profiles']);
    expect(JSON.parse(stdout.read())).toEqual({
      username: 'demo',
      claimUrl: 'https://jov.ie/demo/claim',
    });
  });

  it('exits 2 for a non-Spotify profile URL without a request', async () => {
    const stdout = createOutput();
    const fetch = createFetch('{}');
    await expect(
      runCli(['profile', 'create', 'https://instagram.com/x', '--json'], {
        fetchImpl: fetch.fetchImpl,
        stdout: stdout.output,
      })
    ).resolves.toBe(2);
    expect(fetch.urls).toEqual([]);
    expect(JSON.parse(stdout.read()).error.code).toBe('INVALID_INPUT');
  });

  it('prints the skill and serves MCP over stdin', async () => {
    const skill = createOutput();
    await expect(runCli(['skill'], { stdout: skill.output })).resolves.toBe(0);
    expect(skill.read()).toContain('name: jovie');

    const stdout = createOutput();
    await expect(
      runCli(['mcp'], {
        stdin: Readable.from([
          '{"jsonrpc":"2.0","id":1,"method":"tools/list"}\n',
        ]),
        stdout: stdout.output,
      })
    ).resolves.toBe(0);
    const tools = JSON.parse(stdout.read()).result.tools.map(
      (tool: { name: string }) => tool.name
    );
    expect(tools).toContain('create_profile');
  });

  it('installs the skill with init and rejects a bad MCP base URL', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'jovie-cli-init-'));
    const stdout = createOutput();
    await expect(
      runCli(['init', '--dir', dir, '--json'], { stdout: stdout.output })
    ).resolves.toBe(0);
    expect(JSON.parse(stdout.read()).installed).toEqual([
      join(dir, 'jovie/SKILL.md'),
    ]);

    const stderr = createOutput();
    await expect(
      runCli(['mcp', '--base-url', 'ftp://x'], {
        stdin: Readable.from([]),
        stderr: stderr.output,
      })
    ).resolves.toBe(2);
    expect(stderr.read()).toContain('Base URL must be');
  });

  it('files a report with flags and attaches safe context', async () => {
    const stdout = createOutput();
    const bodies: unknown[] = [];
    const fetchImpl: FetchImplementation = async (_input, init) => {
      bodies.push(JSON.parse(String(init?.body)));
      return new Response('{"reportId":"r-9"}', { status: 201 });
    };
    await expect(
      runCli(
        [
          'report',
          'bug',
          '--title',
          'claim link 404',
          '--details',
          'Opened it, got 404.',
          '--code',
          'CREATE_FAILED',
          '--json',
        ],
        { fetchImpl, stdout: stdout.output }
      )
    ).resolves.toBe(0);
    expect(JSON.parse(stdout.read())).toEqual({ reportId: 'r-9' });
    expect(bodies[0]).toMatchObject({
      kind: 'bug',
      title: 'claim link 404',
      context: { apiCode: 'CREATE_FAILED', channel: 'cli' },
    });
    const context = (bodies[0] as { context: Record<string, unknown> }).context;
    expect(Object.keys(context).sort()).toEqual(
      ['apiCode', 'channel', 'cliVersion', 'platform', 'runtime'].sort()
    );
  });

  it('rejects report flags on commands that do not take them', async () => {
    const stderr = createOutput();
    await expect(
      runCli(['api', 'openapi', '--title', 'x'], { stderr: stderr.output })
    ).resolves.toBe(2);
    expect(stderr.read()).toContain('--title is not supported by api openapi');
    const help = createOutput();
    await runCli(['--help'], { stdout: help.output });
    expect(help.read()).toContain('report bug --title <text> --details <text>');
  });
});

describe('machine-readable special commands', () => {
  it('prints JSON help and version', async () => {
    for (const flag of ['--help', '--version']) {
      const stdout = createOutput();
      expect(await runCli([flag, '--json'], { stdout: stdout.output })).toBe(0);
      expect(JSON.parse(stdout.read())).toHaveProperty(
        flag === '--help' ? 'content' : 'version'
      );
    }
  });
  it('rejects unsupported special command flags', async () => {
    for (const args of [
      ['skill', '--full', '--json'],
      ['skill', '--title', 'bad', '--json'],
    ]) {
      const stdout = createOutput();
      expect(await runCli(args, { stdout: stdout.output })).toBe(2);
      expect(JSON.parse(stdout.read()).error.code).toBe('USAGE_ERROR');
    }
  });
});
