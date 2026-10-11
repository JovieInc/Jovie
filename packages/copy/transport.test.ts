import { chmodSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from 'vitest';

// Fake subscription CLIs: `claude` echoes stdin, `codex` writes its `-o` file.
const bin = mkdtempSync(join(tmpdir(), 'copy-transport-bin-'));
const originalPath = process.env.PATH;
const originalCodex = process.env.CODEX_BIN;

beforeAll(() => {
  writeFileSync(
    join(bin, 'claude'),
    '#!/bin/sh\nif [ "$1" = "--version" ]; then echo 1; exit 0; fi\necho "claude:$(cat | head -c 20)"\n'
  );
  writeFileSync(
    join(bin, 'codex'),
    '#!/bin/sh\nif [ "$1" = "--version" ]; then echo 1; exit 0; fi\nwhile [ $# -gt 0 ]; do if [ "$1" = "-o" ]; then out="$2"; fi; shift; done\ncat > /dev/null\necho codex-reply > "$out"\n'
  );
  chmodSync(join(bin, 'claude'), 0o755);
  chmodSync(join(bin, 'codex'), 0o755);
  process.env.PATH = `${bin}:${originalPath ?? ''}`;
  process.env.CODEX_BIN = join(bin, 'codex');
});

afterAll(() => {
  process.env.PATH = originalPath;
  if (originalCodex === undefined) delete process.env.CODEX_BIN;
  else process.env.CODEX_BIN = originalCodex;
  rmSync(bin, { recursive: true, force: true });
});

const request = (model: string) => ({
  model,
  system: 'judge',
  prompt: 'copy',
});

describe('routedTransport', () => {
  afterEach(() => vi.unstubAllGlobals());
  it('routes anthropic/* to the Claude CLI and openai/* to the Codex CLI', async () => {
    vi.resetModules();
    const { routedTransport } = await import('./transport');
    const send = routedTransport();
    expect(send.available?.('anthropic/claude-opus-5.5')).toBe(true);
    expect(send.available?.('openai/gpt-5.6-sol')).toBe(true);
    expect(await send(request('anthropic/claude-opus-5.5'))).toMatch(
      /^claude:judge/
    );
    expect((await send(request('openai/gpt-5.6-sol'))).trim()).toBe(
      'codex-reply'
    );
  });

  it('needs a gateway key for zai/* and reports it unavailable without one', async () => {
    const { routedTransport } = await import('./transport');
    const send = routedTransport();
    expect(send.available?.('zai/glm-5.3')).toBe(false);
    await expect(send(request('zai/glm-5.3'))).rejects.toThrow(
      'AI_GATEWAY_API_KEY missing'
    );
    expect(routedTransport('test-key').available?.('zai/glm-5.3')).toBe(true);
  });

  it('forwards Gateway policy without applying it to subscription CLIs', async () => {
    const fetch = vi.fn(
      async (_url: string, _options: RequestInit) =>
        new Response(
          JSON.stringify({
            choices: [{ message: { content: 'gateway-reply' } }],
          })
        )
    );
    vi.stubGlobal('fetch', fetch);
    const authorize = vi.fn(async () => ({ maxTokens: 256, provider: 'zai' }));
    const { routedTransport } = await import('./transport');
    const send = routedTransport('test-key', {
      allowed: model => model === 'zai/glm-5.3',
      authorize,
    });
    expect(send.available?.('zai/unknown')).toBe(false);
    expect((await send(request('openai/gpt-5.6-sol'))).trim()).toBe(
      'codex-reply'
    );
    expect(authorize).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
    await expect(send(request('zai/unknown'))).rejects.toThrow(/not allowed/);
    expect(fetch).not.toHaveBeenCalled();
    await expect(send(request('zai/glm-5.3'))).resolves.toBe('gateway-reply');
    expect(authorize).toHaveBeenCalledWith(request('zai/glm-5.3'));
    expect(fetch).toHaveBeenCalledTimes(1);
    const body = JSON.parse(fetch.mock.calls[0]![1].body as string);
    expect(body).toMatchObject({
      max_tokens: 256,
      providerOptions: { gateway: { only: ['zai'] } },
    });
  });

  it('surfaces a failing CLI as an error, never an empty verdict', async () => {
    writeFileSync(
      join(bin, 'claude'),
      '#!/bin/sh\nif [ "$1" = "--version" ]; then exit 0; fi\necho nope >&2\nexit 3\n'
    );
    const { routedTransport } = await import('./transport');
    await expect(
      routedTransport()(request('anthropic/claude-opus-5.5'))
    ).rejects.toThrow(/exited 3: nope/);
  });
});
