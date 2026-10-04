/**
 * Chaos suite (JOV-7714): the CLI against a hostile local server, hostile
 * input, and a hostile process environment. Every case asserts the same error
 * UX contract: one actionable line, a stable exit code, no stack trace unless
 * --debug, no secrets, and no hang. Deterministic: loopback only, seeded fuzz.
 */
import { spawn } from 'node:child_process';
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
} from 'node:fs';
import {
  createServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from 'node:http';
import type { Socket } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';

import {
  applyProxyFromEnv,
  type CliOutput,
  closedPipeListener,
  isEntrypoint,
  reportFatal,
  runCli,
  unsupportedNodeMessage,
} from './cli.js';
import type { FetchImplementation } from './client.js';
import { installSkill, resolveSkillsDir } from './init.js';
import { SKILL_MD } from './skill.js';

const cliPath = fileURLToPath(new URL('./cli.ts', import.meta.url));
const servers: Server[] = [];
const sockets = new Set<Socket>();
const SECRET =
  'jwf.00000000-0000-0000-0000-000000000000.worker.AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
const CHAOS_HOME = mkdtempSync(join(tmpdir(), 'jovie-chaos-home-'));
const STACK_FRAME = /\n\s+at\s|node:internal|Error: .*\n\s+at/;

type Handler = (request: IncomingMessage, response: ServerResponse) => void;

async function serve(handler: Handler): Promise<string> {
  const server = createServer(handler);
  servers.push(server);
  server.on('connection', socket => {
    sockets.add(socket);
    socket.once('close', () => sockets.delete(socket));
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('No port');
  return `http://127.0.0.1:${address.port}`;
}

/** A port that was just bound and released: connection refused. */
async function closedPort(): Promise<string> {
  const server = createServer();
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('No port');
  await new Promise<void>(resolve => server.close(() => resolve()));
  return `http://127.0.0.1:${address.port}`;
}

afterEach(async () => {
  for (const socket of sockets) socket.destroy();
  await Promise.all(
    servers
      .splice(0)
      .map(
        server => new Promise<void>(resolve => server.close(() => resolve()))
      )
  );
});

function capture() {
  let value = '';
  const output: CliOutput = {
    write(chunk: string) {
      value += chunk;
      return true;
    },
  };
  return { output, read: () => value };
}

async function cli(
  argv: string[],
  options: { fetchImpl?: FetchImplementation; timeoutMs?: number } = {}
) {
  const stdout = capture();
  const stderr = capture();
  const started = Date.now();
  const code = await runCli(argv, {
    stdout: stdout.output,
    stderr: stderr.output,
    timeoutMs: options.timeoutMs ?? 2_000,
    fetchImpl: options.fetchImpl,
    homeDir: CHAOS_HOME,
  });
  return {
    code,
    stdout: stdout.read(),
    stderr: stderr.read(),
    elapsed: Date.now() - started,
  };
}

/** The shared error UX contract every failure must satisfy. */
function expectCleanFailure(
  result: Awaited<ReturnType<typeof cli>>,
  exitCode: number
) {
  expect(result.code).toBe(exitCode);
  expect(result.stdout).toBe('');
  const lines = result.stderr.trimEnd().split('\n');
  // One actionable line, plus the --help pointer for usage errors only.
  expect(lines.length).toBeLessThanOrEqual(exitCode === 2 ? 2 : 1);
  expect(lines[0].length).toBeGreaterThan(10);
  expect(result.stderr).not.toMatch(STACK_FRAME);
  expect(result.stderr).not.toContain(SECRET);
  expect(result.stderr).not.toMatch(/\u001b/);
}

function expectJsonError(result: Awaited<ReturnType<typeof cli>>) {
  expect(result.stderr).toBe('');
  const lines = result.stdout.trimEnd().split('\n');
  expect(lines).toHaveLength(1);
  const parsed = JSON.parse(lines[0]) as {
    error: Record<string, unknown>;
  };
  expect(Object.keys(parsed)).toEqual(['error']);
  expect([
    'REQUEST_FAILED',
    'INVALID_INPUT',
    'USAGE_ERROR',
    'CLI_ERROR',
  ]).toContain(parsed.error.code);
  expect(typeof parsed.error.message).toBe('string');
  expect(lines[0]).not.toContain(SECRET);
  return parsed.error;
}

describe('network chaos', () => {
  it('retries a short 429 using Retry-After, then succeeds', async () => {
    let hits = 0;
    const base = await serve((_request, response) => {
      hits += 1;
      if (hits === 1) {
        response.writeHead(429, { 'Retry-After': '0' });
        response.end('{"error":{"code":"RATE_LIMITED"}}');
        return;
      }
      response.writeHead(200, { 'Content-Type': 'application/json' });
      response.end('{"openapi":"3.1.0"}');
    });
    const result = await cli(['api', 'openapi', '--json', '--base-url', base]);
    expect(result.code).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual({ openapi: '3.1.0' });
    expect(hits).toBe(2);
  });

  it('surfaces a long 429 immediately with when to retry', async () => {
    let hits = 0;
    const base = await serve((_request, response) => {
      hits += 1;
      response.writeHead(429, { 'Retry-After': '3600' });
      response.end('{"error":{"code":"RATE_LIMITED"}}');
    });
    const result = await cli(['docs', 'llms', '--base-url', base]);
    expectCleanFailure(result, 1);
    expect(result.stderr).toContain('Rate limited by 127.0.0.1');
    expect(result.stderr).toContain('Retry in 3600s');
    expect(hits).toBe(1);

    const json = expectJsonError(
      await cli(['docs', 'llms', '--json', '--base-url', base])
    );
    expect(json).toMatchObject({
      apiCode: 'RATE_LIMITED',
      retryAfterSeconds: 3600,
      retryable: true,
      status: 429,
    });
  });

  it('retries 5xx a bounded number of times, then explains the outage', async () => {
    let hits = 0;
    const base = await serve((_request, response) => {
      hits += 1;
      response.writeHead(503);
      response.end('<html>upstream down</html>');
    });
    const result = await cli(['api', 'openapi', '--base-url', base]);
    expectCleanFailure(result, 1);
    expect(result.stderr).toContain('temporarily unavailable');
    expect(hits).toBe(3);
  });

  it('does not retry a structured 502 application answer', async () => {
    let hits = 0;
    const base = await serve((_request, response) => {
      hits += 1;
      response.writeHead(502, { 'Content-Type': 'application/json' });
      response.end(
        '{"error":{"code":"LOOKUP_FAILED","message":"Creator data could not be extracted."}}'
      );
    });
    const result = await cli([
      'creator',
      'lookup',
      'https://www.youtube.com/@creator',
      '--base-url',
      base,
    ]);
    expectCleanFailure(result, 1);
    expect(result.stderr).toContain('Creator data could not be extracted.');
    expect(hits).toBe(1);
  });

  it('never retries a write, even on 503', async () => {
    let hits = 0;
    const base = await serve((_request, response) => {
      hits += 1;
      response.writeHead(503);
      response.end();
    });
    const result = await cli([
      'profile',
      'create',
      'https://open.spotify.com/artist/abc',
      '--base-url',
      base,
    ]);
    expectCleanFailure(result, 1);
    expect(hits).toBe(1);
  });

  it('times out a server that never sends headers', async () => {
    const base = await serve(() => {
      // Accept the request and never answer.
    });
    const result = await cli(['api', 'openapi', '--base-url', base], {
      timeoutMs: 400,
    });
    expectCleanFailure(result, 1);
    expect(result.stderr).toContain('did not respond within');
    expect(result.elapsed).toBeLessThan(3_000);
  });

  it('times out a body that stalls after the headers', async () => {
    const base = await serve((_request, response) => {
      response.writeHead(200, { 'Content-Type': 'text/plain' });
      response.write('# partial');
    });
    const result = await cli(['docs', 'llms', '--base-url', base], {
      timeoutMs: 400,
    });
    expectCleanFailure(result, 1);
    expect(result.stderr).toContain('did not finish responding');
    expect(result.elapsed).toBeLessThan(3_000);
  });

  it('reports a connection reset mid-body without a trace', async () => {
    const base = await serve((_request, response) => {
      response.writeHead(200, {
        'Content-Type': 'application/json',
        'Content-Length': '1000',
      });
      response.write('{"openapi":');
      setTimeout(() => response.socket?.destroy(), 20);
    });
    const result = await cli(['api', 'openapi', '--base-url', base]);
    expectCleanFailure(result, 1);
    expect(result.stderr).toContain('dropped the connection');
  });

  it('explains connection refused', async () => {
    const base = await closedPort();
    const result = await cli(['api', 'openapi', '--base-url', base]);
    expectCleanFailure(result, 1);
    expect(result.stderr).toContain('connection refused');
  });

  it('explains a fetch-blocked port instead of "fetch failed"', async () => {
    const result = await cli([
      'docs',
      'llms',
      '--base-url',
      'http://127.0.0.1:1',
    ]);
    expectCleanFailure(result, 1);
    expect(result.stderr).toContain('Port 1 is blocked');
  });

  it('points a 404 from a non-Jovie origin at --base-url', async () => {
    const base = await serve((_request, response) => {
      response.writeHead(404);
      response.end('nope');
    });
    const result = await cli(['api', 'openapi', '--base-url', base]);
    expectCleanFailure(result, 1);
    expect(result.stderr).toContain('is a Jovie deployment');
  });

  it('rejects a redirect with the origin to use instead', async () => {
    const base = await serve((_request, response) => {
      response.writeHead(301, { Location: 'https://example.invalid/' });
      response.end();
    });
    const result = await cli(['docs', 'llms', '--base-url', base]);
    expectCleanFailure(result, 1);
    expect(result.stderr).toContain('redirected the request');
  });

  it.each([
    ['DNS failure', 'ENOTFOUND', 'Could not resolve'],
    [
      'TLS self-signed',
      'DEPTH_ZERO_SELF_SIGNED_CERT',
      'TLS certificate check failed',
    ],
    ['TLS expired', 'CERT_HAS_EXPIRED', 'NODE_EXTRA_CA_CERTS'],
    ['network down', 'ENETUNREACH', 'Check your connection'],
  ])('maps %s to one actionable line', async (_name, code, expected) => {
    let attempts = 0;
    const fetchImpl: FetchImplementation = async () => {
      attempts += 1;
      // Exactly how undici reports system failures: a generic TypeError whose
      // cause carries the code.
      throw new TypeError('fetch failed', {
        cause: Object.assign(new Error(`${code} ${SECRET}`), { code }),
      });
    };
    const result = await cli(['api', 'openapi'], { fetchImpl });
    expectCleanFailure(result, 1);
    expect(result.stderr).toContain(expected);
    expect(result.stderr).not.toContain('fetch failed');
    // Permanent failures (DNS, TLS) fail fast; transient ones retry.
    expect(attempts).toBe(code === 'ENETUNREACH' ? 3 : 1);
  });

  it('blames the proxy, not the user, when a tunnel is refused', async () => {
    const fetchImpl: FetchImplementation = async () => {
      // undici's shape: an AbortError deep in the chain that is not a cancel.
      throw new TypeError('fetch failed', {
        cause: Object.assign(new Error('Request was cancelled.'), {
          code: 0,
          cause: Object.assign(
            new Error('Proxy response (502) !== 200 when HTTP Tunneling'),
            { name: 'AbortError', code: 'UND_ERR_ABORTED' }
          ),
        }),
      });
    };
    const result = await cli(['api', 'openapi'], { fetchImpl });
    expectCleanFailure(result, 1);
    expect(result.stderr).toContain('The proxy refused');
    expect(result.stderr).not.toContain('canceled');
  });

  it('flags a wrong environment that answers HTML instead of JSON', async () => {
    const base = await serve((_request, response) => {
      response.writeHead(200, { 'Content-Type': 'text/html' });
      response.end('<!doctype html><title>Not Jovie</title>');
    });
    const result = await cli(['api', 'openapi', '--base-url', base]);
    expectCleanFailure(result, 1);
    expect(result.stderr).toContain('invalid JSON');
  });

  it('caps an oversized body', async () => {
    const base = await serve((_request, response) => {
      response.writeHead(200, { 'Content-Type': 'text/plain' });
      response.end('x'.repeat(1_100_000));
    });
    const result = await cli(['docs', 'llms', '--base-url', base]);
    expectCleanFailure(result, 1);
    expect(result.stderr).toContain('1 MiB');
  });

  it('strips terminal escapes and secrets from server error messages', async () => {
    const base = await serve((_request, response) => {
      response.writeHead(400, { 'Content-Type': 'application/json' });
      response.end(
        JSON.stringify({
          error: {
            code: 'BAD',
            message: `\u001b]8;;evil\u0007click\u001b[2J Bearer ${SECRET}`,
          },
        })
      );
    });
    const result = await cli(['api', 'openapi', '--base-url', base]);
    expectCleanFailure(result, 1);
    const json = expectJsonError(
      await cli(['api', 'openapi', '--json', '--base-url', base])
    );
    expect(String(json.responseBody)).not.toContain(SECRET);
  });

  it('explains an unknown artist instead of a bare 404', async () => {
    const base = await serve((_request, response) => {
      response.writeHead(404, { 'Content-Type': 'application/json' });
      response.end('{"error":"Artist not found"}');
    });
    for (const command of ['get', 'llms']) {
      const result = await cli([
        'artist',
        command,
        'nobody',
        '--base-url',
        base,
      ]);
      expectCleanFailure(result, 1);
      expect(result.stderr).toContain('No public Jovie artist named "nobody"');
    }
  });
});

/** Mulberry32: tiny seeded PRNG so fuzz failures replay exactly. */
function prng(seed: number) {
  let state = seed;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const FUZZ_TOKENS = [
  'artist',
  'get',
  'llms',
  'creator',
  'lookup',
  'profile',
  'create',
  'api',
  'openapi',
  'docs',
  'report',
  'bug',
  'skill',
  'fleet',
  '--json',
  '--full',
  '--debug',
  '--title',
  '--details',
  '--base-url',
  '--base-url=',
  '--base-url=http://u:p@x',
  '--dir',
  '-h',
  '-x',
  '--',
  '-',
  '',
  ' ',
  'ü日本語🎵',
  'a'.repeat(4096),
  '../../etc/passwd',
  'https://open.spotify.com/artist/abc',
  'https://www.youtube.com/@creator',
  'javascript:alert(1)',
  'http://[::1',
  '%00%0a',
  '\u0000',
  '\u001b[31mred',
  '$(touch /tmp/pwned)',
  'C:\\Users\\a\\skills',
  SECRET,
];

describe('argument fuzzing', () => {
  it('never throws, hangs, or leaks for 300 seeded argv permutations', async () => {
    const random = prng(7714);
    const fetchImpl: FetchImplementation = async () =>
      new Response('{"ok":true}', {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    for (let run = 0; run < 300; run++) {
      const argv = Array.from(
        { length: 1 + Math.floor(random() * 5) },
        () => FUZZ_TOKENS[Math.floor(random() * FUZZ_TOKENS.length)]
      );
      const result = await cli(argv, { fetchImpl });
      const context = JSON.stringify(argv).slice(0, 200);
      expect([0, 1, 2, 3], context).toContain(result.code);
      if (!argv.includes('--debug'))
        expect(result.stderr, context).not.toMatch(STACK_FRAME);
      if (
        argv.includes('--json') &&
        !argv.includes('--') &&
        result.code !== 0
      ) {
        expect(() => JSON.parse(result.stdout), context).not.toThrow();
      }
      for (const output of [result.stdout, result.stderr]) {
        // Echoed input is bounded: nothing prints the 4 KiB token back.
        if (!argv.includes('skill') && !argv.includes('-h'))
          expect(output.includes('a'.repeat(200)), context).toBe(false);
      }
    }
  }, 30_000);

  it('rejects unicode, oversized, and traversal usernames before any request', async () => {
    let requests = 0;
    const fetchImpl: FetchImplementation = async () => {
      requests += 1;
      return new Response('{}');
    };
    for (const username of [
      'ü日本語',
      'a'.repeat(5_000),
      '../../x',
      'a b',
      '',
    ]) {
      const result = await cli(['artist', 'get', username], { fetchImpl });
      expectCleanFailure(result, 2);
    }
    expect(requests).toBe(0);
  });

  it('keeps a stable JSON success and error shape', async () => {
    const fetchImpl: FetchImplementation = async input =>
      String(input).endsWith('.txt')
        ? new Response('# guide\n')
        : new Response('{"openapi":"3.1.0"}');
    expect(
      JSON.parse((await cli(['docs', 'llms', '--json'], { fetchImpl })).stdout)
    ).toEqual({
      content: '# guide\n',
    });
    expect(
      JSON.parse((await cli(['--version', '--json'])).stdout)
    ).toHaveProperty('version');
    expect(Object.keys(expectJsonError(await cli(['nope', '--json'])))).toEqual(
      ['code', 'message']
    );
  });

  it('points a bare command family at its subcommands', async () => {
    const result = await cli(['artist']);
    expectCleanFailure(result, 2);
    expect(result.stderr).toContain('jovie artist get');
    expect(result.stderr).toContain('Run `jovie --help`');
  });

  it('prints a stack and cause only with --debug', async () => {
    const fetchImpl: FetchImplementation = async () => {
      throw new TypeError('fetch failed', {
        cause: Object.assign(new Error('boom'), { code: 'ECONNRESET' }),
      });
    };
    const quiet = await cli(['api', 'openapi'], { fetchImpl });
    expect(quiet.stderr).not.toMatch(STACK_FRAME);
    const debug = await cli(['api', 'openapi', '--debug'], { fetchImpl });
    expect(debug.code).toBe(1);
    expect(debug.stderr).toMatch(/\n\s+at\s/);
  });
});

describe('filesystem chaos (init)', () => {
  it('survives 25 concurrent installs into one directory', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'jovie-chaos-skills-'));
    await Promise.all(
      Array.from({ length: 25 }, () =>
        Promise.resolve().then(() => installSkill('/nonexistent', dir))
      )
    );
    expect(readFileSync(join(dir, 'jovie/SKILL.md'), 'utf8')).toBe(SKILL_MD);
    // No temp files survive.
    expect(readdirSync(join(dir, 'jovie'))).toEqual(['SKILL.md']);
  });

  it.skipIf(process.platform === 'win32' || process.getuid?.() === 0)(
    'explains a read-only skills directory in one line',
    async () => {
      const dir = mkdtempSync(join(tmpdir(), 'jovie-chaos-ro-'));
      chmodSync(dir, 0o500);
      try {
        const result = await cli(['init', '--dir', dir]);
        expectCleanFailure(result, 1);
        expect(result.stderr).toContain('permission denied');
        expect(result.stderr).toContain('--dir');
      } finally {
        chmodSync(dir, 0o700);
      }
    }
  );

  it('explains a skills path blocked by a file', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'jovie-chaos-file-'));
    mkdirSync(join(dir, 'skills'));
    const blocked = join(dir, 'skills');
    // `jovie` exists as a file, so mkdir of skills/jovie fails.
    const { writeFileSync } = await import('node:fs');
    writeFileSync(join(blocked, 'jovie'), 'not a directory');
    const result = await cli(['init', '--dir', blocked]);
    expectCleanFailure(result, 1);
    expect(result.stderr).toContain('Cannot write');
  });

  it('expands ~ in --dir=~/path the shell left unexpanded', () => {
    expect(resolveSkillsDir('~/agents/skills', '/home/u')).toBe(
      join('/home/u', 'agents/skills')
    );
    expect(resolveSkillsDir('~', '/home/u')).toBe(join('/home/u'));
    expect(resolveSkillsDir('~other/x', '/home/u')).not.toContain('/home/u');
  });
});

