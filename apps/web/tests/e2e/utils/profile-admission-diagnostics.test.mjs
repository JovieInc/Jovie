import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { isProfileAdmissionFixtureEnabled } from '../../../app/(marketing)/renders/profile-admission/guard.ts';
import {
  classifyResponse,
  observeProfileAdmissionFailure,
  readBuildIdentity,
} from './profile-admission-diagnostics.mjs';

const SECRET = 'sk_live_secret-cookie@example.invalid/?token=PRIVATE';
const eligible = { CI: 'true', PROFILE_ADMISSION_DIAGNOSTICS: '1' };
const page = () => {
  const p = new EventEmitter();
  const frame = {};
  p.mainFrame = () => frame;
  return p;
};
const response = (p, overrides = {}) => ({
  request: () => ({
    isNavigationRequest: () => true,
    frame: () => p.mainFrame(),
  }),
  url: () =>
    'http://localhost:3100/renders/profile-admission?layout=public&state=unclaimed',
  status: () => 404,
  body: async () => Buffer.from('This page could not be found ' + SECRET),
  ...overrides,
});
function withGuardLogs(fn) {
  const old = process.env.PROFILE_ADMISSION_DIAGNOSTICS,
    info = console.info,
    lines = [];
  process.env.PROFILE_ADMISSION_DIAGNOSTICS = '1';
  console.info = s => lines.push(s);
  try {
    fn(lines);
  } finally {
    console.info = info;
    if (old === undefined) delete process.env.PROFILE_ADMISSION_DIAGNOSTICS;
    else process.env.PROFILE_ADMISSION_DIAGNOSTICS = old;
  }
}

test('guard preserves full production/CI/flag truth table with diagnostic opt-in', () => {
  withGuardLogs(lines => {
    for (const VERCEL_ENV of ['production', 'preview', undefined, SECRET])
      for (const NODE_ENV of [
        'production',
        'development',
        'test',
        undefined,
        SECRET,
      ])
        for (const CI of ['true', 'false', undefined, SECRET])
          for (const NEXT_PUBLIC_E2E_MODE of ['1', '0', undefined, SECRET])
            for (const PUBLIC_NOAUTH_SMOKE of ['1', '0', undefined, SECRET]) {
              const env = {
                VERCEL_ENV,
                NODE_ENV,
                CI,
                NEXT_PUBLIC_E2E_MODE,
                PUBLIC_NOAUTH_SMOKE,
              };
              const expected =
                VERCEL_ENV !== 'production' &&
                (NODE_ENV !== 'production' || CI === 'true') &&
                (NEXT_PUBLIC_E2E_MODE === '1' || PUBLIC_NOAUTH_SMOKE === '1');
              const before = lines.length;
              assert.equal(isProfileAdmissionFixtureEnabled(env), expected);
              assert.equal(lines.length - before, CI === 'true' ? 1 : 0);
              if (CI === 'true') {
                const row = JSON.parse(lines.at(-1).split('] ')[1]);
                assert.equal(row.allowed, expected);
                assert.equal(row.invoked, true);
                assert.equal(row.e2e, NEXT_PUBLIC_E2E_MODE === '1');
                assert.equal(row.smoke, PUBLIC_NOAUTH_SMOKE === '1');
              }
            }
    assert(!lines.join('').includes(SECRET));
  });
});

test('guard silent without exact opt-in and logging exception never changes return', () => {
  withGuardLogs(lines => {
    for (const opt of ['0', 'true', SECRET, undefined]) {
      if (opt === undefined) delete process.env.PROFILE_ADMISSION_DIAGNOSTICS;
      else process.env.PROFILE_ADMISSION_DIAGNOSTICS = opt;
      assert.equal(
        isProfileAdmissionFixtureEnabled({
          CI: 'true',
          NEXT_PUBLIC_E2E_MODE: '1',
        }),
        true
      );
    }
    assert.equal(lines.length, 0);
    process.env.PROFILE_ADMISSION_DIAGNOSTICS = '1';
    console.info = () => {
      throw new Error(SECRET);
    };
    assert.equal(
      isProfileAdmissionFixtureEnabled({
        CI: 'true',
        NEXT_PUBLIC_E2E_MODE: '1',
      }),
      true
    );
    assert.equal(
      isProfileAdmissionFixtureEnabled({
        CI: 'true',
        VERCEL_ENV: 'production',
        NEXT_PUBLIC_E2E_MODE: '1',
      }),
      false
    );
  });
});

