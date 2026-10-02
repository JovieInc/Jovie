import { execFile } from 'node:child_process';
import { createServer, type Server } from 'node:http';
import type { Socket } from 'node:net';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { afterEach, describe, expect, it } from 'vitest';

const execFileAsync = promisify(execFile);
const cli = fileURLToPath(new URL('./cli.ts', import.meta.url));
const servers: Server[] = [];
const sockets = new Set<Socket>();

async function listen(server: Server): Promise<string> {
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

function proxyEnvironment(proxy: string, noProxy = ''): NodeJS.ProcessEnv {
  return {
    ...process.env,
    HTTP_PROXY: proxy,
    HTTPS_PROXY: proxy,
    http_proxy: '',
    https_proxy: '',
    NO_PROXY: noProxy,
    no_proxy: '',
    NODE_USE_ENV_PROXY: '0',
  };
}

function run(args: string[], env: NodeJS.ProcessEnv, input?: string) {
  const child = execFileAsync(
    process.execPath,
    ['--import', 'tsx', cli, ...args],
    {
      env,
      timeout: 4_000,
    }
  );
  child.child.stdin?.end(input);
  return child;
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

describe('standalone CLI proxy support', () => {
  it.each(['cli', 'mcp', 'lowercase'])(
    'routes %s requests through the configured proxy',
    async mode => {
      const requests: string[] = [];
      const proxy = createServer();
      proxy.on('connect', (request, socket) => {
        requests.push(request.url ?? '');
        socket.write('HTTP/1.1 200 Connection Established\r\n\r\n');
        socket.once('data', data => {
          requests.push(data.toString().split('\r\n')[0]);
          const body = '{"openapi":"3.1.0"}';
          socket.end(
            `HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: ${Buffer.byteLength(body)}\r\nConnection: close\r\n\r\n${body}`
          );
        });
      });
      const env = proxyEnvironment(await listen(proxy));
      if (mode === 'lowercase') {
        env.http_proxy = env.HTTP_PROXY;
        env.HTTP_PROXY = 'http://127.0.0.1:1';
      }
      const args = mode === 'mcp' ? ['mcp'] : ['api', 'openapi', '--json'];
      const input =
        mode === 'mcp'
          ? `${JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'get_openapi', arguments: {} } })}\n`
          : undefined;
      const { stdout, stderr } = await run(
        [...args, '--base-url', 'http://jovie.invalid'],
        env,
        input
      );
      expect(stderr).toBe('');
      const result = JSON.parse(stdout);
      expect(
        mode === 'mcp' ? JSON.parse(result.result.content[0].text) : result
      ).toEqual({ openapi: '3.1.0' });
      expect(requests).toEqual([
        'jovie.invalid:80',
        'GET /api/v1/openapi.json HTTP/1.1',
      ]);
    }
  );

  it('honors NO_PROXY for local deployments', async () => {
    const origin = await listen(
      createServer((_request, response) => {
        response.setHeader('Content-Type', 'application/json');
        response.end('{"openapi":"3.1.0"}');
      })
    );
    const { stdout, stderr } = await run(
      ['api', 'openapi', '--base-url', origin, '--json'],
      proxyEnvironment('http://127.0.0.1:1', '127.0.0.1')
    );
    expect(stderr).toBe('');
    expect(JSON.parse(stdout)).toEqual({ openapi: '3.1.0' });
  });

  it.each([
    { args: ['docs', 'llms'], exit: 2 },
    { args: ['fleet', 'status'], exit: 3 },
    { args: ['--base-url', 'fleet', 'artist', 'get'], exit: 2 },
  ])(
    'reports invalid proxy configuration safely with exit $exit: $args',
    async ({ args, exit }) => {
      const result = await run(
        [...args, '--json'],
        proxyEnvironment('http://user:private-value@[invalid')
      ).catch(error => error);
      expect(result.code).toBe(exit);
      expect(result.stderr).toBe('');
      expect(JSON.parse(result.stdout)).toEqual({
        error: {
          code: 'INVALID_INPUT',
          message:
            'Invalid proxy configuration. Check HTTP_PROXY and HTTPS_PROXY.',
        },
      });
      expect(result.stdout).not.toContain('private-value');
    }
  );
});
