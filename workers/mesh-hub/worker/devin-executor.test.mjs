import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { devin, runtimeEnvironment } from './devin-executor.mjs';

test('existing Devin runs without permission/model overrides and returns actual output', async () => {
  const state = mkdtempSync(join(tmpdir(), 'devin-executor-'));
  const events = [];
  const config = {
    state,
    cwd: '/existing/trusted/workspace',
    binary: '/existing/devin',
    timeoutMs: 10000,
    log: (...args) => events.push(args),
  };
  try {
    const result = await devin(
      'quoted nonce abc',
      config,
      (binary, args, options) => {
        assert.equal(binary, config.binary);
        assert.equal(options.cwd, config.cwd);
        assert.deepEqual(args.slice(0, 2), ['--print', '--prompt-file']);
        assert.equal(readFileSync(args[2], 'utf8'), 'quoted nonce abc');
        assert.ok(!args.includes('--permission-mode'));
        assert.ok(!args.includes('--model'));
        assert.equal(options.env.MESH_HUB_TOKEN_DEVIN, undefined);
        const child = new EventEmitter();
        child.pid = 77;
        child.stdout = new EventEmitter();
        child.stderr = new EventEmitter();
        setImmediate(() => {
          child.stdout.emit(
            'data',
            Buffer.from('\x1b[32mDevin real reply abc\x1b[0m')
          );
          child.emit('close', 0);
        });
        return child;
      }
    );
    assert.deepEqual(result, { code: 0, text: 'Devin real reply abc' });
    assert.equal(events[1][1].outputChars, 20);
    assert.equal(events[1][1].outputSha256.length, 64);
  } finally {
    rmSync(state, { recursive: true, force: true });
  }
});

test('permission refusal is preserved without fabricating success or retrying', async () => {
  const state = mkdtempSync(join(tmpdir(), 'devin-executor-'));
  try {
    const result = await devin(
      'nonce',
      { state, cwd: state, binary: 'devin', timeoutMs: 10000, log() {} },
      () => {
        const child = new EventEmitter();
        child.pid = 78;
        child.stdout = new EventEmitter();
        child.stderr = new EventEmitter();
        setImmediate(() => {
          child.stderr.emit('data', Buffer.from('tool requires confirmation'));
          child.emit('close', 0);
        });
        return child;
      }
    );
    assert.deepEqual(result, { code: 1, text: '' });
  } finally {
    rmSync(state, { recursive: true, force: true });
  }
});

test('spawn failure and timeout end the runtime without widening permissions', async () => {
  for (const fail of ['error', 'timeout']) {
    const state = mkdtempSync(join(tmpdir(), 'devin-executor-'));
    try {
      const result = await devin(
        'nonce',
        {
          state,
          cwd: state,
          binary: 'devin',
          timeoutMs: fail === 'error' ? 10000 : 1,
          log() {},
        },
        () => {
          const child = new EventEmitter();
          child.pid = 79;
          child.stdout = new EventEmitter();
          child.stderr = new EventEmitter();
          child.kill = signal => {
            assert.equal(signal, 'SIGTERM');
            child.emit('close', 1);
          };
          if (fail === 'error')
            setImmediate(() => child.emit('error', Error('ENOENT')));
          return child;
        }
      );
      assert.equal(result.code, fail === 'error' ? -1 : 1);
      assert.equal(result.text, '');
    } finally {
      rmSync(state, { recursive: true, force: true });
    }
  }
});

test('provider runtimes do not receive mesh, administrative or unrelated provider secrets', () => {
  assert.deepEqual(
    runtimeEnvironment({
      HOME: '/home/test',
      PATH: '/bin',
      SSH_AUTH_SOCK: '/sock',
      MESH_HUB_ADMIN_TOKEN: 'hidden',
      MESH_TOKEN_DEVIN: 'hidden',
      HYPERAGENT_MCP_TOKEN: 'hidden',
      EXA_API_KEY: 'hidden',
      SUMMER_HUB_WEBHOOK_SECRET: 'hidden',
      DOPPLER_PROJECT: 'agent-mesh',
      DATABASE_URL: 'postgres://private',
      DB_PASSWORD: 'private',
      AUTHORIZATION: 'private',
      COOKIE: 'private',
      UNRECOGNIZED_CREDENTIAL: 'private',
    }),
    { HOME: '/home/test', PATH: '/bin', SSH_AUTH_SOCK: '/sock' }
  );
});
