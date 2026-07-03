import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { ensureDevNextCache } from './lib/dev-next-cache.mjs';

const webRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const nextBin = require.resolve('next/dist/bin/next');

const cacheDecision = ensureDevNextCache(webRoot);

const port = process.env.PORT || '3000';
const heapFlag = '--max-old-space-size=8192';
const networkFamilyFlag = '--no-network-family-autoselection';
const existingNodeOptions = process.env.NODE_OPTIONS || '';
const nodeOptionParts = [existingNodeOptions];

if (!existingNodeOptions.includes('--max-old-space-size=')) {
  nodeOptionParts.unshift(heapFlag);
}

if (!existingNodeOptions.includes(networkFamilyFlag)) {
  nodeOptionParts.push(networkFamilyFlag);
}

const nodeOptions = nodeOptionParts.filter(Boolean).join(' ');
const nextArgs = ['dev', '-p', port];
const extraArgs = process.argv.slice(2);

if (extraArgs.length > 0) {
  nextArgs.push(...extraArgs);
}

let loggedRouteManifest = false;

/** @param {Buffer | string} chunk */
function maybeLogRouteManifest(chunk) {
  if (loggedRouteManifest) {
    return;
  }

  if (!/Ready in/i.test(chunk.toString())) {
    return;
  }

  loggedRouteManifest = true;
  const { pages, routeHandlers, total } = cacheDecision.routes;
  console.log(
    `[dev] Route manifest: ${total} app routes on disk ` +
      `(${pages} pages, ${routeHandlers} route handlers).`
  );
}

const nextDev = spawn(process.execPath, [nextBin, ...nextArgs], {
  env: {
    ...process.env,
    NODE_OPTIONS: nodeOptions,
  },
  stdio: ['inherit', 'pipe', 'pipe'],
});

nextDev.stdout?.on('data', chunk => {
  process.stdout.write(chunk);
  maybeLogRouteManifest(chunk);
});

nextDev.stderr?.on('data', chunk => {
  process.stderr.write(chunk);
  maybeLogRouteManifest(chunk);
});

nextDev.on('exit', (code, signal) => {
  if (signal) {
    process.exit(1);
  }

  process.exit(code ?? 0);
});