import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { runCli } from './cli.js';
import { publishView } from './views-client.js';

const spec = JSON.stringify({
  schema: 'jovie.view.v1',
  title: 'T',
  blocks: [{ type: 'text', body: 'hi' }],
});
const ok = () =>
  Response.json({
    jsonrpc: '2.0',
    id: 1,
    result: {
      structuredContent: { id: 'v1', version: 1, url: 'https://jov.ie/v/abc' },
    },
  });
const env = { JOVIE_OVIE_TOKEN: 'tok-123' } as NodeJS.ProcessEnv;

describe('publishView', () => {
  it('posts a tools/call to the Ovie MCP endpoint with a bearer token', async () => {
    const fetchImpl = vi.fn(async (_u: string | URL, _i?: RequestInit) => ok());
    const result = await publishView(
      { spec, id: 'view-1', channel: 'cli' },
      { baseUrl: 'https://jov.ie', fetchImpl },
      env
    );
    expect(result.url).toBe('https://jov.ie/v/abc');
    const [url, init] = fetchImpl.mock.calls[0] ?? [];
    expect(String(url)).toBe('https://jov.ie/api/ovie/mcp');
    expect((init?.headers as Record<string, string>).Authorization).toBe(
      'Bearer tok-123'
    );
    const body = JSON.parse(String(init?.body));
    expect(body).toMatchObject({
      method: 'tools/call',
      params: { name: 'publish_view', arguments: { view_id: 'view-1' } },
    });
  });

  it('reads a spec from --file on the CLI only', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'view-'));
    const file = join(dir, 'v.json');
    await writeFile(file, spec);
    const fetchImpl = vi.fn(async () => ok());
    await expect(
      publishView({ file, channel: 'cli' }, { fetchImpl }, env)
    ).resolves.toMatchObject({ id: 'v1' });
    await expect(
      publishView({ file, channel: 'mcp' }, { fetchImpl }, env)
    ).rejects.toThrow('only supported by the CLI');
  });

  it.each([
    ['no token', {}, { spec }, 'JOVIE_OVIE_TOKEN'],
    ['no spec', env, {}, 'exactly one'],
    ['both', env, { spec, file: 'x' }, 'exactly one'],
    ['bad json', env, { spec: '[1]' }, 'JSON object'],
  ])('rejects %s before any request', async (_n, e, input, message) => {
    const fetchImpl = vi.fn(async () => ok());
    await expect(
      publishView(
        { channel: 'cli', ...input },
        { fetchImpl },
        e as NodeJS.ProcessEnv
      )
    ).rejects.toThrow(message);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('refuses plain http except on loopback', async () => {
    const fetchImpl = vi.fn(async () => ok());
    await expect(
      publishView(
        { spec, channel: 'cli' },
        { baseUrl: 'http://example.com', fetchImpl },
        env
      )
    ).rejects.toThrow('HTTPS');
    await expect(
      publishView(
        { spec, channel: 'cli' },
        { baseUrl: 'http://localhost:3000', fetchImpl },
        env
      )
    ).resolves.toMatchObject({ id: 'v1' });
  });

  it('surfaces a bounded server error without the token', async () => {
    const fetchImpl = vi.fn(async () =>
      Response.json({
        jsonrpc: '2.0',
        id: 1,
        error: { code: -32602, message: 'invalid view spec' },
      })
    );
    await expect(
      publishView({ spec, channel: 'cli' }, { fetchImpl }, env)
    ).rejects.toThrow('invalid view spec');
  });
});

describe('jovie view publish', () => {
  it('prints the url', async () => {
    const out: string[] = [];
    vi.stubEnv('JOVIE_OVIE_TOKEN', 'tok-123');
    const code = await runCli(['view', 'publish', '--spec', spec], {
      fetchImpl: vi.fn(async () => ok()),
      stdout: { write: (c: string) => out.push(c) } as never,
      stderr: { write: () => true } as never,
    });
    vi.unstubAllEnvs();
    expect(code).toBe(0);
    expect(out.join('')).toContain('https://jov.ie/v/abc');
  });
});
