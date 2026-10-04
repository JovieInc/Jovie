#!/usr/bin/env node
/**
 * Black-box chaos gate for a built or installed `jovie` binary (JOV-7714).
 *
 * The gate exercises the real entrypoint as a child process against a hostile
 * loopback server, fuzzed argv, closed pipes, signals, and the filesystem.
 * Every scenario must meet the error UX contract: the right exit code, at most
 * one actionable line (plus the --help hint for usage errors), no stack trace,
 * no secret, no terminal escapes, and no hang. It uses Node built-ins only, so
 * it runs unchanged on macOS, Linux, and Windows against a packed tarball.
 *
 *   node chaos-blackbox.mjs --bin <cli.js> [--profile pr|release|nightly]
 *     [--prod] [--shim <node_modules/.bin/jovie>] [--only a,b] [--report f]
 *
 * Exit 0 only when every scenario passed.
 */
import { spawn } from 'node:child_process';
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';

const SECRET =
  'jwf.00000000-0000-0000-0000-000000000000.worker.AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
const STACK_FRAME = /\n\s+at\s|node:internal|Unhandled 'error'/;
const ESCAPE = /\u001b/;
const FUZZ_RUNS = { pr: 60, release: 400, nightly: 400 };

const { values } = parseArgs({
  options: {
    bin: { type: 'string' },
    profile: { type: 'string', default: 'pr' },
    prod: { type: 'boolean', default: false },
    shim: { type: 'string' },
    only: { type: 'string' },
    report: { type: 'string' },
  },
});

if (!values.bin) {
  console.error('Usage: chaos-blackbox.mjs --bin <path/to/cli.js>');
  process.exit(2);
}
if (!(values.profile in FUZZ_RUNS)) {
  console.error('--profile must be pr, release, or nightly.');
  process.exit(2);
}
const bin = resolve(values.bin);
const only = values.only ? new Set(values.only.split(',')) : undefined;

// One loopback server; each scenario installs its own handler.
let handler = (_request, response) => response.end();
let hits = 0;
const sockets = new Set();
const server = createServer((request, response) => {
  hits += 1;
  handler(request, response);
});
server.on('connection', socket => {
  sockets.add(socket);
  socket.once('close', () => sockets.delete(socket));
});
await new Promise(done => server.listen(0, '127.0.0.1', done));
const base = `http://127.0.0.1:${server.address().port}`;

function closedPort() {
  return new Promise(done => {
    const probe = createServer();
    probe.listen(0, '127.0.0.1', () => {
      const { port } = probe.address();
      probe.close(() => done(`http://127.0.0.1:${port}`));
    });
  });
}

/** Run the binary; hard-kill at limitMs so a hang is a failure, not a stall. */
function run(args, options = {}) {
  const {
    env = {},
    input,
    limitMs = 20_000,
    onSpawn,
    command = process.execPath,
    prefix = [bin],
    shell = false,
  } = options;
  return new Promise(done => {
    const started = Date.now();
    const child = spawn(command, [...prefix, ...args], {
      env: {
        ...process.env,
        HTTP_PROXY: '',
        HTTPS_PROXY: '',
        http_proxy: '',
        https_proxy: '',
        NO_PROXY: '*',
        JOVIE_WORKER_TOKEN: '',
        ...env,
      },
      shell,
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
    });
    let stdout = '';
    let stderr = '';
    let killed = false;
    child.stdout.on('data', chunk => {
      stdout += chunk;
    });
    child.stdout.on('error', () => {});
    child.stderr.on('data', chunk => {
      stderr += chunk;
    });
    child.stdin.on('error', () => {});
    if (input !== undefined) child.stdin.end(input);
    else child.stdin.end();
    const timer = setTimeout(() => {
      killed = true;
      child.kill('SIGKILL');
    }, limitMs);
    onSpawn?.(child);
    child.once('error', error => {
      clearTimeout(timer);
      done({
        code: null,
        signal: null,
        stdout,
        stderr: `could not start: ${error.code ?? error.message}`,
        killed: false,
        ms: Date.now() - started,
      });
    });
    child.once('close', (code, signal) => {
      clearTimeout(timer);
      done({ code, signal, stdout, stderr, killed, ms: Date.now() - started });
    });
  });
}

const results = [];

function check(failures, condition, reason) {
  if (!condition) failures.push(reason);
}