describe('platform and runtime', () => {
  it('matches npm Windows shims case-insensitively and never throws', () => {
    const realpath = (path: string) => path;
    const url =
      'file:///C:/Users/a/AppData/Roaming/npm/node_modules/@jovie/cli/dist/cli.js';
    if (process.platform === 'win32') {
      expect(
        isEntrypoint(
          url,
          'c:\\users\\a\\appdata\\roaming\\npm\\node_modules\\@jovie\\cli\\dist\\cli.js',
          'win32',
          realpath
        )
      ).toBe(true);
    }
    expect(
      isEntrypoint('file:///opt/cli.js', '/opt/cli.js', 'linux', realpath)
    ).toBe(true);
    expect(isEntrypoint('file:///opt/cli.js', undefined)).toBe(false);
    expect(
      isEntrypoint('file:///opt/cli.js', '/missing', 'linux', () => {
        throw new Error('ENOENT');
      })
    ).toBe(false);
  });

  it('exits with the pending code on a closed pipe and rethrows anything else', () => {
    const exits: number[] = [];
    const listener = closedPipeListener(code => exits.push(code));
    listener(Object.assign(new Error('write EPIPE'), { code: 'EPIPE' }));
    expect(exits).toEqual([0]);
    expect(() =>
      listener(Object.assign(new Error('disk'), { code: 'EIO' }))
    ).toThrow('disk');
  });

  it('reports an escaped bug in one redacted line, with detail only on --debug', () => {
    const stdout = capture();
    const stderr = capture();
    reportFatal(
      ['docs', 'llms'],
      new Error(`boom ${SECRET}`),
      stdout.output,
      stderr.output
    );
    expect(stderr.read().trim().split('\n')).toHaveLength(1);
    expect(stderr.read()).toContain('Unexpected error: boom');
    expect(stderr.read()).not.toContain(SECRET);

    const json = capture();
    const debug = capture();
    reportFatal(['--json', '--debug'], 'bad', json.output, debug.output);
    expect(JSON.parse(json.read()).error.code).toBe('CLI_ERROR');
    expect(debug.read()).toContain('bad');

    const broken: CliOutput = {
      write() {
        throw new Error('closed');
      },
    };
    expect(() => reportFatal([], new Error('x'), broken, broken)).not.toThrow();
  });

  it('warns instead of crashing when Node cannot apply a proxy', () => {
    const stderr = capture();
    applyProxyFromEnv(
      {},
      { HTTPS_PROXY: 'http://proxy:8080' },
      stderr.output,
      '22.13.0'
    );
    expect(stderr.read()).toContain('Use Node.js 24+');
    const quiet = capture();
    applyProxyFromEnv({}, {}, quiet.output, '22.13.0');
    expect(quiet.read()).toBe('');
    let applied = false;
    applyProxyFromEnv(
      {
        setGlobalProxyFromEnv: () => {
          applied = true;
        },
      },
      {},
      quiet.output
    );
    expect(applied).toBe(true);
  });

  it('names the Node version to install on an unsupported runtime', () => {
    expect(unsupportedNodeMessage('20.20.2')).toContain('Node.js 22 or newer');
    expect(unsupportedNodeMessage('22.13.0')).toBeUndefined();
    expect(unsupportedNodeMessage('26.5.0')).toBeUndefined();
  });
});

