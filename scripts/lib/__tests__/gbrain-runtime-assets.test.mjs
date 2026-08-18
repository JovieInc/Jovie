import { spawn } from 'node:child_process';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
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

async function runProxy({ port, token = 'test-only-token', payload }) {
  const dir = await mkdtemp(join(tmpdir(), 'gbrain-proxy-'));
  const tokenFile = join(dir, 'token');
  await writeFile(tokenFile, token, { mode: 0o600 });
  return new Promise((resolveRun, rejectRun) => {
    const child = spawn('python3', [proxyPath], {
      env: {
        ...process.env,
        GBRAIN_MCP_URL: `http://127.0.0.1:${port}/mcp`,
        GBRAIN_MCP_TOKEN_FILE: tokenFile,
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
    child.on('error', rejectRun);
    child.on('close', code => resolveRun({ code, stdout, stderr }));
    child.stdin.end(`${JSON.stringify(payload)}\n`);
  });
}

async function runWrapper(env, unset = []) {
  const childEnv = { ...process.env, ...env };
  for (const key of unset) delete childEnv[key];
  return new Promise((resolveRun, rejectRun) => {
    const child = spawn('bash', [wrapperPath], {
      env: childEnv,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', chunk => {
      stdout += chunk;
    });
    child.stderr.on('data', chunk => {
      stderr += chunk;
    });
    child.on('error', rejectRun);
    child.on('close', code => resolveRun({ code, stdout, stderr }));
  });
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
    expect(wrapper).not.toMatch(/\/Users\/[A-Za-z0-9._-]+/);
    expect(assets).not.toMatch(/postgres(?:ql)?:\/\//i);
    expect(assets).not.toMatch(/Bearer\s+[A-Za-z0-9._-]{12,}/);
    expect(assets).not.toContain('/ready');
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

  it('supports concurrent MCP clients through one shared HTTP endpoint', async () => {
    let active = 0;
    let maxActive = 0;
    const port = await listen(async (request, response) => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      const chunks = [];
      for await (const chunk of request) chunks.push(chunk);
      const payload = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      await new Promise(resolveDelay => setTimeout(resolveDelay, 25));
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
  });

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
});
