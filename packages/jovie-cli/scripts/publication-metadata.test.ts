import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

type PackageManifest = {
  readonly bin?: { readonly jovie?: unknown };
  readonly engines?: { readonly node?: unknown };
  readonly files?: readonly unknown[];
  readonly license?: unknown;
  readonly name?: unknown;
  readonly private?: unknown;
  readonly publishConfig?: {
    readonly access?: unknown;
    readonly provenance?: unknown;
    readonly registry?: unknown;
  };
  readonly scripts?: { readonly 'test:fast'?: unknown };
};

function readManifest(): PackageManifest {
  return JSON.parse(
    readFileSync(join(packageRoot, 'package.json'), 'utf8')
  ) as PackageManifest;
}

describe('public CLI publication metadata', () => {
  it('declares a public Apache-2.0 Node 22 package with provenance', () => {
    const manifest = readManifest();

    expect(manifest).toMatchObject({
      name: '@jovie/cli',
      private: false,
      license: 'Apache-2.0',
      publishConfig: {
        access: 'public',
        provenance: true,
        registry: 'https://registry.npmjs.org',
      },
      bin: { jovie: './dist/cli.js' },
      engines: { node: '>=22.23.2 <23' },
    });
    expect(manifest.files).toEqual(
      expect.arrayContaining(['dist', 'README.md', 'LICENSE'])
    );
  });

  it('ships the package license and truthful install/help guidance', () => {
    const license = readFileSync(join(packageRoot, 'LICENSE'), 'utf8');
    const readme = readFileSync(join(packageRoot, 'README.md'), 'utf8');

    expect(license).toContain('Copyright 2026 Jovie Technology Inc.');
    expect(license).toContain('Apache License');
    expect(license).toContain('http://www.apache.org/licenses/LICENSE-2.0');
    expect(readme).toContain('npm install --global @jovie/cli');
    expect(readme).toContain('jovie --help');
    expect(readme).toContain('jovie --version');
    expect(readme).toContain('artist get <username>');
  });

  it('leaves CI-injected singleton test flags to the caller', () => {
    const manifest = readManifest();
    const testFast = manifest.scripts?.['test:fast'];

    expect(testFast).toBe('vitest run');
    expect(testFast).not.toContain('--passWithNoTests');
  });
});