/** Run the real entrypoint as a child process (tsx strips types). */
function spawnCli(args: string[], env: NodeJS.ProcessEnv = {}) {
  const child = spawn(process.execPath, ['--import', 'tsx', cliPath, ...args], {
    env: {
      ...process.env,
      ...env,
      HTTP_PROXY: '',
      HTTPS_PROXY: '',
      NO_PROXY: '*',
    },
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  let stdout = '';
  let stderr = '';
  child.stdout.on('data', chunk => {
    stdout += chunk;
  });
  child.stderr.on('data', chunk => {
    stderr += chunk;
  });
  const done = new Promise<{
    code: number | null;
    signal: NodeJS.Signals | null;
  }>(resolve =>
    child.once('close', (code, signal) => resolve({ code, signal }))
  );
  return { child, done, out: () => stdout, err: () => stderr };
}

describe('process chaos', () => {
  it('exits quietly when stdout closes early (jovie ... | head)', async () => {
    const base = await serve((_request, response) => {
      response.writeHead(200, { 'Content-Type': 'text/plain' });
      response.end(`${'line of the guide\n'.repeat(50_000)}`);
    });
    const run = spawnCli(['docs', 'llms', '--base-url', base]);
    run.child.stdout.once('data', () => run.child.stdout.destroy());
    const { code } = await run.done;
    expect(run.err()).not.toMatch(/EPIPE|Unhandled 'error'/);
    expect(run.err()).not.toMatch(STACK_FRAME);
    expect(code).toBe(0);
  }, 20_000);

  it('dies cleanly on Ctrl-C mid-request', async () => {
    let received: () => void = () => {};
    const requested = new Promise<void>(resolve => {
      received = resolve;
    });
    const base = await serve(() => received());
    const run = spawnCli(['api', 'openapi', '--base-url', base]);
    await requested;
    run.child.kill('SIGINT');
    const { code, signal } = await run.done;
    expect(signal === 'SIGINT' || code === 130).toBe(true);
    expect(run.err()).not.toMatch(STACK_FRAME);
    expect(run.out()).toBe('');
  }, 20_000);

  it('serves MCP over piped, non-TTY stdin and exits on EOF', async () => {
    const run = spawnCli(['mcp']);
    run.child.stdin.end(
      `${JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'ping' })}\nnot json\n`
    );
    const { code } = await run.done;
    expect(code).toBe(0);
    const lines = run
      .out()
      .trim()
      .split('\n')
      .map(line => JSON.parse(line));
    expect(lines[0]).toEqual({ jsonrpc: '2.0', id: 1, result: {} });
    expect(lines[1].error.code).toBe(-32700);
  }, 20_000);
});
