import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const testDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(testDir, '..', '..', '..', '..', '..');
const publicLaunchConfigPath = resolve(
  repoRoot,
  'apps/web/.lighthouserc.public-launch.json'
);

const REQUIRED_CHROME_ARGS = [
  '--no-sandbox',
  '--disable-setuid-sandbox',
  '--disable-dev-shm-usage',
] as const;

describe('public Lighthouse CI config', () => {
  it('uses CI-stable Chrome launch flags to avoid DevTools protocol timeouts', () => {
    const config = JSON.parse(readFileSync(publicLaunchConfigPath, 'utf8')) as {
      ci?: {
        collect?: {
          puppeteerLaunchOptions?: {
            args?: readonly string[];
          };
        };
      };
    };

    const args = config.ci?.collect?.puppeteerLaunchOptions?.args ?? [];

    for (const requiredArg of REQUIRED_CHROME_ARGS) {
      expect(args, `Missing Chrome arg: ${requiredArg}`).toContain(requiredArg);
    }
  });
});
