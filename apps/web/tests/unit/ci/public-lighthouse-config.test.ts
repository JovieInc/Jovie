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
const rootPackagePath = resolve(repoRoot, 'package.json');

// Without a puppeteerScript, LHCI uses the node-runner (LighthouseRunner) which
// reads settings.chromeFlags — NOT puppeteerLaunchOptions. The public launch
// config has no puppeteerScript, so flags must live in settings.chromeFlags.
// See @lhci/cli/src/collect/node-runner.js computeArgumentsAndCleanup.
const REQUIRED_CHROME_FLAGS = [
  '--no-sandbox',
  '--disable-setuid-sandbox',
  '--disable-dev-shm-usage',
] as const;

describe('public Lighthouse CI config', () => {
  it('uses a Chrome 148-compatible Lighthouse engine for LHCI', () => {
    const rootPackage = JSON.parse(readFileSync(rootPackagePath, 'utf8')) as {
      pnpm?: {
        overrides?: Record<string, string>;
      };
    };

    expect(rootPackage.pnpm?.overrides?.['@lhci/cli>lighthouse']).toBe(
      '13.4.1'
    );
  });

  it('uses settings.chromeFlags for CI-stable Chrome launch to avoid DevTools protocol timeouts', () => {
    const config = JSON.parse(readFileSync(publicLaunchConfigPath, 'utf8')) as {
      ci?: {
        collect?: {
          settings?: {
            chromeFlags?: string;
          };
        };
      };
    };

    const chromeFlags = config.ci?.collect?.settings?.chromeFlags ?? '';

    for (const requiredFlag of REQUIRED_CHROME_FLAGS) {
      expect(
        chromeFlags,
        `settings.chromeFlags must contain "${requiredFlag}" (puppeteerLaunchOptions only applies with puppeteerScript)`
      ).toContain(requiredFlag);
    }
  });
});
