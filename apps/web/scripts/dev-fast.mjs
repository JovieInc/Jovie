import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const nextBin = require.resolve('next/dist/bin/next');
const port = process.env.PORT || '3100';
const heapFlag = '--max-old-space-size=8192';
const existingNodeOptions = process.env.NODE_OPTIONS || '';
const nodeOptions = existingNodeOptions.includes('--max-old-space-size=')
  ? existingNodeOptions
  : [heapFlag, existingNodeOptions].filter(Boolean).join(' ');

const nextDev = spawn(process.execPath, [nextBin, 'dev', '-p', port], {
  env: {
    ...process.env,
    NODE_OPTIONS: nodeOptions,
  },
  stdio: 'inherit',
});

nextDev.on('exit', (code, signal) => {
  if (signal) {
    process.exit(1);
  }

  process.exit(code ?? 0);
});