/** The shared error UX contract every result must meet. */
function contract(result, { debug = false } = {}) {
  const failures = [];
  check(failures, !result.killed, `hung past ${result.ms}ms and was killed`);
  if (!debug)
    check(
      failures,
      !STACK_FRAME.test(result.stderr),
      'printed a stack trace to stderr'
    );
  check(
    failures,
    !result.stdout.includes(SECRET) && !result.stderr.includes(SECRET),
    'leaked a secret'
  );
  check(failures, !ESCAPE.test(result.stderr), 'printed a terminal escape');
  return failures;
}

function failureLines(result, code) {
  const failures = [];
  const lines = result.stderr.trimEnd().split('\n').filter(Boolean);
  check(
    failures,
    lines.length >= 1 && lines.length <= (code === 2 ? 2 : 1),
    `expected one stderr line, got ${lines.length}`
  );
  return failures;
}

async function scenario(name, body) {
  if (only && !only.has(name)) return;
  hits = 0;
  handler = (_request, response) => response.end();
  let failures;
  try {
    failures = await body();
  } catch (error) {
    failures = [`scenario threw: ${error?.message ?? error}`];
  }
  for (const socket of sockets) socket.destroy();
  results.push({ name, ok: failures.length === 0, failures });
  const mark = failures.length ? 'FAIL' : 'ok  ';
  console.log(
    `${mark} ${name}${failures.length ? `: ${failures.join('; ')}` : ''}`
  );
}

/** A failing command: exit code, one line, an expected phrase, the contract. */
async function expectFailure(args, code, phrase, options = {}) {
  const result = await run(args, options);
  const failures = contract(result);
  check(
    failures,
    result.code === code,
    `exit ${result.code}, expected ${code}`
  );
  failures.push(...failureLines(result, code));
  if (phrase)
    check(
      failures,
      result.stderr.includes(phrase),
      `stderr lacks "${phrase}": ${JSON.stringify(result.stderr.slice(0, 200))}`
    );
  return { failures, result };
}

function json(handlerBody, status = 200, headers = {}) {
  return (_request, response) => {
    response.writeHead(status, {
      'Content-Type': 'application/json',
      ...headers,
    });
    response.end(handlerBody);
  };
}

await scenario('version-and-help', async () => {
  const failures = [];
  for (const args of [['--version'], ['--help'], ['--version', '--json']]) {
    const result = await run(args);
    failures.push(...contract(result));
    check(failures, result.code === 0, `${args.join(' ')} exit ${result.code}`);
    check(failures, result.stdout.trim().length > 0, `${args} printed nothing`);
  }
  return failures;
});

await scenario('success-json-and-text', async () => {
  handler = (request, response) => {
    if (request.url.endsWith('.txt')) {
      response.writeHead(200, { 'Content-Type': 'text/plain' });
      response.end('# guide\n');
    } else json('{"openapi":"3.1.0"}')(request, response);
  };
  const failures = [];
  const api = await run(['api', 'openapi', '--json', '--base-url', base]);
  failures.push(...contract(api));
  check(failures, api.code === 0, `api exit ${api.code}`);
  try {
    check(
      failures,
      JSON.parse(api.stdout).openapi === '3.1.0',
      'bad JSON body'
    );
  } catch {
    failures.push('success --json output is not JSON');
  }
  const text = await run(['docs', 'llms', '--json', '--base-url', base]);
  check(failures, text.code === 0, `docs exit ${text.code}`);
  try {
    check(
      failures,
      JSON.parse(text.stdout).content === '# guide\n',
      'text resource not wrapped as {"content"}'
    );
  } catch {
    failures.push('text --json output is not JSON');
  }
  return failures;
});

await scenario('usage-errors', async () => {
  const failures = [];
  for (const args of [
    ['bogus'],
    ['artist'],
    ['artist', 'get'],
    ['docs', 'llms', '--nope'],
  ]) {
    const { failures: f } = await expectFailure(args, 2, 'jovie --help');
    failures.push(...f.map(reason => `${args.join(' ')}: ${reason}`));
  }
  const result = await run(['bogus', '--json']);
  check(failures, result.code === 2, `--json usage exit ${result.code}`);
  try {
    const parsed = JSON.parse(result.stdout.trim());
    check(
      failures,
      parsed.error?.code === 'USAGE_ERROR',
      'wrong JSON error code'
    );
  } catch {
    failures.push('--json usage error is not one JSON line');
  }
  check(failures, result.stderr === '', '--json usage error wrote stderr');
  return failures;
});

