import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const pilotRoot = process.cwd();

describe('Eve installation contract', () => {
  it('keeps the pinned Eve runtime and bundled docs discoverable', () => {
    const packageJson = JSON.parse(
      readFileSync(resolve(pilotRoot, 'package.json'), 'utf8')
    ) as {
      dependencies?: { eve?: string };
    };

    expect(packageJson.dependencies?.eve).toBe('0.27.8');
    expect(
      existsSync(resolve(pilotRoot, 'node_modules/eve/docs/README.md'))
    ).toBe(true);
    expect(existsSync(resolve(pilotRoot, 'agent/instructions.md'))).toBe(true);
    expect(existsSync(resolve(pilotRoot, 'agent/channels/eve.ts'))).toBe(true);
    expect(
      readFileSync(
        resolve(pilotRoot, 'agent/tools/jovie_capability_manifest.ts'),
        'utf8'
      )
    ).toContain("'core_chat'");
  });
});
