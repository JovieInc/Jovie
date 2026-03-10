import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const playwrightCli = path.resolve(
  scriptDir,
  '..',
  'node_modules',
  'playwright',
  'cli.js'
);
const forwardedArgs =
  process.argv[2] === '--' ? process.argv.slice(3) : process.argv.slice(2);

const result = spawnSync(
  process.execPath,
  [playwrightCli, 'test', 'tests/e2e/sentry-red-lane.spec.ts', ...forwardedArgs],
  {
    stdio: 'inherit',
    env: {
      ...process.env,
      SENTRY_E2E_REPORTING: '1',
    },
  }
);

if (typeof result.status === 'number') {
  process.exit(result.status);
}

if (result.error) {
  throw result.error;
}

process.exit(1);
