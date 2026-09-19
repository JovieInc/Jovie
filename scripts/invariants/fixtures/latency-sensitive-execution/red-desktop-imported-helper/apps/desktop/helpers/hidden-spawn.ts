import { spawnSync } from 'node:child_process';

// Hidden spawnSync in an imported async helper is still main-thread blocking.
export async function hideSync() {
  return spawnSync('true', { encoding: 'utf8' });
}
