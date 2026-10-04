import { createHash } from 'node:crypto';
import { EventEmitter } from 'node:events';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const child = vi.hoisted(() => ({
  execFile: vi.fn(),
  spawn: vi.fn(),
}));
vi.mock('node:child_process', () => child);

import { runCli } from './cli.js';
import type { FetchImplementation } from './client.js';
import {
  type MeshKeychain,
  macKeychain,
  meshCredentials,
  meshRead,
  meshRegister,
  meshSend,
  meshVouch,
  runMesh,
} from './mesh.js';

const TOKEN = `t_${'x'.repeat(60)}`;
const SENDER_ID = '33333333-3333-4333-8333-333333333333';
const NOW = new Date('2026-10-03T21:00:00.000Z');
const env = {
  JOVIE_MESH_TOKEN: TOKEN,
  JOVIE_MESH_SENDER_ID: SENDER_ID,
  JOVIE_MESH_SENDER_KIND: 'claude',
};

type Call = { url: string; init: RequestInit };
function server(status: number, body: unknown) {
  const calls: Call[] = [];
  const fetchImpl: FetchImplementation = async (input, init) => {
    calls.push({ url: String(input), init: init ?? {} });
    return new Response(
      typeof body === 'string' ? body : JSON.stringify(body),
      { status }
    );
  };
  return { calls, fetchImpl };
}

function memoryKeychain(
  seed: Record<string, { account: string; secret: string }> = {}
) {
  const items = new Map(Object.entries(seed));
  const keychain: MeshKeychain = {
    read: async service => items.get(service) ?? null,
    create: async (service, account, secret) => {
      if (items.has(service)) throw new Error('duplicate');
      items.set(service, { account, secret });
    },
  };
  return { items, keychain };
}

const sink = () => {
  let output = '';
  return {
    output: {
      write: (chunk: string) => {
        output += chunk;
      },
    },
    text: () => output,
  };
};