test('response classification emits finite enums only with hostile query/body and malformed status', () => {
  for (const [body, expected] of [
    [null, 'unavailable'],
    ['NEXT_HTTP_ERROR_FALLBACK;404 ' + SECRET, 'next-not-found-boundary'],
    ['This page could not be found ' + SECRET, 'next-not-found-document'],
    ['profile-desktop-surface ' + SECRET, 'profile-fixture-marker'],
    [SECRET, 'other'],
  ]) {
    const row = classifyResponse(
      'http://localhost/renders/profile-admission?state=' +
        encodeURIComponent(SECRET) +
        '&layout=' +
        encodeURIComponent(SECRET) +
        '&violation=' +
        encodeURIComponent(SECRET) +
        '&cookie=' +
        encodeURIComponent(SECRET),
      SECRET,
      body
    );
    assert.equal(row.bodyClass, expected);
    assert.equal(row.status, null);
    assert.equal(row.state, 'other');
    assert.equal(row.layout, 'other');
    assert.equal(row.violation, 'other');
    assert(!JSON.stringify(row).includes(SECRET));
  }
  assert.equal(
    classifyResponse(
      'http://localhost/renders/profile-admission?violation=desktop-compact-shell',
      404,
      ''
    ).violation,
    'desktop-compact-shell'
  );
});

test('observer is silent and adds no listeners unless explicitly eligible', async () => {
  for (const env of [
    {},
    { CI: 'true' },
    { CI: 'false', PROFILE_ADMISSION_DIAGNOSTICS: '1' },
    { CI: 'true', PROFILE_ADMISSION_DIAGNOSTICS: SECRET },
  ]) {
    const p = page();
    await observeProfileAdmissionFailure(p, { env })();
    assert.equal(p.listenerCount('response'), 0);
  }
});

test('observer captures original failing main document once with no requests/headers/navigation', async () => {
  const p = page(),
    lines = [];
  let bodies = 0;
  const stop = observeProfileAdmissionFailure(p, {
    env: eligible,
    emit: x => lines.push(x),
    identity: () => ({ fixed: true }),
  });
  const r = response(p, {
    body: async () => {
      bodies++;
      return Buffer.from('This page could not be found ' + SECRET);
    },
  });
  p.emit('response', r);
  p.emit('response', r);
  await stop();
  assert.equal(bodies, 1);
  assert.equal(lines.length, 1);
  assert.equal(p.listenerCount('response'), 0);
  const row = JSON.parse(lines[0].split('] ')[1]);
  assert.equal(row.status, 404);
  assert.equal(row.state, 'unclaimed');
  assert.equal(row.layout, 'public');
  assert.equal(row.bodyClass, 'next-not-found-document');
  assert(!lines[0].includes(SECRET));
});

test('observer ignores successful, non-document, foreign, credential, wrong route and malformed responses', async () => {
  const credentialUrl = new URL('http://localhost/renders/profile-admission');
  credentialUrl.username = 'dummy-user';
  credentialUrl.password = 'dummy-password';
  const p = page(),
    lines = [];
  const stop = observeProfileAdmissionFailure(p, {
    env: eligible,
    emit: x => lines.push(x),
  });
  for (const overrides of [
    { status: () => 200 },
    { url: () => 'https://external.invalid/renders/profile-admission' },
    { url: () => credentialUrl.href },
    { url: () => 'file://localhost/renders/profile-admission' },
    { url: () => 'http://localhost/other?token=' + SECRET },
    { url: () => SECRET },
    { request: () => ({ isNavigationRequest: () => false }) },
    { request: () => ({ isNavigationRequest: () => true, frame: () => ({}) }) },
  ])
    p.emit(
      'response',
      response(p, {
        ...overrides,
        body: () => {
          throw new Error('must not read');
        },
      })
    );
  await stop();
  assert.deepEqual(lines, []);
});

