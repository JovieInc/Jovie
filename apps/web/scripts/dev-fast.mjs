import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { resetNextCacheIfStale } from './dev-next-cache-guard.mjs';

const require = createRequire(import.meta.url);
const nextBin = require.resolve('next/dist/bin/next');
const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.resolve(scriptDir, '..');
const appDir = path.join(webRoot, 'app');
const nextDir = path.join(webRoot, '.next');

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
const forceReset = process.env.JOVIE_DEV_RESET_NEXT_CACHE === '1';
const extraArgs = process.argv.slice(2);
const nextArgs = ['dev'];
if (process.env.PORT) {
  nextArgs.push('-p', process.env.PORT);
}
nextArgs.push(...extraArgs);

const cacheState = await resetNextCacheIfStale({
  appDir,
  nextDir,
  forceReset,
  log: message => console.error(message),
});

let loggedRouteDiscovery = false;

const nextDev = spawn(process.execPath, [nextBin, ...nextArgs], {
  env: {
    ...process.env,
    NODE_OPTIONS: nodeOptions,
  },
  stdio: ['inherit', 'pipe', 'pipe'],
});

const logRouteDiscovery = line => {
  if (loggedRouteDiscovery) {
    return;
  }

  if (!/(Ready in|Local:)/i.test(line)) {
    return;
  }

  loggedRouteDiscovery = true;
  console.error(
    `[dev] Discovered ${cacheState.pageCount} App Router page routes before first compile`
  );
};

const relay = (stream, writer) => {
  stream.on('data', chunk => {
    const text = chunk.toString();
    writer.write(chunk);

    for (const line of text.split(/\r?\n/)) {
      logRouteDiscovery(line);
    }
  });
};

relay(nextDev.stdout, process.stdout);
relay(nextDev.stderr, process.stderr);

nextDev.on('exit', (code, signal) => {
  if (signal) {
    process.exit(1);
  }

  process.exit(code ?? 0);
});