await scenario('hostile-input', async () => {
  const failures = [];
  let requested = 0;
  handler = (request, response) => {
    requested += 1;
    json('{}')(request, response);
  };
  for (const username of [
    'ü日本語',
    'a'.repeat(5_000),
    '../../x',
    `${SECRET}`,
  ]) {
    const { failures: f, result } = await expectFailure(
      ['artist', 'get', username, '--base-url', base],
      2
    );
    failures.push(...f);
    check(
      failures,
      !result.stderr.includes('a'.repeat(200)),
      'echoed 5 KB input'
    );
  }
  check(failures, requested === 0, 'made a request for invalid input');
  const { failures: f } = await expectFailure(
    ['docs', 'llms', '--base-url', `http://user:${SECRET}@x`],
    2
  );
  failures.push(...f);
  return failures;
});

await scenario('artist-not-found', async () => {
  handler = json('{"error":"Artist not found"}', 404);
  return (
    await expectFailure(
      ['artist', 'get', 'nobody', '--base-url', base],
      1,
      'No public Jovie artist named "nobody"'
    )
  ).failures;
});

await scenario('rate-limited-long-retry-after', async () => {
  handler = json('{"error":{"code":"RATE_LIMITED"}}', 429, {
    'Retry-After': '3600',
  });
  const { failures } = await expectFailure(
    ['api', 'openapi', '--base-url', base],
    1,
    'Rate limited'
  );
  check(
    failures,
    hits === 1,
    `slept through a long Retry-After (${hits} hits)`
  );
  return failures;
});

await scenario('server-unavailable-bounded-retry', async () => {
  handler = (_request, response) => {
    response.writeHead(503);
    response.end('<html>down</html>');
  };
  const { failures } = await expectFailure(
    ['api', 'openapi', '--base-url', base],
    1,
    'temporarily unavailable'
  );
  check(failures, hits >= 2 && hits <= 3, `expected 2-3 attempts, got ${hits}`);
  return failures;
});

await scenario('write-never-retries', async () => {
  handler = (_request, response) => {
    response.writeHead(503);
    response.end();
  };
  const { failures } = await expectFailure(
    [
      'profile',
      'create',
      'https://open.spotify.com/artist/abc',
      '--base-url',
      base,
    ],
    1
  );
  check(failures, hits === 1, `retried a write (${hits} hits)`);
  return failures;
});

await scenario('structured-502', async () => {
  handler = json(
    '{"error":{"code":"LOOKUP_FAILED","message":"Creator data could not be extracted."}}',
    502
  );
  return (
    await expectFailure(
      [
        'creator',
        'lookup',
        'https://www.youtube.com/@creator',
        '--base-url',
        base,
      ],
      1,
      'Creator data could not be extracted.'
    )
  ).failures;
});

await scenario('wrong-environment-html', async () => {
  handler = (_request, response) => {
    response.writeHead(200, { 'Content-Type': 'text/html' });
    response.end('<!doctype html><title>Not Jovie</title>');
  };
  return (
    await expectFailure(
      ['api', 'openapi', '--base-url', base],
      1,
      'invalid JSON'
    )
  ).failures;
});

await scenario('hang-before-headers', async () => {
  handler = () => {};
  const { failures, result } = await expectFailure(
    ['api', 'openapi', '--base-url', base],
    1,
    'did not respond',
    { env: { JOVIE_TIMEOUT_MS: '1500' }, limitMs: 15_000 }
  );
  check(
    failures,
    result.ms < 10_000,
    `took ${result.ms}ms with a 1.5s deadline`
  );
  return failures;
});

await scenario('stalled-body', async () => {
  handler = (_request, response) => {
    response.writeHead(200, { 'Content-Type': 'text/plain' });
    response.write('# partial');
  };
  return (
    await expectFailure(
      ['docs', 'llms', '--base-url', base],
      1,
      'did not finish',
      {
        env: { JOVIE_TIMEOUT_MS: '1500' },
        limitMs: 15_000,
      }
    )
  ).failures;
});

await scenario('reset-mid-body', async () => {
  handler = (_request, response) => {
    response.writeHead(200, {
      'Content-Type': 'application/json',
      'Content-Length': '1000',
    });
    response.write('{"openapi":');
    setTimeout(() => response.socket?.destroy(), 20);
  };
  return (await expectFailure(['api', 'openapi', '--base-url', base], 1))
    .failures;
});

await scenario('connection-refused', async () => {
  return (
    await expectFailure(
      ['api', 'openapi', '--base-url', await closedPort()],
      1,
      'connection refused'
    )
  ).failures;
});

