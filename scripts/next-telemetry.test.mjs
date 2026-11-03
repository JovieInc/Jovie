import assert from 'node:assert/strict';
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';

const webRequire = createRequire(
  new URL('../apps/web/package.json', import.meta.url)
);
const storageFile = webRequire.resolve('next/dist/telemetry/storage');
const source = readFileSync(storageFile, 'utf8');
const event = {
  eventName: 'NEXT_CLI_SESSION_STOPPED',
  payload: { cliCommand: 'dev' },
};

// Execute the installed module, including its real deferred queue and flush.
// Only environment/configuration and outbound boundaries are owned fixtures.
/**
 * @param {import('node:test').TestContext} t
 * @param {{disabled?: string, configured?: boolean, debug?: string}} [options]
 */
function fixture(t, { disabled, configured = true, debug } = {}) {
  const dir = mkdtempSync(path.join(tmpdir(), 'next-telemetry-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const calls = [];
  const nativeRequire = createRequire(import.meta.url);
  /** @type {{exports: Record<string, any>}} */
  const module = { exports: {} };
  const mocks = {
    '../lib/picocolors': {},
    'next/dist/compiled/conf': class {
      get(key, fallback) {
        return key === 'telemetry.enabled' ? configured : fallback;
      }
    },
    'next/dist/compiled/is-docker': () => true,
    '../server/ci-info': { isCI: true },
    './anonymous-meta': {
      getAnonymousMeta() {
        throw new Error('unexpected metadata request');
      },
    },
    './project-id': {
      getRawProjectId() {
        throw new Error('unexpected project lookup');
      },
    },
    './post-telemetry-payload': {
      postNextTelemetryPayload() {
        throw new Error('network forbidden');
      },
    },
    'next/dist/compiled/@edge-runtime/ponyfill': { AbortController },
    child_process: {
      spawn(...args) {
        calls.push({ method: 'spawn', args });
      },
      spawnSync(...args) {
        calls.push({ method: 'spawnSync', args });
      },
    },
  };
  const require = id => {
    if (Object.hasOwn(mocks, id)) return mocks[id];
    assert.ok(
      ['crypto', 'path', 'fs'].includes(id),
      `unexpected import: ${id}`
    );
    return nativeRequire(id);
  };
  require.resolve = id => {
    assert.equal(id, './detached-flush');
    return path.join(path.dirname(storageFile), 'detached-flush.js');
  };
  new vm.Script(source, { filename: storageFile }).runInNewContext(
    {
      module,
      exports: module.exports,
      require,
      process: {
        env: { NEXT_TELEMETRY_DISABLED: disabled, NEXT_TELEMETRY_DEBUG: debug },
        pid: process.pid,
        execPath: process.execPath,
      },
      console,
      setTimeout,
      clearTimeout,
    },
    { timeout: 1000 }
  );
  const telemetry = new module.exports.Telemetry({
    distDir: dir,
    skipNotify: true,
  });
  return {
    telemetry,
    calls,
    dir,
    files: () =>
      readdirSync(dir, { recursive: true }).filter(file =>
        file.endsWith('.json')
      ),
  };
}

/** @type {Array<[string, {disabled?: string, configured?: boolean, debug?: string}]>} */
const disabledCases = [
  ['environment', { disabled: '1' }],
  ['persisted configuration', { configured: false }],
  ['debug mode', { disabled: '1', debug: '1' }],
];
for (const [name, options] of disabledCases) {
  test(`disabled ${name} prevents deferred shutdown files and children`, {
    timeout: 3000,
  }, async t => {
    const f = fixture(t, options);
    assert.equal(f.telemetry.isDisabled, true);
    let aborted = false;
    const pending = f.telemetry.record(event, true);
    pending._controller = {
      abort() {
        aborted = true;
      },
    };
    f.telemetry.flushDetached({
      mode: 'dev',
      dir: '/owned/project',
      distDir: null,
      events: null,
    });
    await pending;
    assert.equal(f.calls.length, 0, 'disabled shutdown must not spawn');
    assert.deepEqual(
      f.files(),
      [],
      'disabled shutdown must not write event batches'
    );
    assert.equal(
      aborted,
      false,
      'disabled flush must leave queue controllers alone'
    );
  });
}

test('disabled explicit event batch cannot bypass the guard', t => {
  const f = fixture(t, { disabled: '1' });
  f.telemetry.flushDetached({
    mode: 'dev',
    dir: '/owned/project',
    distDir: f.dir,
    events: [event],
  });
  assert.equal(f.calls.length, 0);
  assert.deepEqual(f.files(), []);
});

for (const [name, debug] of [
  ['detached', undefined],
  ['debug', '1'],
]) {
  test(`enabled ${name} flush preserves batch, arguments and spawn mode`, {
    timeout: 3000,
  }, async t => {
    const f = fixture(t, { debug });
    const pending = f.telemetry.record(event, true);
    f.telemetry.flushDetached({
      mode: 'dev',
      dir: '/owned/project',
      distDir: f.dir,
      events: null,
    });
    await pending;
    assert.equal(f.calls.length, 1);
    const {
      method,
      args: [executable, args, options],
    } = f.calls[0];
    assert.equal(method, debug ? 'spawnSync' : 'spawn');
    assert.equal(executable, process.execPath);
    assert.equal(
      args[0],
      path.join(path.dirname(storageFile), 'detached-flush.js')
    );
    assert.equal(args[1], 'dev');
    assert.equal(args[2], '/owned/project');
    assert.match(args[3], /^_events_\d+_[a-f0-9]{16}\.json$/);
    assert.equal(args[4], f.dir);
    assert.equal(options.detached, !debug);
    assert.equal(options.windowsHide, true);
    assert.equal(options.shell, false);
    assert.equal(options.stdio, debug ? 'inherit' : undefined);
    assert.deepEqual(
      JSON.parse(readFileSync(path.join(f.dir, 'cache', args[3]), 'utf8')),
      [event]
    );
  });
}
