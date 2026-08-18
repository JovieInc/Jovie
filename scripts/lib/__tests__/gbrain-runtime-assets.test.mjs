import { spawn } from 'node:child_process';
import { mkdtemp, readFile, symlink, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';

const testDir = dirname(fileURLToPath(import.meta.url));
const runtimeDir = resolve(testDir, '../../hermes/gbrain-runtime');
const proxyPath = join(runtimeDir, 'gbrain-mcp-http-proxy.py');
const wrapperPath = join(runtimeDir, 'gbrain-serve-wrapper.sh');
const plistPath = join(
  runtimeDir,
  'co.jovie.hermes.gbrain-local-server.plist.template'
);

const servers = [];

afterEach(async () => {
  await Promise.all(
    servers.splice(0).map(
      server =>
        new Promise(resolveClose => server.close(() => resolveClose()))
    )
  );
});

async function listen(handler) {
  const server = createServer(handler);
  servers.push(server);
  await new Promise(resolveListen => server.listen(0, '127.0.0.1', resolveListen));
  return server.address().port;
}

function runProcess(command, args, { env = {}, unset = [], stdin = '' } = {}) {
  return new Promise((resolveRun, rejectRun) => {
    const childEnv = { ...process.env, ...env };
    for (const key of unset) delete childEnv[key];
    const child = spawn(command, args, {
      env: childEnv,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', chunk => {
      stdout += chunk;
    });
    child.stdin.on('error', error => {
      if (error.code !== 'EPIPE') rejectRun(error);
    });
    child.stderr.on('data', chunk => {
      stderr += chunk;
    });
    child.on('error', rejectRun);
    child.on('close', code => resolveRun({ code, stdout, stderr }));
    child.stdin.end(stdin);
  });
}

async function runProxy({
  port = 9,
  token = 'test-only-token',
  tokenFile: suppliedTokenFile,
  tokenMode = 0o600,
  createToken = true,
  payload,
  rawInput,
  url,
  allowRemote = '0',
  extraEnv = {},
  unset = [],
}) {
  const dir = await mkdtemp(join(tmpdir(), 'gbrain-proxy-'));
  const tokenFile = suppliedTokenFile ?? join(dir, 'token');
  if (createToken) {
    await writeFile(tokenFile, token, { mode: tokenMode });
  }
  return runProcess('python3', [proxyPath], {
    env: {
      GBRAIN_MCP_URL: url ?? `http://127.0.0.1:${port}/mcp`,
      GBRAIN_MCP_ALLOW_REMOTE: allowRemote,
      GBRAIN_MCP_TOKEN_FILE: tokenFile,
      ...extraEnv,
    },
    unset,
    stdin: rawInput ?? `${JSON.stringify(payload)}\n`,
  });
}

async function runWrapper(env, unset = []) {
  return runProcess('bash', [wrapperPath], { env, unset });
}

describe('repository-owned GBrain runtime assets', () => {
  it('keeps the candidate service loopback-only and secret-free', async () => {
    const [wrapper, plist, proxy] = await Promise.all([
      readFile(wrapperPath, 'utf8'),
      readFile(plistPath, 'utf8'),
      readFile(proxyPath, 'utf8'),
    ]);
    const assets = `${wrapper}\n${plist}\n${proxy}`;

    expect(plist).toContain('<string>127.0.0.1</string>');
    expect(wrapper).toContain('refusing non-loopback bind');
    expect(wrapper).toContain('exec "$GBRAIN_BIN" serve --http');
    expect(wrapper).toContain("printf '%s' \"$CONFIG_SNAPSHOT\"");
    expect(wrapper).not.toContain('snapshot_value "$CONFIG_SNAPSHOT"');
    expect(wrapper).not.toMatch(/\/Users\/[A-Za-z0-9._-]+/);
    expect(assets).not.toMatch(/postgres(?:ql)?:\/\//i);
    expect(assets).not.toMatch(/Bearer\s+[A-Za-z0-9._-]{12,}/);
    expect(assets).not.toContain('/ready');

    const wrapperPort = wrapper.match(/GBRAIN_SERVE_PORT="\$\{[^}]+:-([0-9]+)\}"/);
    const proxyPort = proxy.match(/127\.0\.0\.1:([0-9]+)\/mcp/);
    expect(wrapperPort?.[1]).toBe('7801');
    expect(proxyPort?.[1]).toBe(wrapperPort?.[1]);
    expect(plist).toContain(`<string>${wrapperPort?.[1]}</string>`);
  });

  it('refuses accidental network exposure before starting the binary', async () => {
    const result = await runWrapper({
      GBRAIN_BIN: '/usr/bin/true',
      GBRAIN_SERVE_BIND: '0.0.0.0',
    });

    expect(result.code).toBe(64);
    expect(result.stderr).toContain('refusing non-loopback bind');
  });

  it('passes configured connection URLs and bounded pools to the release binary', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'gbrain-wrapper-'));
    const configFile = join(dir, 'config.json');
    const captureFile = join(dir, 'capture.json');
    const fakeBinary = join(dir, 'gbrain');
    await writeFile(
      configFile,
      JSON.stringify({
        database_url: 'postgres://transaction.example.invalid/db',
        direct_database_url: 'postgres://session.example.invalid/db',
      })
    );
    await writeFile(
      fakeBinary,
      `#!/usr/bin/env python3\nimport json, os, sys\njson.dump({"args": sys.argv[1:], "env": {key: os.environ.get(key) for key in ("GBRAIN_DATABASE_URL", "GBRAIN_DIRECT_DATABASE_URL", "GBRAIN_POOL_SIZE", "GBRAIN_DIRECT_POOL_SIZE", "GBRAIN_MAX_CONNECTIONS")}}, open(os.environ["CAPTURE_FILE"], "w"))\n`,
      { mode: 0o755 }
    );

    const result = await runWrapper(
      {
        CAPTURE_FILE: captureFile,
        GBRAIN_BIN: fakeBinary,
        GBRAIN_CONFIG_FILE: configFile,
        GBRAIN_POOL_SIZE: '3',
        GBRAIN_DIRECT_POOL_SIZE: '1',
        GBRAIN_MAX_CONNECTIONS: '3',
      },
      ['GBRAIN_DATABASE_URL', 'GBRAIN_DIRECT_DATABASE_URL']
    );
    const capture = JSON.parse(await readFile(captureFile, 'utf8'));

    expect(result).toMatchObject({ code: 0, stdout: '', stderr: '' });
    expect(capture.args).toEqual([
      'serve',
      '--http',
      '--bind',
      '127.0.0.1',
      '--port',
      '7801',
      '--suppress-bootstrap-token',
    ]);
    expect(capture.env).toEqual({
      GBRAIN_DATABASE_URL: 'postgres://transaction.example.invalid/db',
      GBRAIN_DIRECT_DATABASE_URL: 'postgres://session.example.invalid/db',
      GBRAIN_POOL_SIZE: '3',
      GBRAIN_DIRECT_POOL_SIZE: '1',
      GBRAIN_MAX_CONNECTIONS: '3',
    });
  });

  it('preserves explicit operator connection overrides', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'gbrain-wrapper-override-'));
    const configFile = join(dir, 'config.json');
    const captureFile = join(dir, 'capture.json');
    const fakeBinary = join(dir, 'gbrain');
    await writeFile(
      configFile,
      JSON.stringify({
        database_url: 'postgres://config.example.invalid/db',
        direct_database_url: 'postgres://config-direct.example.invalid/db',
      })
    );
    await writeFile(
      fakeBinary,
      `#!/usr/bin/env python3\nimport json, os\njson.dump({"database": os.environ.get("GBRAIN_DATABASE_URL"), "direct": os.environ.get("GBRAIN_DIRECT_DATABASE_URL")}, open(os.environ["CAPTURE_FILE"], "w"))\n`,
      { mode: 0o755 }
    );

    const result = await runWrapper({
      CAPTURE_FILE: captureFile,
      GBRAIN_BIN: fakeBinary,
      GBRAIN_CONFIG_FILE: configFile,
      GBRAIN_DATABASE_URL: 'postgres://operator.example.invalid/db',
      GBRAIN_DIRECT_DATABASE_URL:
        'postgres://operator-direct.example.invalid/db',
    });

    expect(result.code).toBe(0);
    expect(JSON.parse(await readFile(captureFile, 'utf8'))).toEqual({
      database: 'postgres://operator.example.invalid/db',
      direct: 'postgres://operator-direct.example.invalid/db',
    });
  });

  it('fails closed before launching when operator config is malformed', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'gbrain-wrapper-malformed-'));
    const configFile = join(dir, 'config.json');
    const markerFile = join(dir, 'launched');
    const fakeBinary = join(dir, 'gbrain');
    await writeFile(configFile, '{not-json');
    await writeFile(
      fakeBinary,
      `#!/usr/bin/env bash\ntouch "$MARKER_FILE"\n`,
      { mode: 0o755 }
    );

    const result = await runWrapper(
      {
        GBRAIN_BIN: fakeBinary,
        GBRAIN_CONFIG_FILE: configFile,
        MARKER_FILE: markerFile,
      },
      ['GBRAIN_DATABASE_URL', 'GBRAIN_DIRECT_DATABASE_URL']
    );

    expect(result.code).not.toBe(0);
    await expect(readFile(markerFile)).rejects.toThrow();
  });

  it('retries a transient daemon failure and parses an SSE JSON-RPC response', async () => {
    let requests = 0;
    const port = await listen((request, response) => {
      requests += 1;
      expect(request.headers.authorization).toBe('Bearer test-only-token');
      if (requests === 1) {
        response.writeHead(503).end('restarting');
        return;
      }
      response.writeHead(200, { 'content-type': 'text/event-stream' });
      response.end('data: {"jsonrpc":"2.0","id":7,"result":{"tools":[]}}\n\n');
    });

    const result = await runProxy({
      port,
      payload: { jsonrpc: '2.0', id: 7, method: 'tools/list' },
    });

    expect(result.code).toBe(0);
    expect(result.stderr).toBe('');
    expect(JSON.parse(result.stdout)).toEqual({
      jsonrpc: '2.0',
      id: 7,
      result: { tools: [] },
    });
    expect(requests).toBe(2);
  });

  it('does not replay a potentially mutating tool call after a transient failure', async () => {
    let requests = 0;
    const port = await listen((_request, response) => {
      requests += 1;
      response.writeHead(503).end('ambiguous failure');
    });

    const result = await runProxy({
      port,
      payload: {
        jsonrpc: '2.0',
        id: 9,
        method: 'tools/call',
        params: { name: 'put_page', arguments: { slug: 'test/no-replay' } },
      },
    });

    expect(result.code).toBe(0);
    expect(requests).toBe(1);
    expect(JSON.parse(result.stdout)).toMatchObject({
      id: 9,
      error: { code: -32000 },
    });
  });

  it.each([429, 503])(
    'bounds retries and returns a JSON-RPC error for persistent HTTP %i',
    async status => {
      let requests = 0;
      const port = await listen((_request, response) => {
        requests += 1;
        response.writeHead(status).end('still unavailable');
      });

      const result = await runProxy({
        port,
        payload: { jsonrpc: '2.0', id: 12, method: 'tools/list' },
      });

      expect(requests).toBe(3);
      expect(JSON.parse(result.stdout)).toMatchObject({
        id: 12,
        error: { code: -32000 },
      });
    }
  );

  it('supports concurrent MCP clients through one shared HTTP endpoint', async () => {
    let active = 0;
    let maxActive = 0;
    let release;
    const twoClientsEntered = new Promise(resolveBarrier => {
      release = resolveBarrier;
    });
    const port = await listen(async (request, response) => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      if (active >= 2) release();
      const chunks = [];
      for await (const chunk of request) chunks.push(chunk);
      const payload = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      await twoClientsEntered;
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(
        JSON.stringify({ jsonrpc: '2.0', id: payload.id, result: { ok: true } })
      );
      active -= 1;
    });

    const results = await Promise.all(
      Array.from({ length: 12 }, (_, index) =>
        runProxy({
          port,
          payload: { jsonrpc: '2.0', id: index + 1, method: 'tools/list' },
        })
      )
    );

    expect(maxActive).toBeGreaterThan(1);
    expect(results.map(result => JSON.parse(result.stdout).id)).toEqual(
      Array.from({ length: 12 }, (_, index) => index + 1)
    );
    expect(results.every(result => result.code === 0)).toBe(true);
  }, 10_000);

  it('does not let one slow request head-of-line block the same stdio proxy', async () => {
    let releaseFirst;
    const secondEntered = new Promise(resolveSecond => {
      releaseFirst = resolveSecond;
    });
    const port = await listen(async (request, response) => {
      const chunks = [];
      for await (const chunk of request) chunks.push(chunk);
      const payload = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      if (payload.id === 1) await secondEntered;
      if (payload.id === 2) releaseFirst();
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(
        JSON.stringify({ jsonrpc: '2.0', id: payload.id, result: { ok: true } })
      );
    });

    const result = await runProxy({
      port,
      rawInput:
        '{"jsonrpc":"2.0","id":1,"method":"tools/list"}\n' +
        '{"jsonrpc":"2.0","id":2,"method":"tools/list"}\n',
    });
    const ids = result.stdout
      .trim()
      .split('\n')
      .map(line => JSON.parse(line).id)
      .sort((a, b) => a - b);

    expect(result.code).toBe(0);
    expect(ids).toEqual([1, 2]);
  }, 10_000);

  it('emits an SSE event before the server closes the stream', async () => {
    let openResponse;
    const port = await listen((_request, response) => {
      openResponse = response;
      response.writeHead(200, { 'content-type': 'text/event-stream' });
      response.write('data: {"jsonrpc":"2.0","id":15,"result":{"ok":true}}\n\n');
    });
    const dir = await mkdtemp(join(tmpdir(), 'gbrain-proxy-stream-'));
    const tokenFile = join(dir, 'token');
    await writeFile(tokenFile, 'test-only-token', { mode: 0o600 });

    const result = await new Promise((resolveRun, rejectRun) => {
      const child = spawn('python3', [proxyPath], {
        env: {
          ...process.env,
          GBRAIN_MCP_URL: `http://127.0.0.1:${port}/mcp`,
          GBRAIN_MCP_ALLOW_REMOTE: '0',
          GBRAIN_MCP_TOKEN_FILE: tokenFile,
        },
        stdio: ['pipe', 'pipe', 'pipe'],
      });
      let stdout = '';
      let stderr = '';
      const timeout = setTimeout(() => {
        child.kill('SIGKILL');
        rejectRun(new Error('proxy did not emit while SSE stream remained open'));
      }, 3000);
      child.stderr.on('data', chunk => {
        stderr += chunk;
      });
      child.stdout.on('data', chunk => {
        stdout += chunk;
        if (stdout.includes('\n')) {
          openResponse.end();
          child.stdin.end();
        }
      });
      child.on('error', rejectRun);
      child.on('close', code => {
        clearTimeout(timeout);
        resolveRun({ code, stdout, stderr });
      });
      child.stdin.write(
        '{"jsonrpc":"2.0","id":15,"method":"tools/list"}\n'
      );
    });

    expect(result.code).toBe(0);
    expect(result.stderr).toBe('');
    expect(JSON.parse(result.stdout)).toMatchObject({ id: 15, result: { ok: true } });
  }, 5000);

  it('does not retry deterministic authentication failures and keeps JSON-RPC shaped errors', async () => {
    let requests = 0;
    const port = await listen((_request, response) => {
      requests += 1;
      response.writeHead(401).end('unauthorized');
    });

    const result = await runProxy({
      port,
      payload: { jsonrpc: '2.0', id: 11, method: 'tools/list' },
    });
    const response = JSON.parse(result.stdout);

    expect(result.code).toBe(0);
    expect(requests).toBe(1);
    expect(response).toMatchObject({
      jsonrpc: '2.0',
      id: 11,
      error: { code: -32000 },
    });
    expect(response.error.message).toContain('returned 401');
  });

  it.each([
    ['empty', 200, ''],
    [
      'mismatched-id',
      200,
      '{"jsonrpc":"2.0","id":999,"result":{"ok":true}}',
    ],
    ['scalar', 200, '42'],
    ['missing-result-and-error', 200, '{"jsonrpc":"2.0","id":17}'],
    [
      'result-and-error',
      200,
      '{"jsonrpc":"2.0","id":17,"result":{},"error":{"code":-1}}',
    ],
    [
      'scalar-error',
      200,
      '{"jsonrpc":"2.0","id":17,"error":"not-an-object"}',
    ],
    ['empty-error', 200, '{"jsonrpc":"2.0","id":17,"error":{}}'],
    [
      'string-error-code',
      200,
      '{"jsonrpc":"2.0","id":17,"error":{"code":"-1","message":"bad"}}',
    ],
    [
      'boolean-error-code',
      200,
      '{"jsonrpc":"2.0","id":17,"error":{"code":true,"message":"bad"}}',
    ],
    [
      'non-string-error-message',
      200,
      '{"jsonrpc":"2.0","id":17,"error":{"code":-1,"message":42}}',
    ],
  ])('rejects an invalid %s daemon response', async (_name, status, body) => {
    const port = await listen((_request, response) => {
      response.writeHead(status, { 'content-type': 'application/json' });
      response.end(body);
    });

    const result = await runProxy({
      port,
      payload: {
        jsonrpc: '2.0',
        id: 17,
        method: 'tools/call',
        params: { name: 'query', arguments: { question: 'test' } },
      },
    });

    const response = JSON.parse(result.stdout);
    expect(response).toMatchObject({ id: 17, error: { code: -32000 } });
    expect(result.stdout.trim().split('\n')).toHaveLength(1);
  });

  it('rejects redirects without forwarding the bearer token', async () => {
    let redirectedRequests = 0;
    const destinationPort = await listen((_request, response) => {
      redirectedRequests += 1;
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end('{"jsonrpc":"2.0","id":14,"result":{}}');
    });
    const redirectPort = await listen((_request, response) => {
      response
        .writeHead(302, {
          location: `http://127.0.0.1:${destinationPort}/capture`,
        })
        .end();
    });

    const result = await runProxy({
      port: redirectPort,
      payload: { jsonrpc: '2.0', id: 14, method: 'tools/list' },
    });

    expect(redirectedRequests).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({
      id: 14,
      error: { code: -32000, message: 'shared gbrain HTTP redirect rejected' },
    });
  });

  it('ignores inherited HTTP proxy settings that could receive the bearer', async () => {
    let proxyRequests = 0;
    const proxyPort = await listen((_request, response) => {
      proxyRequests += 1;
      response.writeHead(502).end();
    });

    const result = await runProxy({
      port: 1,
      payload: {
        jsonrpc: '2.0',
        id: 16,
        method: 'tools/call',
        params: { name: 'query', arguments: { question: 'test' } },
      },
      extraEnv: {
        HTTP_PROXY: `http://127.0.0.1:${proxyPort}`,
        http_proxy: `http://127.0.0.1:${proxyPort}`,
      },
      unset: ['NO_PROXY', 'no_proxy'],
    });

    expect(result.code).toBe(0);
    expect(proxyRequests).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({
      id: 16,
      error: { code: -32000 },
    });
  });

  it('refuses to send a bearer token to a remote host without explicit opt-in', async () => {
    const result = await runProxy({
      url: 'https://example.invalid/mcp',
      rawInput: '',
    });

    expect(result.code).toBe(1);
    expect(result.stderr).toContain('refusing non-loopback GBRAIN_MCP_URL');
  });

  it('refuses token files readable by group or others', async () => {
    const result = await runProxy({
      tokenMode: 0o644,
      rawInput: '',
    });

    expect(result.code).toBe(1);
    expect(result.stderr).toContain(
      'token file must not be accessible by group or others'
    );
  });

  it.each([
    ['missing', false, 'test-only-token', 'startup validation failed'],
    ['empty', true, '', 'token file is empty'],
  ])('fails closed for a %s token file', async (_name, createToken, token, message) => {
    const dir = await mkdtemp(join(tmpdir(), 'gbrain-proxy-token-'));
    const result = await runProxy({
      tokenFile: join(dir, 'token'),
      createToken,
      token,
      rawInput: '',
    });

    expect(result.code).toBe(1);
    expect(result.stdout).toBe('');
    expect(result.stderr).toContain(message);
  });

  it('rejects multiline bearer material without reflecting it', async () => {
    const secretMarker = 'active-token-marker';
    const result = await runProxy({
      token: `${secretMarker}\nextra`,
      rawInput: '',
    });

    expect(result.code).toBe(1);
    expect(`${result.stdout}${result.stderr}`).not.toContain(secretMarker);
    expect(result.stderr).toContain('token must be one printable ASCII line');
  });

  it('rejects symlinked and oversized token files', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'gbrain-proxy-token-shape-'));
    const target = join(dir, 'target');
    const link = join(dir, 'link');
    await writeFile(target, 'test-only-token', { mode: 0o600 });
    await symlink(target, link);

    const symlinkResult = await runProxy({
      tokenFile: link,
      createToken: false,
      rawInput: '',
    });
    const oversizedResult = await runProxy({
      token: 'x'.repeat(16 * 1024 + 1),
      rawInput: '',
    });

    expect(symlinkResult.code).toBe(1);
    expect(oversizedResult.code).toBe(1);
    expect(oversizedResult.stderr).toContain('token file is too large');
  });

  it('bounds worker configuration errors without a traceback', async () => {
    const result = await runProxy({
      rawInput: '',
      extraEnv: { GBRAIN_MCP_MAX_WORKERS: 'garbage' },
    });

    expect(result.code).toBe(1);
    expect(result.stdout).toBe('');
    expect(result.stderr).toContain('GBRAIN_MCP_MAX_WORKERS must be an integer');
    expect(result.stderr).not.toContain('Traceback');
  });

  it('survives a non-UTF-8 frame before serving the next request', async () => {
    const port = await listen(async (request, response) => {
      const chunks = [];
      for await (const chunk of request) chunks.push(chunk);
      const payload = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(
        JSON.stringify({ jsonrpc: '2.0', id: payload.id, result: { ok: true } })
      );
    });
    const result = await runProxy({
      port,
      rawInput: Buffer.concat([
        Buffer.from([0xff, 0x0a]),
        Buffer.from('{"jsonrpc":"2.0","id":19,"method":"tools/list"}\n'),
      ]),
    });
    const responses = result.stdout
      .trim()
      .split('\n')
      .map(line => JSON.parse(line));

    expect(result.code).toBe(0);
    expect(result.stderr).not.toContain('Traceback');
    expect(responses).toContainEqual(
      expect.objectContaining({
        id: null,
        error: expect.objectContaining({ code: -32000 }),
      })
    );
    expect(responses).toContainEqual(
      expect.objectContaining({ id: 19, result: { ok: true } })
    );
  });

  it('terminates the transport for an oversized request so pending calls reject', async () => {
    let requests = 0;
    const port = await listen(async (request, response) => {
      requests += 1;
      const chunks = [];
      for await (const chunk of request) chunks.push(chunk);
      const payload = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(
        JSON.stringify({ jsonrpc: '2.0', id: payload.id, result: { ok: true } })
      );
    });
    const result = await runProxy({
      port,
      rawInput:
        `${'x'.repeat(1024 * 1024 + 1)}\n` +
        '{"jsonrpc":"2.0","id":18,"method":"tools/list"}\n',
    });

    expect(result.code).toBe(1);
    expect(result.stderr).toContain('request exceeds size limit');
    expect(result.stdout).toBe('');
    expect(requests).toBe(0);
  }, 10_000);

  it.each(['application/json', 'text/event-stream'])(
    'rejects an oversized %s daemon response',
    async contentType => {
      const port = await listen((_request, response) => {
        response.writeHead(200, { 'content-type': contentType });
        const oversized = 'x'.repeat(8 * 1024 * 1024 + 1);
        response.end(
          contentType === 'text/event-stream' ? `data: ${oversized}\n\n` : oversized
        );
      });
      const result = await runProxy({
        port,
        payload: {
          jsonrpc: '2.0',
          id: 20,
          method: 'tools/call',
          params: { name: 'query', arguments: { question: 'test' } },
        },
      });

      expect(result.code).toBe(0);
      expect(JSON.parse(result.stdout)).toMatchObject({
        id: 20,
        error: { code: -32000 },
      });
      expect(result.stderr).not.toContain('Traceback');
    },
    15_000
  );

  it('applies one absolute deadline to active and queued requests', async () => {
    const port = await listen(async (request, response) => {
      const chunks = [];
      for await (const chunk of request) chunks.push(chunk);
      const payload = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      if (payload.id === 21) {
        response.writeHead(200, { 'content-type': 'text/event-stream' });
        const interval = setInterval(() => response.write(': keepalive\n\n'), 50);
        response.on('close', () => clearInterval(interval));
        return;
      }
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(
        JSON.stringify({ jsonrpc: '2.0', id: payload.id, result: { ok: true } })
      );
    });
    const result = await runProxy({
      port,
      rawInput:
        '{"jsonrpc":"2.0","id":21,"method":"tools/list"}\n' +
        '{"jsonrpc":"2.0","id":22,"method":"tools/list"}\n',
      extraEnv: {
        GBRAIN_MCP_MAX_WORKERS: '1',
        GBRAIN_MCP_REQUEST_DEADLINE_SECONDS: '1',
      },
    });
    const responses = result.stdout
      .trim()
      .split('\n')
      .map(line => JSON.parse(line));

    expect(result.code).toBe(0);
    expect(responses).toContainEqual(
      expect.objectContaining({
        id: 21,
        error: expect.objectContaining({ code: -32000 }),
      })
    );
    expect(responses).toContainEqual(
      expect.objectContaining({
        id: 22,
        error: expect.objectContaining({
          message: 'shared gbrain HTTP exceeded total deadline',
        }),
      })
    );
  }, 10_000);

  it.each(['text/event-stream', 'application/json'])(
    'interrupts a silent %s read at the absolute request deadline',
    async contentType => {
      const port = await listen((_request, response) => {
        response.writeHead(200, { 'content-type': contentType });
        const interval = setInterval(() => {
          response.write(contentType === 'text/event-stream' ? ': late\n\n' : ' ');
        }, 750);
        response.on('close', () => clearInterval(interval));
      });
      const started = performance.now();
      const result = await runProxy({
        port,
        payload: { jsonrpc: '2.0', id: 23, method: 'tools/list' },
        extraEnv: { GBRAIN_MCP_REQUEST_DEADLINE_SECONDS: '1' },
      });

      expect(performance.now() - started).toBeLessThan(1600);
      expect(JSON.parse(result.stdout)).toMatchObject({
        id: 23,
        error: {
          code: -32000,
          message: 'shared gbrain HTTP exceeded total deadline',
        },
      });
    },
    5000
  );

  it('includes executor queue time in the absolute request deadline', async () => {
    const port = await listen(async (request, response) => {
      const chunks = [];
      for await (const chunk of request) chunks.push(chunk);
      const payload = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      response.writeHead(200, { 'content-type': 'text/event-stream' });
      const interval = setInterval(() => response.write(': occupied\n\n'), 100);
      response.on('close', () => clearInterval(interval));
      if (payload.id === 25) {
        setTimeout(() => {
          clearInterval(interval);
          response.end(
            'data: {"jsonrpc":"2.0","id":25,"result":{"ok":true}}\n\n'
          );
        }, 900);
      }
    });
    const started = performance.now();
    const result = await runProxy({
      port,
      rawInput:
        '{"jsonrpc":"2.0","id":25,"method":"tools/list"}\n' +
        '{"jsonrpc":"2.0","id":26,"method":"tools/list"}\n',
      extraEnv: {
        GBRAIN_MCP_MAX_WORKERS: '1',
        GBRAIN_MCP_REQUEST_DEADLINE_SECONDS: '1',
      },
    });
    const responses = result.stdout
      .trim()
      .split('\n')
      .map(line => JSON.parse(line));

    expect(performance.now() - started).toBeLessThan(1600);
    expect(responses).toContainEqual(
      expect.objectContaining({ id: 25, result: { ok: true } })
    );
    expect(responses).toContainEqual(
      expect.objectContaining({
        id: 26,
        error: expect.objectContaining({
          message: 'shared gbrain HTTP exceeded total deadline',
        }),
      })
    );
  }, 5000);

  it('survives malformed input before serving the next valid request', async () => {
    const port = await listen(async (request, response) => {
      const chunks = [];
      for await (const chunk of request) chunks.push(chunk);
      const payload = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(
        JSON.stringify({ jsonrpc: '2.0', id: payload.id, result: { ok: true } })
      );
    });
    const result = await runProxy({
      port,
      rawInput:
        '\n{bad-json}\n{"jsonrpc":"2.0","method":"notify"}\n' +
        '{"jsonrpc":"2.0","id":13,"method":"tools/list"}\n',
    });

    expect(result.code).toBe(0);
    expect(result.stderr).toContain('notification failed');
    const responses = result.stdout
      .trim()
      .split('\n')
      .map(line => JSON.parse(line));
    expect(responses.find(response => response.id === 13)).toMatchObject({
      id: 13,
      result: { ok: true },
    });
  });
});
