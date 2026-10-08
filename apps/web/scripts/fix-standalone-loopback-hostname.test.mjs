import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { pinStandaloneLoopbackHostname } from './fix-standalone-loopback-hostname.mjs';

const generatedServer = `#!/usr/bin/env node
const path = require('path')
const dir = path.join(__dirname)
process.env.NODE_ENV = 'production'
process.chdir(__dirname)
const currentPort = parseInt(process.env.PORT, 10) || 3000
const hostname = process.env.HOSTNAME || '0.0.0.0'
startServer({ dir, isDev: false, hostname, port: currentPort })
`;

afterEach(() => {
  vi.restoreAllMocks();
});

function runOn(serverJs) {
  const appRoot = join(
    mkdtempSync(join(tmpdir(), 'loopback-pin-')),
    'apps',
    'web'
  );
  const serverPath = join(
    appRoot,
    '.next',
    'standalone',
    'apps',
    'web',
    'server.js'
  );
  if (serverJs !== null) {
    mkdirSync(join(serverPath, '..'), { recursive: true });
    writeFileSync(serverPath, serverJs);
  }
  const log = vi.spyOn(console, 'log').mockImplementation(() => {});
  pinStandaloneLoopbackHostname(appRoot);
  const stdout = log.mock.calls.map(call => call.join(' ')).join('\n');
  return { serverPath, stdout };
}

describe('fix-standalone-loopback-hostname', () => {
  it('pins the generated default and HOSTNAME=localhost/::1 to the IPv4 loopback', () => {
    const { stdout, serverPath } = runOn(generatedServer);
    expect(stdout).toContain('Pinned standalone server.js loopback hostname');
    const patched = readFileSync(serverPath, 'utf8');
    expect(patched).toContain(": '127.0.0.1'");
    expect(patched).not.toContain("|| '0.0.0.0'");
  });

  it('is idempotent', () => {
    const first = runOn(generatedServer);
    const once = readFileSync(first.serverPath, 'utf8');
    const second = runOn(once);
    expect(second.stdout).toContain('already pins');
    expect(readFileSync(second.serverPath, 'utf8')).toBe(once);
  });

  it('preserves explicit non-loopback HOSTNAME semantics', () => {
    const { serverPath } = runOn(generatedServer);
    const patched = readFileSync(serverPath, 'utf8');
    expect(patched).toContain('includes(process.env.HOSTNAME)');
  });

  it('fails closed when the template changes shape', () => {
    const future = generatedServer.replace(
      "const hostname = process.env.HOSTNAME || '0.0.0.0'",
      'const hostname = nextServeHost(process.env)'
    );
    expect(() => runOn(future)).toThrow(
      'does not match the expected hostname template'
    );
  });

  it('exits cleanly when no standalone output exists', () => {
    const { stdout } = runOn(null);
    expect(stdout).toContain('No standalone server.js found');
  });
});
