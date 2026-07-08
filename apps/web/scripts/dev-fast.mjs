import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ensureDevNextCacheFresh,
  formatDevRouteDiscoveryLog,
} from './ensure-dev-next-cache.mjs';

const require = createRequire(import.meta.url);
const nextBin = require.resolve('next/dist/bin/next');
const scriptsDir = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.resolve(scriptsDir, '..');
const appDir = path.join(webRoot, 'app');
const nextDir = path.join(webRoot, '.next');

const port = process.env.PORT || '3100';
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
const routeSummary = ensureDevNextCacheFresh({ appDir, nextDir, webRoot });

console.error(formatDevRouteDiscoveryLog(routeSummary));

const passthroughIndex = process.argv.indexOf('--');
const extraArgs =
  passthroughIndex === -1 ? [] : process.argv.slice(passthroughIndex + 1);

const nextDev = spawn(
  process.execPath,
  [nextBin, 'dev', '-p', port, ...extraArgs],
  {
    cwd: webRoot,
    env: {
      ...process.env,
      NODE_OPTIONS: nodeOptions,
    },
    stdio: 'inherit',
  }
);

nextDev.on('exit', (code, signal) => {
  if (signal) {
    process.exit(1);
  }

  process.exit(code ?? 0);
});