test('body failure is sanitized, output failure cannot replace assertion error', async () => {
  for (const throwing of [false, true]) {
    const p = page(),
      lines = [];
    const stop = observeProfileAdmissionFailure(p, {
      env: eligible,
      emit: x => {
        if (throwing) throw Error(SECRET);
        lines.push(x);
      },
      identity: () => ({}),
    });
    p.emit(
      'response',
      response(p, {
        body: async () => {
          throw Error(SECRET);
        },
      })
    );
    const original = Error('expected 200 received 404');
    let seen;
    try {
      throw original;
    } catch (e) {
      seen = e;
    } finally {
      await stop();
    }
    assert.equal(seen, original);
    if (!throwing) {
      assert.equal(
        JSON.parse(lines[0].split('] ')[1]).bodyClass,
        'unavailable'
      );
      assert(!lines[0].includes(SECRET));
    }
  }
});

test('body wait is bounded, detached and cannot emit after completion', async () => {
  const p = page(),
    lines = [];
  let release;
  const stop = observeProfileAdmissionFailure(p, {
    env: eligible,
    emit: x => lines.push(x),
    timeoutMs: 10,
  });
  p.emit(
    'response',
    response(p, { body: () => new Promise(r => (release = r)) })
  );
  const start = Date.now();
  await stop();
  assert(Date.now() - start < 500);
  assert.equal(p.listenerCount('response'), 0);
  release(Buffer.from(SECRET));
  await new Promise(r => setImmediate(r));
  assert.equal(lines.length, 1);
  assert.equal(JSON.parse(lines[0].split('] ')[1]).bodyClass, 'unavailable');
  assert(!lines[0].includes(SECRET));
});

