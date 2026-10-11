import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  pinStandaloneLoopbackHostname,
  runLoopbackPin,
} from './fix-standalone-loopback-hostname.mjs';

const GENERATED_SERVER = `#!/usr/bin/env node
const path = require('path')
process.env.NODE_ENV = 'production'
const currentPort = parseInt(process.env.PORT, 10) || 3000
const hostname = process.env.HOSTNAME || '0.0.0.0'
startServer({ dir, isDev: false, hostname, port: currentPort })
`;

const temporaryRoots = [];
afterEach(() => {
  for (const root of temporaryRoots.splice(0))
    rmSync(root, { recursive: true, force: true });
});

function tempAppRoot(serverJs) {
  const root = mkdtempSync(join(tmpdir(), 'loopback-pin-'));
  temporaryRoots.push(root);
  mkdirSync(join(root, '.next', 'standalone', 'apps', 'web'), {
    recursive: true,
  });
  if (serverJs !== null)
    writeFileSync(join(root, '.next/standalone/apps/web/server.js'), serverJs);
  return root;
}

describe('fix-standalone-loopback-hostname', () => {
  it('rewrites only the generated default and reports each action', () => {
    const pinned = pinStandaloneLoopbackHostname(GENERATED_SERVER);
    expect(pinned.action).toBe('pinned');
    expect(pinned.content).not.toBe(GENERATED_SERVER);
    expect(pinStandaloneLoopbackHostname(pinned.content).action).toBe(
      'already-pinned'
    );
    const future = 'const hostname = nextServeHost(process.env)';
    const drifted = pinStandaloneLoopbackHostname(future);
    expect(drifted.action).toBe('unknown-template');
    expect(drifted.content).toBe(future);
  });

  it('pins the standalone server to the IPv4 loopback in-process', () => {
    const root = tempAppRoot(GENERATED_SERVER);
    const logs = [];
    const first = runLoopbackPin({ appRoot: root, log: m => logs.push(m) });
    expect(first.action).toBe('pinned');
    expect(logs[0]).toContain('Pinned standalone server.js loopback hostname');
    const serverPath = join(root, '.next/standalone/apps/web/server.js');
    const pinned = readFileSync(serverPath, 'utf8');
    expect(pinned).toContain(": '127.0.0.1'");
    expect(pinned).not.toContain("|| '0.0.0.0'");
    // The pinned template preserves explicit real-host overrides.
    expect(pinned).toContain('includes(process.env.HOSTNAME)');
    const second = runLoopbackPin({ appRoot: root, log: () => {} });
    expect(second.action).toBe('already-pinned');
    expect(readFileSync(serverPath, 'utf8')).toBe(pinned);
  });

  it('fails closed when the next template changes shape', () => {
    const root = tempAppRoot('const hostname = nextServeHost(process.env)');
    expect(() => runLoopbackPin({ appRoot: root, log: () => {} })).toThrow(
      'does not match the expected hostname template'
    );
  });

  it('is a no-op when the build produced no standalone output', () => {
    const root = tempAppRoot(null);
    const result = runLoopbackPin({ appRoot: root, log: () => {} });
    expect(result.action).toBe('no-standalone');
  });

  it('treats loopback aliases and unsets as the pinned default', () => {
    for (const HOSTNAME of ['localhost', '::1', undefined, '']) {
      process.env.HOSTNAME = HOSTNAME;
      const { content } = pinStandaloneLoopbackHostname(GENERATED_SERVER);
      expect(content).toContain(": '127.0.0.1'");
      const realHost = 'prod-host.internal';
      process.env.HOSTNAME = realHost;
      // Only the template default changes; the generated expression still defers
      // to a real HOSTNAME at server runtime.
      expect(pinStandaloneLoopbackHostname(GENERATED_SERVER).content).toContain(
        'process.env.HOSTNAME'
      );
    }
    delete process.env.HOSTNAME;
  });
});
