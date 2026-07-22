import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('authenticated performance entrypoints', () => {
  it('keeps every package script target present', () => {
    const webRoot = resolve(import.meta.dirname, '..');
    const packageJson = JSON.parse(
      readFileSync(resolve(webRoot, 'package.json'), 'utf8')
    ) as { scripts: Record<string, string> };
    const commandNames = [
      'perf:auth',
      'test:lighthouse:dashboard:pr',
      'test:lighthouse:onboarding:pr',
      'test:lighthouse:admin:pr',
      'test:lighthouse:chat:pr',
    ];

    for (const commandName of commandNames) {
      const command = packageJson.scripts[commandName];
      expect(command, `missing script: ${commandName}`).toBeDefined();
      const scriptTargets = command.match(/scripts\/[\w.-]+/g) ?? [];
      expect(scriptTargets, commandName).not.toHaveLength(0);
      for (const scriptTarget of scriptTargets) {
        expect(existsSync(resolve(webRoot, scriptTarget)), commandName).toBe(
          true
        );
      }
    }
  });

  it('loads the Lighthouse bootstrap as a Puppeteer hook', () => {
    const require = createRequire(import.meta.url);
    const hook = require('./lighthouse-dashboard-auth.cjs');
    expect(hook).toBeTypeOf('function');
  });
});