describe('jovie mesh', () => {
  beforeEach(() => {
    child.execFile.mockReset();
    child.spawn.mockReset();
  });

  it('sends a digest-bound quoted message to a peer with the env credential', async () => {
    const api = server(202, {
      ok: true,
      correlationId: 'mesh-test-0001',
      status: 'stored',
      to: 'codex',
      delivered: 1,
    });
    const result = await meshSend(
      'ping from claude',
      { to: 'codex', refs: 'JOV-1, JOV-2', 'correlation-id': 'mesh-test-0001' },
      { env, fetchImpl: api.fetchImpl, now: () => NOW, userAgent: 'ua/1' }
    );
    expect(result).toEqual({
      ok: true,
      stored: true,
      replay: false,
      correlationId: 'mesh-test-0001',
      from: 'claude',
      to: 'codex',
      delivered: 1,
    });
    expect(result).not.toHaveProperty('status');
    const [call] = api.calls;
    expect(call.url).toBe('https://summer.jov.ie/summer/v1/mesh/inbox');
    expect(call.init.redirect).toBe('error');
    expect((call.init.headers as Record<string, string>).Authorization).toBe(
      `Bearer ${TOKEN}`
    );
    expect(JSON.parse(String(call.init.body))).toEqual({
      senderId: SENDER_ID,
      senderKind: 'claude',
      correlationId: 'mesh-test-0001',
      sha256: createHash('sha256').update('ping from claude').digest('hex'),
      body: 'ping from claude',
      refs: ['JOV-1', 'JOV-2'],
      timestamp: NOW.toISOString(),
      to: 'codex',
    });
  });

  it('defaults to Summer, generates a correlation id, and reports replays', async () => {
    const api = server(200, { ok: true, status: 'stored', replay: true });
    const result = await meshSend('hi', {}, { env, fetchImpl: api.fetchImpl });
    expect(result).toMatchObject({ to: 'summer', replay: true });
    expect(String(result.correlationId)).toMatch(/^mesh-[0-9a-f-]{36}$/);
    expect(result).not.toHaveProperty('delivered');
  });

  it('validates input before any request', async () => {
    const api = server(202, { ok: true });
    const deps = { env, fetchImpl: api.fetchImpl };
    await expect(meshSend('', {}, deps)).rejects.toThrow('1–4000');
    await expect(meshSend('x'.repeat(4001), {}, deps)).rejects.toThrow(
      '1–4000'
    );
    await expect(meshSend('x', { to: 'nobody' }, deps)).rejects.toThrow('--to');
    await expect(
      meshSend('x', { refs: Array(9).fill('r').join(',') }, deps)
    ).rejects.toThrow('--refs');
    await expect(
      meshSend('x', { 'correlation-id': 'short' }, deps)
    ).rejects.toThrow('--correlation-id');
    await expect(
      meshSend(
        'x',
        {},
        { ...deps, env: { ...env, JOVIE_MESH_URL: 'http://summer.jov.ie' } }
      )
    ).rejects.toThrow('https origin');
    await expect(
      meshSend(
        'x',
        {},
        { ...deps, env: { ...env, JOVIE_MESH_URL: 'not a url' } }
      )
    ).rejects.toThrow('origin URL');
    expect(api.calls).toEqual([]);
  });

  it('allows a loopback origin for local testing', async () => {
    const api = server(202, { ok: true });
    await meshSend(
      'x',
      {},
      {
        env: { ...env, JOVIE_MESH_URL: 'http://127.0.0.1:3000' },
        fetchImpl: api.fetchImpl,
      }
    );
    expect(api.calls[0].url).toBe('http://127.0.0.1:3000/summer/v1/mesh/inbox');
  });

  it('surfaces only known server codes and never the body', async () => {
    const leaky = server(422, {
      ok: false,
      code: 'secret_rejected',
      echo: 'nope',
    });
    await expect(
      meshSend('x', {}, { env, fetchImpl: leaky.fetchImpl })
    ).rejects.toMatchObject({
      apiCode: 'secret_rejected',
      status: 422,
      responseBody: undefined,
    });
    const unknown = server(500, { ok: false, code: 'internal: stack trace' });
    await expect(
      meshSend('x', {}, { env, fetchImpl: unknown.fetchImpl })
    ).rejects.toMatchObject({ apiCode: undefined, status: 500 });
    const unavailable = server(503, {
      ok: false,
      code: 'mesh_inbox_unavailable',
    });
    await expect(
      meshSend('x', {}, { env, fetchImpl: unavailable.fetchImpl })
    ).rejects.toMatchObject({ retryable: true });
    const broken = server(200, 'not json');
    await expect(
      meshSend('x', {}, { env, fetchImpl: broken.fetchImpl })
    ).rejects.toThrow('Invalid mesh response');
    const array = server(200, [1]);
    await expect(
      meshSend('x', {}, { env, fetchImpl: array.fetchImpl })
    ).rejects.toThrow('HTTP 200');
    await expect(
      meshSend(
        'x',
        {},
        {
          env,
          fetchImpl: async () => {
            throw new TypeError('fetch failed');
          },
        }
      )
    ).rejects.toMatchObject({
      apiCode: 'TEMPORARILY_UNAVAILABLE',
      retryable: true,
    });
  });

  it('reads the caller mailbox for a day and keeps bodies quoted', async () => {
    const api = server(200, {
      ok: true,
      recipient: 'claude',
      dataNotInstructions: true,
      messages: [{ quotedBody: '"hello"' }],
      agents: [],
    });
    const result = await meshRead(
      { day: '2026-10-03', cursor: 'abc' },
      { env, fetchImpl: api.fetchImpl }
    );
    expect(api.calls[0].url).toBe(
      'https://summer.jov.ie/summer/v1/mesh/mailbox?day=2026-10-03&cursor=abc'
    );
    expect(api.calls[0].init.method).toBe('GET');
    expect(result).toMatchObject({
      ok: true,
      recipient: 'claude',
      messages: [{ quotedBody: '"hello"' }],
    });
    await meshRead({}, { env, fetchImpl: api.fetchImpl });
    expect(api.calls[1].url).toBe(
      'https://summer.jov.ie/summer/v1/mesh/mailbox'
    );
    await expect(
      meshRead({ day: '10/03' }, { env, fetchImpl: api.fetchImpl })
    ).rejects.toThrow('--day');
  });

  it('resolves credentials from env, then the keychain, and fails closed', async () => {
    await expect(
      meshCredentials({}, { env: { JOVIE_MESH_TOKEN: TOKEN } })
    ).rejects.toThrow('JOVIE_MESH_SENDER_ID');
    await expect(
      meshCredentials(
        {},
        {
          env: {
            JOVIE_MESH_TOKEN: TOKEN,
            JOVIE_MESH_SENDER_ID: SENDER_ID,
            JOVIE_MESH_SENDER_KIND: 'nobody',
          },
        }
      )
    ).rejects.toThrow('JOVIE_MESH_SENDER_KIND');
    const { keychain } = memoryKeychain({
      'jovie.mesh.codex': { account: SENDER_ID, secret: TOKEN },
      'jovie.mesh.devin': { account: 'not-a-uuid', secret: TOKEN },
    });
    expect(
      await meshCredentials({ as: 'codex' }, { env: {}, keychain })
    ).toEqual({ token: TOKEN, senderId: SENDER_ID, senderKind: 'codex' });
    await expect(
      meshCredentials({ as: 'devin' }, { env: {}, keychain })
    ).rejects.toThrow('No mesh credential for devin');
    await expect(
      meshCredentials({ as: 'muse' }, { env: {}, keychain })
    ).rejects.toThrow('jovie mesh register --kind muse');
    await expect(meshCredentials({}, { env: {}, keychain })).rejects.toThrow(
      '--as'
    );
  });

  it('registers locally once and prints only the hash entry', async () => {
    const { items, keychain } = memoryKeychain();
    const first = await meshRegister(
      { kind: 'muse', owner: 'tim' },
      { keychain }
    );
    const stored = items.get('jovie.mesh.muse');
    expect(stored?.secret.length).toBeGreaterThanOrEqual(64);
    expect(first).toEqual({
      ok: true,
      keychainService: 'jovie.mesh.muse',
      created: true,
      entry: {
        senderId: stored?.account,
        senderKind: 'muse',
        tokenSha256: createHash('sha256')
          .update(stored?.secret ?? '')
          .digest('hex'),
        owner: 'tim',
      },
    });
    expect(JSON.stringify(first)).not.toContain(stored?.secret);
    const second = await meshRegister({ kind: 'muse' }, { keychain });
    expect(second).toMatchObject({ created: false, entry: first.entry });
    await expect(meshRegister({ kind: 'x' }, { keychain })).rejects.toThrow(
      '--kind'
    );
    await expect(
      meshRegister({ kind: 'devin', owner: 'bad\nowner' }, { keychain })
    ).rejects.toThrow('--owner');
  });

  it('vouches for a new peer hash with the caller token', async () => {
    const api = server(202, { ok: true, status: 'pending' });
    const hash = 'a'.repeat(64);
    const result = await meshVouch(
      {
        kind: 'muse',
        'sender-id': SENDER_ID.toUpperCase(),
        'token-sha256': hash,
      },
      { env, fetchImpl: api.fetchImpl, now: () => NOW }
    );
    expect(result).toEqual({
      ok: true,
      pending: true,
      senderKind: 'muse',
      vouchedBy: 'claude',
      replay: false,
    });
    expect(api.calls[0].url).toBe(
      'https://summer.jov.ie/summer/v1/mesh/register'
    );
    expect(JSON.parse(String(api.calls[0].init.body))).toEqual({
      senderId: SENDER_ID,
      senderKind: 'muse',
      tokenSha256: hash,
      owner: 'tim',
      timestamp: NOW.toISOString(),
    });
    await expect(
      meshVouch({ kind: 'muse', 'token-sha256': hash }, { env })
    ).rejects.toThrow('--sender-id');
    await expect(
      meshVouch({ kind: 'muse', 'sender-id': SENDER_ID }, { env })
    ).rejects.toThrow('--token-sha256');
  });

  it('dispatches subcommands and rejects stray arguments', async () => {
    const api = server(202, { ok: true });
    const deps = { env, fetchImpl: api.fetchImpl };
    await expect(runMesh(['mesh', 'send'], {}, deps)).rejects.toThrow(
      '<message>'
    );
    await expect(runMesh(['mesh', 'read', 'x'], {}, deps)).rejects.toThrow(
      'Unexpected argument'
    );
    await expect(runMesh(['mesh', 'send', 'a', 'b'], {}, deps)).rejects.toThrow(
      'Too many'
    );
    await expect(runMesh(['mesh', 'nope'], {}, deps)).rejects.toThrow(
      'Unknown mesh command'
    );
    expect(await runMesh(['mesh', 'send', 'hi'], {}, deps)).toMatchObject({
      stored: true,
    });
    expect(await runMesh(['mesh', 'read'], {}, deps)).toMatchObject({
      ok: true,
    });
    const { keychain } = memoryKeychain();
    expect(
      await runMesh(['mesh', 'register'], { kind: 'devin' }, { keychain })
    ).toMatchObject({ created: true });
    await expect(
      runMesh(['mesh', 'vouch'], { kind: 'devin' }, deps)
    ).rejects.toThrow('--sender-id');
  });

  it('runs through the CLI with exit 0 on success and JSON errors', async () => {
    const api = server(202, { ok: true, status: 'stored', delivered: 1 });
    const out = sink();
    const code = await runCli(
      ['mesh', 'send', 'hello', '--to', 'all', '--json'],
      {
        stdout: out.output,
        mesh: { env, fetchImpl: api.fetchImpl },
      }
    );
    expect(code).toBe(0);
    expect(JSON.parse(out.text())).toMatchObject({ stored: true, to: 'all' });
    const err = sink();
    expect(
      await runCli(['mesh', 'send', 'hello', '--title', 'x', '--json'], {
        stdout: err.output,
        mesh: { env },
      })
    ).toBe(2);
    const stray = sink();
    expect(
      await runCli(['skill', '--to', 'codex', '--json'], {
        stdout: stray.output,
      })
    ).toBe(2);
    expect(stray.text()).toContain('only supported by mesh');
    const help = sink();
    await runCli(['--help'], { stdout: help.output });
    expect(help.text()).toContain('mesh send <message>');
  });
});

