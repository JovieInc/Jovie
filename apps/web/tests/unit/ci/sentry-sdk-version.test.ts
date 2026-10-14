import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const testDir = dirname(fileURLToPath(import.meta.url));
const appWebRoot = resolve(testDir, '..', '..', '..');
const webRequire = createRequire(resolve(appWebRoot, 'package.json'));

function majorMinor(version: string): [number, number] {
  const [major = '0', minor = '0'] = version.split('.');
  return [Number(major), Number(minor)];
}

describe('@sentry/nextjs pinned floor', () => {
  const manifest = JSON.parse(
    readFileSync(resolve(appWebRoot, 'package.json'), 'utf8')
  ) as { dependencies: Record<string, string> };

  it('declares a caret range at or above ^11.2.0 so dependabot cannot silently downgrade', () => {
    const declared = manifest.dependencies['@sentry/nextjs'];
    expect(declared).toMatch(/^\^\d+\.\d+\.\d+$/);
    const [major, minor] = majorMinor(declared.slice(1));
    expect(major).toBeGreaterThanOrEqual(11);
    if (major === 11) {
      expect(minor).toBeGreaterThanOrEqual(2);
    }
  });

  it('resolves an installed SDK at or above the 11.2.0 floor', () => {
    const installed = webRequire('@sentry/nextjs/package.json') as {
      version: string;
    };
    const [major, minor] = majorMinor(installed.version);
    expect(major).toBeGreaterThanOrEqual(11);
    if (major === 11) {
      expect(minor).toBeGreaterThanOrEqual(2);
    }
  });
});
