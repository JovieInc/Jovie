import { spawnSync } from 'node:child_process';

// A worker-named folder is not an escape when Electron main imports it.
export async function hideSync() {
  return spawnSync('true', { encoding: 'utf8' });
}