await scenario('redirect', async () => {
  handler = (_request, response) => {
    response.writeHead(301, { Location: 'https://example.invalid/' });
    response.end();
  };
  return (
    await expectFailure(['docs', 'llms', '--base-url', base], 1, 'redirected')
  ).failures;
});

await scenario('oversized-body', async () => {
  handler = (_request, response) => {
    response.writeHead(200, { 'Content-Type': 'text/plain' });
    response.end('x'.repeat(1_100_000));
  };
  return (await expectFailure(['docs', 'llms', '--base-url', base], 1, '1 MiB'))
    .failures;
});

await scenario('injected-escapes-and-secrets', async () => {
  handler = json(
    JSON.stringify({
      error: {
        code: 'BAD',
        message: `\u001b]8;;evil\u0007click\u001b[2J Bearer ${SECRET}`,
      },
    }),
    400
  );
  const { failures } = await expectFailure(
    ['api', 'openapi', '--base-url', base],
    1
  );
  const asJson = await run(['api', 'openapi', '--json', '--base-url', base]);
  failures.push(...contract(asJson));
  return failures;
});

await scenario('dns-failure', async () => {
  // .invalid never resolves (RFC 6761), so this needs no outside network.
  return (
    await expectFailure(
      ['api', 'openapi', '--base-url', 'https://jovie-chaos.invalid'],
      1,
      'Could not resolve',
      { limitMs: 40_000 }
    )
  ).failures;
});

await scenario('closed-stdout-pipe', async () => {
  handler = (_request, response) => {
    response.writeHead(200, { 'Content-Type': 'text/plain' });
    response.end('line of the guide\n'.repeat(50_000));
  };
  const result = await run(['docs', 'llms', '--base-url', base], {
    onSpawn: child => child.stdout.once('data', () => child.stdout.destroy()),
  });
  const failures = contract(result);
  check(failures, result.code === 0, `exit ${result.code} after a closed pipe`);
  return failures;
});

if (process.platform !== 'win32') {
  await scenario('ctrl-c-mid-request', async () => {
    let arrived;
    const requested = new Promise(done => {
      arrived = done;
    });
    handler = () => arrived();
    const result = await run(['api', 'openapi', '--base-url', base], {
      onSpawn: child => requested.then(() => child.kill('SIGINT')),
    });
    const failures = contract(result);
    check(
      failures,
      result.signal === 'SIGINT' || result.code === 130,
      `Ctrl-C ended with code ${result.code} signal ${result.signal}`
    );
    check(failures, result.stdout === '', 'printed partial output on Ctrl-C');
    return failures;
  });
}

await scenario('mcp-over-piped-stdin', async () => {
  const result = await run(['mcp'], {
    input: `${JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'ping' })}\nnot json\n`,
  });
  const failures = contract(result);
  check(failures, result.code === 0, `mcp exit ${result.code}`);
  try {
    const lines = result.stdout
      .trim()
      .split('\n')
      .map(line => JSON.parse(line));
    check(failures, lines[0]?.id === 1, 'ping was not answered');
    check(
      failures,
      lines[1]?.error?.code === -32700,
      'parse error not reported'
    );
  } catch {
    failures.push('mcp stdout is not newline-delimited JSON');
  }
  return failures;
});

