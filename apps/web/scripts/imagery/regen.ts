/**
 * One command to bring every stale piece of the imagery pipeline current:
 *
 *   pnpm --filter @jovie/web imagery:regen [--base-url URL]
 *
 * Order matters: shots first (stages composite them), then plates (Workers AI,
 * needs a credential, see plate.ts), then the cold verification of every
 * stage whose shots, plate or spec changed. Run it against a demo-mode dev
 * server (`dev:local:playwright`) on the render host. The art-direction guard
 * (`scripts/invariants/art-direction/imagery.mjs`) is what turns "stale" red.
 */
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { WEB_ROOT } from './manifest';

const passthrough = process.argv.slice(2);
const steps: [string, string[]][] = [
  ['shots', ['scripts/product-shots/render.ts', '--stale', ...passthrough]],
  ['plates', ['scripts/imagery/plate.ts', '--stale']],
  ['verify', ['scripts/imagery/verify.ts', '--stale', ...passthrough]],
];

for (const [name, args] of steps) {
  process.stdout.write(`[imagery:regen] ${name}\n`);
  const result = spawnSync('pnpm', ['exec', 'tsx', ...args], {
    cwd: path.resolve(WEB_ROOT),
    stdio: 'inherit',
  });
  if (result.status !== 0) {
    process.stderr.write(`[imagery:regen] ${name} failed\n`);
    process.exit(result.status ?? 1);
  }
}