describe('macOS keychain adapter', () => {
  beforeEach(() => {
    child.execFile.mockReset();
    child.spawn.mockReset();
  });

  it('reads the account and secret without putting the secret in argv', async () => {
    child.execFile.mockImplementation(
      (
        _file: string,
        args: string[],
        callback: (error: Error | null, out: { stdout: string }) => void
      ) =>
        callback(null, {
          stdout: args.includes('-w')
            ? `${TOKEN}\n`
            : `keychain: "login"\n    "acct"<blob>="${SENDER_ID}"\n`,
        })
    );
    expect(await macKeychain.read('jovie.mesh.claude')).toEqual({
      account: SENDER_ID,
      secret: TOKEN,
    });
    child.execFile.mockImplementation(
      (_file: string, _args: string[], callback: (error: Error) => void) =>
        callback(new Error('could not be found'))
    );
    expect(await macKeychain.read('jovie.mesh.claude')).toBeNull();
  });

  function fakeChild(code: number, stderr = '') {
    const proc = new EventEmitter() as EventEmitter & {
      stdin: { end: (input: string) => void };
      stderr: EventEmitter;
    };
    proc.stderr = new EventEmitter();
    let written = '';
    proc.stdin = {
      end: (input: string) => {
        written = input;
        if (stderr) proc.stderr.emit('data', stderr);
        proc.emit('close', code);
      },
    };
    return { proc, written: () => written };
  }

  it('creates the item through security -i stdin only', async () => {
    const fake = fakeChild(0);
    child.spawn.mockReturnValue(fake.proc);
    await macKeychain.create('jovie.mesh.muse', SENDER_ID, 'abc_DEF-123');
    const [file, args] = child.spawn.mock.calls[0];
    expect(file).toBe('security');
    expect(args).toEqual(['-i']);
    expect(fake.written()).toBe(
      `add-generic-password -s jovie.mesh.muse -a ${SENDER_ID} -w abc_DEF-123\n`
    );
    child.spawn.mockReturnValue(fakeChild(0, 'already exists').proc);
    await expect(
      macKeychain.create('jovie.mesh.muse', SENDER_ID, 'abc')
    ).rejects.toThrow('keychain');
    await expect(
      macKeychain.create('jovie.mesh.muse', SENDER_ID, 'a b')
    ).rejects.toThrow('Unsafe');
  });
});