await scenario('init-filesystem', async () => {
  const failures = [];
  const dir = mkdtempSync(join(tmpdir(), 'jovie-chaos-init-'));
  try {
    const runs = await Promise.all(
      Array.from({ length: 8 }, () => run(['init', '--dir', dir]))
    );
    for (const result of runs) {
      failures.push(...contract(result));
      check(failures, result.code === 0, `concurrent init exit ${result.code}`);
    }
    const blocked = join(dir, 'blocked');
    mkdirSync(blocked);
    writeFileSync(join(blocked, 'jovie'), 'a file, not a directory');
    const { failures: f } = await expectFailure(
      ['init', '--dir', blocked],
      1,
      'Cannot write'
    );
    failures.push(...f);
    if (process.platform !== 'win32' && process.getuid?.() !== 0) {
      const readOnly = join(dir, 'read-only');
      mkdirSync(readOnly);
      chmodSync(readOnly, 0o500);
      const { failures: g } = await expectFailure(
        ['init', '--dir', readOnly],
        1,
        'permission denied'
      );
      chmodSync(readOnly, 0o700);
      failures.push(...g);
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
  return failures;
});

/** Mulberry32: seeded so a fuzz failure replays exactly. */
function prng(seed) {
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
  'feedback',
  'skill',
  'fleet',
  'status',
  '--json',
  '--full',
  '--title',
  '--details',
  '--base-url',
  '--base-url=',
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
  '\u001b[31mred',
  '$(touch /tmp/pwned)',
  'C:\\Users\\a\\skills',
  SECRET,
];

await scenario('argv-fuzz', async () => {
  const failures = [];
  handler = json('{"ok":true}');
  const random = prng(7714);
  for (let index = 0; index < FUZZ_RUNS[values.profile]; index++) {
    const argv = Array.from(
      { length: 1 + Math.floor(random() * 5) },
      () => FUZZ_TOKENS[Math.floor(random() * FUZZ_TOKENS.length)]
    ).map(token => (token === '--base-url' ? `--base-url=${base}` : token));
    // `\0` cannot cross exec on any OS; the in-process suite covers it.
    if (argv.some(token => token.includes('\u0000'))) continue;
    const result = await run(argv, { limitMs: 15_000 });
    const label = JSON.stringify(argv).slice(0, 120);
    for (const reason of contract(result)) failures.push(`${label}: ${reason}`);
    if (![0, 1, 2, 3].includes(result.code))
      failures.push(`${label}: exit ${result.code}`);
    const helpLike = argv.includes('skill') || argv.includes('-h');
    if (
      !helpLike &&
      `${result.stdout}${result.stderr}`.includes('a'.repeat(200))
    )
      failures.push(`${label}: echoed oversized input`);
    if (failures.length >= 5) break;
  }
  return failures;
});

if (values.shim) {
  // npm's bin shim (a .cmd on Windows) is how users actually start the CLI.
  await scenario('npm-bin-shim', async () => {
    const shell = process.platform === 'win32';
    const result = await run(['--version'], {
      command: shell ? `"${resolve(values.shim)}"` : resolve(values.shim),
      prefix: [],
      shell,
    });
    const failures = contract(result);
    check(failures, result.code === 0, `shim --version exit ${result.code}`);
    check(failures, /\d/.test(result.stdout), 'shim printed no version');
    return failures;
  });
}

if (values.prod) {
  // Read-only GETs against production. Never POST: no profiles, no reports.
  await scenario('prod-read-only', async () => {
    const failures = [];
    const docs = await run(['docs', 'llms'], { limitMs: 60_000 });
    failures.push(...contract(docs));
    check(
      failures,
      docs.code === 0 && docs.stdout.includes('Jovie'),
      'docs llms failed'
    );
    const full = await run(['docs', 'llms', '--full', '--json'], {
      limitMs: 60_000,
    });
    check(failures, full.code === 0, `docs llms --full exit ${full.code}`);
    const api = await run(['api', 'openapi', '--json'], { limitMs: 60_000 });
    try {
      const contractJson = JSON.parse(api.stdout);
      check(
        failures,
        String(contractJson.openapi).startsWith('3.') &&
          contractJson.info?.title === 'Jovie Artist API',
        'prod OpenAPI contract changed'
      );
    } catch {
      failures.push(`api openapi did not return JSON (exit ${api.code})`);
    }
    const { failures: missing } = await expectFailure(
      ['artist', 'get', 'zzzz-jovie-chaos-missing'],
      1,
      'No public Jovie artist',
      { limitMs: 60_000 }
    );
    failures.push(...missing.map(reason => `artist get: ${reason}`));
    const tls = await run(
      ['docs', 'llms', '--base-url', 'https://expired.badssl.com'],
      {
        limitMs: 60_000,
      }
    );
    failures.push(...contract(tls));
    // badssl.com is a third party; only judge the message when it answered.
    if (!/Could not resolve|did not respond|Network error/.test(tls.stderr))
      check(
        failures,
        tls.stderr.includes('TLS certificate'),
        'TLS error unclear'
      );
    return failures;
  });
}

server.close();
for (const socket of sockets) socket.destroy();

const failed = results.filter(result => !result.ok);
const summary = {
  bin,
  profile: values.profile,
  node: process.version,
  platform: process.platform,
  passed: results.length - failed.length,
  failed: failed.map(({ name, failures }) => ({ name, failures })),
};
if (values.report)
  writeFileSync(values.report, `${JSON.stringify(summary, null, 2)}\n`);
console.log(
  `\nchaos-blackbox: ${summary.passed}/${results.length} scenarios passed on ${process.platform} ${process.version}`
);
process.exit(failed.length ? 1 : 0);
