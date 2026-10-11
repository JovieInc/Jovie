import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  type CodexExecResult,
  createCodexImageAdapter,
  pngSize,
  resolveCodexBinary,
} from './codex-image-adapter';

const request = {
  prompt: 'founders: cta-1',
  recipeId: 'soft-editorial-background' as never,
  characterId: null,
  width: 1600,
  height: 1000,
  brief: 'one quiet focal gradient',
};

/** A minimal PNG header: signature, IHDR length/type, width, height. */
function png(width: number, height: number): Uint8Array {
  const bytes = new Uint8Array(33);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13]);
  bytes.set([0x49, 0x48, 0x44, 0x52], 12);
  const view = new DataView(bytes.buffer);
  view.setUint32(16, width);
  view.setUint32(20, height);
  return bytes;
}

let home: string;
beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), 'codex-home-'));
});
afterEach(() => {
  rmSync(home, { recursive: true, force: true });
});

/** A fake `codex exec` that saves one PNG under the thread, like Codex does. */
function fakeExec(
  calls: { args: readonly string[]; env: NodeJS.ProcessEnv }[]
) {
  return async (
    _binary: string,
    args: readonly string[],
    env: NodeJS.ProcessEnv
  ): Promise<CodexExecResult> => {
    calls.push({ args, env });
    const thread = `thread-${calls.length}`;
    mkdirSync(join(home, 'generated_images', thread), { recursive: true });
    writeFileSync(
      join(home, 'generated_images', thread, 'exec-1.png'),
      png(1586, 992)
    );
    return {
      code: 0,
      stdout: `noise\n${JSON.stringify({ type: 'thread.started', thread_id: thread })}\n`,
    };
  };
}

const chatgpt = () => 'Logged in using ChatGPT\n';

describe('createCodexImageAdapter', () => {
  it('generates through codex exec on the subscription with no API key in the env', async () => {
    const calls: { args: readonly string[]; env: NodeJS.ProcessEnv }[] = [];
    process.env.OPENAI_API_KEY = 'sk-should-not-leak';
    try {
      const adapter = createCodexImageAdapter({
        binary: '/bin/codex',
        codexHome: home,
        loginStatus: chatgpt,
        exec: fakeExec(calls),
      });
      const outcome = await adapter.generate(request);

      expect(outcome).toMatchObject({
        status: 'generated',
        provider: 'codex-subscription',
        mime: 'image/png',
        width: 1586,
        height: 992,
      });
      expect(adapter.family).toBe('openai');
      expect(calls[0]?.env.OPENAI_API_KEY).toBeUndefined();
      expect(calls[0]?.args).toEqual(
        expect.arrayContaining(['exec', '--json', '--sandbox', 'read-only'])
      );
      expect(calls[0]?.args.at(-1)).toMatch(/built-in image_gen tool/);
      expect(calls[0]?.args.at(-1)).toMatch(/one quiet focal gradient/);
    } finally {
      delete process.env.OPENAI_API_KEY;
    }
  });

  it('fails closed when the CLI is not on a ChatGPT login, without running it', async () => {
    const calls: { args: readonly string[]; env: NodeJS.ProcessEnv }[] = [];
    for (const status of ['Not logged in', 'Logged in using an API key']) {
      const adapter = createCodexImageAdapter({
        binary: '/bin/codex',
        codexHome: home,
        loginStatus: () => status,
        exec: fakeExec(calls),
      });
      await expect(adapter.generate(request)).resolves.toMatchObject({
        status: 'credentials-unavailable',
      });
    }
    expect(calls).toHaveLength(0);

    await expect(
      createCodexImageAdapter({ binary: null }).generate(request)
    ).resolves.toMatchObject({ status: 'credentials-unavailable' });
  });

  it('stops at the per-run cap', async () => {
    const calls: { args: readonly string[]; env: NodeJS.ProcessEnv }[] = [];
    const adapter = createCodexImageAdapter({
      binary: '/bin/codex',
      codexHome: home,
      cap: 2,
      loginStatus: chatgpt,
      exec: fakeExec(calls),
    });
    await adapter.generate(request);
    await adapter.generate(request);

    await expect(adapter.generate(request)).resolves.toMatchObject({
      status: 'failed',
      reason: 'per-run image cap of 2 reached',
    });
    expect(calls).toHaveLength(2);
  });

  it('fails when the run saved no image or exited non-zero', async () => {
    const empty = createCodexImageAdapter({
      binary: '/bin/codex',
      codexHome: home,
      loginStatus: chatgpt,
      exec: async () => ({
        code: 0,
        stdout: JSON.stringify({ type: 'thread.started', thread_id: 'x' }),
      }),
    });
    await expect(empty.generate(request)).resolves.toMatchObject({
      status: 'failed',
      reason: 'codex thread x saved no image',
    });

    const crashed = createCodexImageAdapter({
      binary: '/bin/codex',
      codexHome: home,
      loginStatus: chatgpt,
      exec: async () => ({ code: 1, stdout: '' }),
    });
    await expect(crashed.generate(request)).resolves.toMatchObject({
      status: 'failed',
    });
  });
});

describe('codex adapter helpers', () => {
  it('reads PNG dimensions and rejects other bytes', () => {
    expect(pngSize(png(10, 20))).toEqual({ width: 10, height: 20 });
    expect(pngSize(new Uint8Array([1, 2, 3]))).toBeNull();
  });

  it('prefers JOVIE_CODEX_BIN, then the app bundles', () => {
    expect(resolveCodexBinary({ JOVIE_CODEX_BIN: '/x/codex' })).toBe(
      '/x/codex'
    );
    expect(resolveCodexBinary({}, () => false)).toBeNull();
    expect(
      resolveCodexBinary({}, path => path.includes('ChatGPT.app'))
    ).toMatch(/ChatGPT\.app/);
  });
});
