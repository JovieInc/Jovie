#!/usr/bin/env node
/**
 * Pin the standalone server's loopback bind to IPv4 (JOV-8015).
 *
 * The generated `.next/standalone/apps/web/server.js` starts with
 * `hostname = process.env.HOSTNAME || '0.0.0.0'` and `start-server` calls
 * `server.listen(port, hostname)`. With `HOSTNAME=localhost` (the nightly
 * and full-matrix lanes) Node resolves `localhost` through `dns.lookup`
 * with verbatim ordering, and GitHub-hosted runners map `::1 localhost` in
 * `/etc/hosts`, so lookup returns `::1` first and the server binds the IPv6
 * loopback ONLY. Every consumer — the readiness probe, Playwright's
 * BASE_URL `http://127.0.0.1:3100`, the test-auth host gate — then gets
 * `errno -7 (Couldn't connect)` against the IPv4 loopback and the lane
 * fails at startup (every "Changed-Evidence E2E Suite" run since Oct 3,
 * commit 3e4988bb / #20125).
 *
 * This postbuild step rewrites the generated default to `127.0.0.1` when
 * the env var is unset or `localhost`/`::1`, which pins the bind to the
 * IPv4 loopback the lanes actually probe. Explicit non-loopback HOSTNAME
 * values (deployments that pass a real host) are left untouched.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const defaultAppRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..'
);

const HOSTNAME_TEMPLATE =
  /const hostname = process\.env\.HOSTNAME \|\| '0\.0\.0\.0'/;
const HOSTNAME_PIN =
  "const hostname = process.env.HOSTNAME &&\n  !['localhost', '::1'].includes(process.env.HOSTNAME)\n  ? process.env.HOSTNAME\n  : '127.0.0.1'";

export function pinStandaloneLoopbackHostname(appRoot = defaultAppRoot) {
  const standaloneServerPath = path.join(
    appRoot,
    '.next',
    'standalone',
    'apps',
    'web',
    'server.js'
  );

  if (!existsSync(standaloneServerPath)) {
    console.log(
      'No standalone server.js found; skipping loopback hostname pin (non-standalone or preview build).'
    );
    return;
  }

  const original = readFileSync(standaloneServerPath, 'utf8');
  if (!HOSTNAME_TEMPLATE.test(original)) {
    if (original.includes("'127.0.0.1'")) {
      console.log('Standalone server.js already pins the loopback hostname.');
      return;
    }
    throw new Error(
      'Standalone server.js does not match the expected hostname template; refusing to guess (next version changed?).'
    );
  }

  writeFileSync(
    standaloneServerPath,
    original.replace(HOSTNAME_TEMPLATE, HOSTNAME_PIN)
  );
  console.log(
    'Pinned standalone server.js loopback hostname to 127.0.0.1 (HOSTNAME=localhost resolves ::1 first on some runners; JOV-8015).'
  );
}

const invokedDirectly =
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) {
  pinStandaloneLoopbackHostname();
}
