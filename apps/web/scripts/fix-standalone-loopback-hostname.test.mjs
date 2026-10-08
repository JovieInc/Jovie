import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { pinStandaloneLoopbackHostname } from './fix-standalone-loopback-hostname.mjs';

const scriptPath = new URL(
  './fix-standalone-loopback-hostname.mjs',
  import.meta.url
).pathname;

const generatedServer = `#!/usr/bin/env node
const path = require('path')
const dir = path.join(__dirname)
process.env.NODE_ENV = 'production'
process.chdir(__dirname)
const currentPort = parseInt(process.env.PORT, 10) || 3000
const hostname = process.env.HOSTNAME || '0.0.0.0'
startServer({ dir, isDev: false, hostname, port: currentPort })
`;

function runOn(serverJs) {
  const root = mkdtempSync(join(tmpdir(), 'loopback-pin-'));
  mkdirSync(join(root, 'apps', 'web', '.next', 'standalone', 'apps', 'web'), {
    recursive: true,
  });
  const serverPath = join(root, 'apps/web/.next/standalone/apps/web/server.js');
  if (serverJs !== null) writeFileSync(serverPath, serverJs);
  let script = readFileSync(scriptPath, 'utf8');
  script = script.replace(
    /const appRoot = path\.resolve\([\s\S]*?\);/,
    `const appRoot = ${JSON.stringify(join(root, 'apps/web'))};`
  );
  const patchedScriptPath = join(root, 'script.mjs');
  writeFileSync(patchedScriptPath, script);
  const result = { serverPath, stdout: '' };
  try {
    result.stdout = execFileSync(process.execPath, [patchedScriptPath], {
      encoding: 'utf8',
    });
    result.code = 0;
  } catch (error) {
    result.code = error.status ?? 1;
    result.stderr = error.stderr ?? '';
  }
  return result;
}

describe('fix-standalone-loopback-hostname', () => {
  it('rewrites only the generated default and reports each action', () => {
    const generated = "const hostname = process.env.HOSTNAME || '0.0.0.0'";
    expect(pinStandaloneLoopbackHostname(generated).action).toBe('pinned');
    expect(pinStandaloneLoopbackHostname(generated).content).not.toBe(
      generated
    );
    const pinned = pinStandaloneLoopbackHostname(
      pinStandaloneLoopbackHostname(generated).content
    );
    expect(pinned.action).toBe('already-pinned');
    expect(pinned.content).toBe(pinned.content);
    const future = 'const hostname = nextServeHost(process.env)';
    expect(pinStandaloneLoopbackHostname(future).action).toBe(
      'unknown-template'
    );
    expect(pinStandaloneLoopbackHostname(future).content).toBe(future);
  });

  it('pins the generated default and HOSTNAME=localhost/::1 to the IPv4 loopback', () => {
    const { code, stdout, serverPath } = runOn(generatedServer);
    expect(code).toBe(0);
    expect(stdout).toContain('Pinned standalone server.js loopback hostname');
    const patched = readFileSync(serverPath, 'utf8');
    expect(patched).toContain(": '127.0.0.1'");
    expect(patched).not.toContain("|| '0.0.0.0'");
  });

  it('is idempotent', () => {
    const first = runOn(generatedServer);
    expect(first.code).toBe(0);
    const once = readFileSync(first.serverPath, 'utf8');
    const second = runOn(once);
    expect(second.code).toBe(0);
    expect(second.stdout).toContain('already pins');
    expect(readFileSync(second.serverPath, 'utf8')).toBe(once);
  });

  it('preserves explicit non-loopback HOSTNAME semantics', () => {
    const { code, serverPath } = runOn(generatedServer);
    expect(code).toBe(0);
    const patched = readFileSync(serverPath, 'utf8');
    expect(patched).toContain('includes(process.env.HOSTNAME)');
  });

  it('fails closed when the template changes shape', () => {
    const future = generatedServer.replace(
      "const hostname = process.env.HOSTNAME || '0.0.0.0'",
      'const hostname = nextServeHost(process.env)'
    );
    const result = runOn(future);
    expect(result.code).toBe(1);
    expect(result.stderr).toContain(
      'does not match the expected hostname template'
    );
  });

  it('exits cleanly when no standalone output exists', () => {
    const result = runOn(null);
    expect(result.code).toBe(0);
    expect(result.stdout).toContain('No standalone server.js found');
  });
});
