import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const testDir = dirname(fileURLToPath(import.meta.url));
const configPath = resolve(
  testDir,
  '..',
  '..',
  '..',
  '.lighthouserc.public-launch.json'
);

type PublicLighthouseConfig = {
  readonly ci: {
    readonly collect: {
      readonly settings: {
        readonly protocolTimeout?: number;
        readonly skipAudits?: readonly string[];
      };
    };
  };
};

describe('public Lighthouse CI config', () => {
  it('allows heavy public profile pages to finish DevTools collection', () => {
    const config = JSON.parse(
      readFileSync(configPath, 'utf8')
    ) as PublicLighthouseConfig;

    expect(config.ci.collect.settings.protocolTimeout).toBeGreaterThanOrEqual(
      120_000
    );
    expect(config.ci.collect.settings.skipAudits).toContain('font-size');
  });
});
