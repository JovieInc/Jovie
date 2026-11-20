import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

// A JavaScript action retains the runner's artifact runtime credentials. The
// official uploader handles the artifact protocol; no provider calls live here.
/** @param {{run?: (command: string, args: string[], options: import("node:child_process").SpawnSyncOptions) => {status: number | null, error?: Error}, env?: NodeJS.ProcessEnv, log?: (message: string) => void}} options */
export function uploadEjectionReceipt({
  run = spawnSync,
  env = process.env,
  log = console.log,
} = {}) {
  try {
    const result = run(
      process.execPath,
      ['.ejection-upload/dist/upload/index.js'],
      {
        stdio: 'inherit',
        env: {
          ...env,
          INPUT_NAME: `ejection-${env.RUN_ID}`,
          INPUT_PATH: 'ejection.json',
          'INPUT_IF-NO-FILES-FOUND': 'ignore',
          'INPUT_RETENTION-DAYS': '30',
          'INPUT_COMPRESSION-LEVEL': '6',
          INPUT_OVERWRITE: 'false',
          'INPUT_INCLUDE-HIDDEN-FILES': 'false',
        },
      }
    );
    if (result.error || result.status !== 0)
      log('::notice::Ejection artifact upload unavailable');
  } catch (error) {
    log(`::notice::Ejection artifact advisory: ${error.message}`);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  uploadEjectionReceipt();
