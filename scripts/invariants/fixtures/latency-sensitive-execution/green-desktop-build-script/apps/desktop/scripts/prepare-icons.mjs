import { spawnSync } from 'node:child_process';

// Build scripts are tooling, not Electron main/preload runtime.
spawnSync('true', { stdio: 'ignore' });
