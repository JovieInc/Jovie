import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const pilotRoot = process.cwd();

describe('Eve installation contract', () => {
  it('keeps runtime pins synchronized and bundled docs discoverable', () => {
    const packageJson = JSON.parse(
      readFileSync(resolve(pilotRoot, 'package.json'), 'utf8')
    ) as {
      packageManager?: string;
      dependencies?: { ai?: string; eve?: string; microsandbox?: string };
    };
    const lockfile = readFileSync(resolve(pilotRoot, 'pnpm-lock.yaml'), 'utf8');

    // Keep this pin in lockstep with the package.json dependency; dependabot
    // bumps edit the manifest but not this test.
    const EVE_PIN = '0.70.0';

    expect(packageJson.packageManager).toBe('pnpm@9.15.9');
    expect(packageJson.dependencies?.eve).toBe(EVE_PIN);
    expect(lockfile).toContain(
      `      ai:\n        specifier: ${packageJson.dependencies?.ai}\n`
    );
    expect(lockfile).toContain(`  ai@${packageJson.dependencies?.ai}:`);
    expect(packageJson.dependencies?.microsandbox).toBe('0.7.6');
    expect(lockfile).toContain(
      `      microsandbox:\n        specifier: ${packageJson.dependencies?.microsandbox}\n        version: ${packageJson.dependencies?.microsandbox}\n`
    );
    expect(lockfile).toContain(
      `  microsandbox@${packageJson.dependencies?.microsandbox}:`
    );
    expect(lockfile).toContain(
      `      '@microsandbox/types': ${packageJson.dependencies?.microsandbox}`
    );
    expect(
      existsSync(resolve(pilotRoot, 'node_modules/eve/docs/README.md'))
    ).toBe(true);
    expect(existsSync(resolve(pilotRoot, 'agent/instructions.md'))).toBe(true);
    expect(existsSync(resolve(pilotRoot, 'agent/channels/eve.ts'))).toBe(true);
    expect(existsSync(resolve(pilotRoot, 'agent/channels/telegram.ts'))).toBe(
      true
    );
    expect(existsSync(resolve(pilotRoot, 'agent/channels/photon.ts'))).toBe(
      true
    );
    expect(
      readFileSync(
        resolve(pilotRoot, 'agent/tools/jovie_capability_manifest.ts'),
        'utf8'
      )
    ).toContain("'core_chat'");
  });
});