test('build identity hashes exact bounded source/manifest/compiled bytes, never raw contents', () => {
  const root = mkdtempSync(join(tmpdir(), 'profile-diag-test-'));
  const write = (p, s) => {
    mkdirSync(join(root, p, '..'), { recursive: true });
    writeFileSync(join(root, p), s);
  };
  try {
    write('app/(marketing)/renders/profile-admission/guard.ts', SECRET);
    write('.next/BUILD_ID', SECRET);
    write(
      '.next/dev/server/app-paths-manifest.json',
      JSON.stringify({
        '/(marketing)/renders/profile-admission/page': 'app/profile.js',
      })
    );
    write('.next/dev/server/app/profile.js', SECRET);
    write(
      '.next/server/app-paths-manifest.json',
      JSON.stringify({
        '/(marketing)/renders/profile-admission/page': '../escape.js',
      })
    );
    const row = readBuildIdentity(root);
    assert.match(row.guardSourceSha256, /^[a-f0-9]{64}$/);
    assert.match(row.buildIdSha256, /^[a-f0-9]{64}$/);
    assert.match(row.manifests[0].compiledPageSha256, /^[a-f0-9]{64}$/);
    assert.equal(row.manifests[1].compiledPageSha256, null);
    assert(!JSON.stringify(row).includes(SECRET));
    write('.next/dev/server/app-paths-manifest.json', SECRET);
    assert.equal(readBuildIdentity(root).manifests[0].routeEntryPresent, false);
    write('.next/dev/server/app-paths-manifest.json', '{}');
    assert.equal(readBuildIdentity(root).manifests[0].routeEntryPresent, false);
    write(
      '.next/dev/server/app-paths-manifest.json',
      JSON.stringify({
        '/(marketing)/renders/profile-admission/page': '/tmp/secret',
      })
    );
    assert.equal(readBuildIdentity(root).manifests[0].compiledPageSha256, null);
    write(
      'app/(marketing)/renders/profile-admission/guard.ts',
      Buffer.alloc(2 * 1024 * 1024 + 1)
    );
    assert.equal(readBuildIdentity(root).guardSourceSha256, null);
    rmSync(join(root, '.next/BUILD_ID'));
    symlinkSync('/etc/hosts', join(root, '.next/BUILD_ID'));
    assert.equal(readBuildIdentity(root).buildIdSha256, null);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('missing build files fail to explicit null identity without raw filesystem errors', () => {
  const row = readBuildIdentity('/does-not-exist/' + SECRET);
  assert.equal(row.guardSourceSha256, null);
  assert.equal(row.buildIdSha256, null);
  assert(row.manifests.every(m => m.manifestSha256 === null));
  assert(!JSON.stringify(row).includes(SECRET));
});

test('default guard reads actual runtime snapshot and diagnostics stay finite', () => {
  const keys = [
    'CI',
    'NEXT_PUBLIC_E2E_MODE',
    'PUBLIC_NOAUTH_SMOKE',
    'NODE_ENV',
    'VERCEL_ENV',
  ];
  const old = Object.fromEntries(keys.map(k => [k, process.env[k]]));
  try {
    withGuardLogs(lines => {
      Object.assign(process.env, {
        CI: 'true',
        NEXT_PUBLIC_E2E_MODE: '1',
        PUBLIC_NOAUTH_SMOKE: SECRET,
        NODE_ENV: 'development',
        VERCEL_ENV: SECRET,
      });
      assert.equal(isProfileAdmissionFixtureEnabled(), true);
      const row = JSON.parse(lines[0].split('] ')[1]);
      assert.equal(row.nodeMode, 'development');
      assert.equal(row.deploymentMode, 'other-or-unset');
      assert.equal(row.smoke, false);
      assert(!lines[0].includes(SECRET));
      process.env.VERCEL_ENV = 'production';
      assert.equal(isProfileAdmissionFixtureEnabled(), false);
    });
  } finally {
    for (const k of keys) {
      if (old[k] === undefined) delete process.env[k];
      else process.env[k] = old[k];
    }
  }
});

test('default observer writes only sanitized output and default filesystem identity', async () => {
  const oldCi = process.env.CI,
    oldOpt = process.env.PROFILE_ADMISSION_DIAGNOSTICS,
    oldInfo = console.info,
    lines = [];
  try {
    Object.assign(process.env, eligible);
    console.info = x => lines.push(x);
    const p = page();
    const stop = observeProfileAdmissionFailure(p);
    p.emit('response', response(p));
    await stop();
    assert.equal(lines.length, 1);
    assert(!lines[0].includes(SECRET));
    assert.equal(
      JSON.parse(lines[0].split('] ')[1]).identity.serverOperands,
      'see-server-profile-admission-guard-log; not-runner-env'
    );
  } finally {
    console.info = oldInfo;
    if (oldCi === undefined) delete process.env.CI;
    else process.env.CI = oldCi;
    if (oldOpt === undefined) delete process.env.PROFILE_ADMISSION_DIAGNOSTICS;
    else process.env.PROFILE_ADMISSION_DIAGNOSTICS = oldOpt;
  }
});

test('identity read failure keeps sanitized response status without throwing', async () => {
  const p = page(),
    lines = [];
  const stop = observeProfileAdmissionFailure(p, {
    env: eligible,
    emit: x => lines.push(x),
    identity: () => {
      throw Error(SECRET);
    },
  });
  p.emit('response', response(p));
  await stop();
  const row = JSON.parse(lines[0].split('] ')[1]);
  assert.equal(row.status, 404);
  assert.equal(row.identity, null);
  assert(!lines[0].includes(SECRET));
});
