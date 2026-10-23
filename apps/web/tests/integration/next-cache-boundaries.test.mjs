/**
 * Explicit integration selector (not added to the fast source CI path):
 * node --test apps/web/tests/integration/next-cache-boundaries.test.mjs
 *
 * Real Next Server Actions, React memoization, headers and persistent cache;
 * synthetic session/DB leaves. No application server or secrets are required.
 * JOVIE_CACHE_BOUNDARY_SOURCE_ROOT supports deliberate-red source controls.
 */
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import {
  cp,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises';
import { createRequire } from 'node:module';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { fixtureFiles } from '../fixtures/next-cache-boundaries.mjs';

const webRoot = fileURLToPath(new URL('../../', import.meta.url));
const sourceRoot = process.env.JOVIE_CACHE_BOUNDARY_SOURCE_ROOT || webRoot;
const requireWeb = createRequire(path.join(webRoot, 'package.json'));
const sourceFiles = [
  'app/app/(shell)/dashboard/audience/audience-data.ts',
  'app/app/(shell)/dashboard/audience/actions.ts',
  'app/app/(shell)/dashboard/contacts/actions.ts',
  'lib/auth/cached.ts',
  'lib/auth/session.ts',
  'lib/auth/request-session.ts',
];

async function freePort() {
  const server = createServer();
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const port = server.address().port;
  await new Promise(resolve => server.close(resolve));
  return port;
}

test('persistent caches preserve request auth boundaries in Next Server Actions', {
  timeout: 120_000,
}, async t => {
  const directory = await mkdtemp(path.join(tmpdir(), 'jovie-next-cache-'));
  let server;
  let logs = '';
  t.after(async () => {
    if (server && server.exitCode === null) {
      server.kill('SIGTERM');
      await Promise.race([
        once(server, 'exit'),
        delay(5_000, undefined, { ref: false }),
      ]);
      if (server.exitCode === null) {
        server.kill('SIGKILL');
        await once(server, 'exit');
      }
    }
    await rm(directory, { recursive: true, force: true });
  });
  async function write(name, value) {
    const target = path.join(directory, name);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, value);
  }
  for (const source of sourceFiles) {
    const target = path.join(directory, 'src', source);
    await mkdir(path.dirname(target), { recursive: true });
    await cp(path.join(sourceRoot, source), target);
  }
  for (const [name, value] of Object.entries(fixtureFiles))
    await write(name, value);
  const dependencies = {};
  for (const name of [
    'next',
    'react',
    'react-dom',
    'zod',
    'typescript',
    '@types/react',
    '@types/node',
  ]) {
    const manifest = requireWeb.resolve(`${name}/package.json`);
    dependencies[name] = JSON.parse(await readFile(manifest, 'utf8')).version;
    const target = path.join(directory, 'node_modules', name);
    await mkdir(path.dirname(target), { recursive: true });
    await symlink(path.dirname(manifest), target, 'dir');
  }
  await write(
    'package.json',
    JSON.stringify({
      name: 'synthetic-cache-regression',
      private: true,
      dependencies,
    })
  );
  await write(
    'tsconfig.json',
    JSON.stringify({
      compilerOptions: {
        target: 'ES2022',
        lib: ['dom', 'esnext'],
        module: 'esnext',
        moduleResolution: 'bundler',
        jsx: 'preserve',
        esModuleInterop: true,
        skipLibCheck: true,
        paths: { '@/*': ['./src/*'] },
      },
    })
  );
  await write(
    'next.config.js',
    `const path=require('node:path');module.exports={experimental:{cpus:1},webpack(config){config.resolve.alias['drizzle-orm']=path.resolve(__dirname,'src/stubs/drizzle.ts');return config;}};`
  );
  await write(
    'synthetic-state.json',
    JSON.stringify({ owner: 'fixture-owner', events: [] })
  );
  const port = await freePort();
  const base = `http://127.0.0.1:${port}`;
  // Deliberately do not inherit database/provider credentials into the fixture.
  server = spawn(
    process.execPath,
    [
      requireWeb.resolve('next/dist/bin/next'),
      'dev',
      '--webpack',
      '--hostname',
      '127.0.0.1',
      '--port',
      String(port),
    ],
    {
      cwd: directory,
      env: {
        PATH: process.env.PATH,
        NEXT_TELEMETRY_DISABLED: '1',
        NODE_ENV: 'development',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    }
  );
  server.stdout.on('data', data => {
    logs += data;
  });
  server.stderr.on('data', data => {
    logs += data;
  });
  const deadline = Date.now() + 60_000;
  let document;
  while (Date.now() < deadline) {
    assert.equal(server.exitCode, null, logs);
    try {
      const response = await fetch(base, {
        signal: AbortSignal.timeout(3_000),
      });
      document = await response.text();
      if (response.ok) break;
    } catch {
      /* Wait only for this owned local server to compile. */
    }
    await delay(100);
  }
  const actionId = document?.match(/name="(\$ACTION_ID_[^"]+)"/)?.[1];
  assert.ok(actionId, `No compiled Server Action form. ${logs}`);
  async function invoke(scenario, actor = 'fixture-owner') {
    const body = new FormData();
    body.set(actionId, '');
    body.set('scenario', scenario);
    const headers = { Origin: base, Accept: 'text/html' };
    if (actor) headers['x-fixture-user'] = actor;
    const response = await fetch(base, {
      method: 'POST',
      headers,
      body,
      redirect: 'manual',
      signal: AbortSignal.timeout(10_000),
    });
    assert.equal(response.status, 303, `${await response.text()}\n${logs}`);
    const location = new URL(response.headers.get('Location'), base);
    return JSON.parse(location.searchParams.get('result'));
  }
  const count = (result, event) =>
    result.events.filter(value => value === event).length;

  await t.test(
    'cold audience action keeps request headers outside the persistent cache',
    async () => {
      const result = await invoke('audience');
      assert.equal(result.ok, true, result.error);
      assert.equal(count(result, 'audience-query'), 1);
      assert.equal(count(result, 'rls:fixture-owner'), 1);
    }
  );
  await t.test(
    'warm contacts cache rechecks ownership after revocation',
    async () => {
      const cold = await invoke('contacts');
      assert.equal(cold.ok, true, cold.error);
      const warm = await invoke('contacts');
      assert.deepEqual(warm.value, cold.value);
      assert.equal(
        count(warm, 'contacts-query'),
        count(cold, 'contacts-query')
      );
      assert.equal((await invoke('revoke')).ok, true);
      const revoked = await invoke('contacts');
      assert.equal(
        revoked.ok,
        false,
        'Revoked owner received the warm cached contact'
      );
      assert.equal(revoked.error, 'Unauthorized to access this profile');
      assert.equal(revoked.value, undefined);
      assert.equal(
        count(warm, 'ownership-query'),
        count(cold, 'ownership-query') + 1
      );
      assert.equal(
        count(revoked, 'contacts-query'),
        count(warm, 'contacts-query')
      );
      const newOwner = await invoke('contacts', 'fixture-new-owner');
      assert.equal(newOwner.ok, true, newOwner.error);
      assert.equal(
        count(newOwner, 'contacts-query'),
        count(warm, 'contacts-query') + 1
      );
    }
  );
  await t.test('anonymous contact action remains unauthorized', async () => {
    const result = await invoke('contacts', null);
    assert.equal(result.ok, false);
    assert.equal(result.error, 'Unauthorized');
    assert.equal(result.value, undefined);
  });
});
