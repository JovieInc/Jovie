/**
 * Repo license hygiene guardrails (JovieInc/Jovie#10987).
 *
 * These tests ensure the public repo never accidentally re-grows
 * open-source contribution signals or permissive license claims.
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const testDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(testDir, '..', '..', '..', '..', '..');

function readFile(relative: string): string {
  return readFileSync(resolve(repoRoot, relative), 'utf8');
}

describe('repo license hygiene', () => {
  it('LICENSE is proprietary (not MIT/Apache/GPL)', () => {
    const license = readFile('LICENSE');
    expect(license).toContain('Jovie Technology Inc.');
    expect(license).not.toMatch(/MIT License/i);
    expect(license).not.toMatch(/Apache License/i);
    expect(license).not.toMatch(/GNU (General|Lesser) Public License/i);
  });

  it('README Contributing section does not invite forking', () => {
    const readme = readFile('README.md');
    const contributingSection = readme.slice(readme.indexOf('## Contributing'));
    // "Fork the repository" is an OSS-contribution signal — must not appear
    expect(contributingSection).not.toMatch(/\bfork\b the repository/i);
  });

  it('README notes public-for-CI-only status', () => {
    const readme = readFile('README.md');
    expect(readme).toMatch(
      /public.*only.*CI minutes|CI minutes.*public.*only/i
    );
  });

  it('CONTRIBUTING.md does not present as an open-source project', () => {
    const contributing = readFile('CONTRIBUTING.md');
    // Must declare internal-only at the top
    expect(contributing).toMatch(/Internal team only/i);
    // Must not tell contributors to push to their fork
    expect(contributing).not.toMatch(/push.*your fork/i);
    // CLA for external contributors is gone
    expect(contributing).not.toMatch(/Contributor License Agreement \(CLA\)/i);
  });

  it('REPO-POLICY.md exists and describes the public-for-CI constraint', () => {
    expect(existsSync(resolve(repoRoot, 'docs/REPO-POLICY.md'))).toBe(true);
    const policy = readFile('docs/REPO-POLICY.md');
    expect(policy).toMatch(/public.*CI minutes|CI minutes.*public/i);
    expect(policy).toMatch(/must never land/i);
    expect(policy).toMatch(/Jovie Technology Inc/i);
  });

  it('first-party workspace package.json files have no permissive license field', () => {
    const workspacePackages = [
      'package.json',
      'apps/web/package.json',
      'packages/ui/package.json',
      'packages/auth-routing/package.json',
      'packages/extension-contracts/package.json',
    ];

    const permissiveSpdx =
      /^(MIT|Apache-2\.0|BSD-[23]-Clause|ISC|MPL-2\.0|CC0)$/i;

    for (const rel of workspacePackages) {
      const pkgPath = resolve(repoRoot, rel);
      if (!existsSync(pkgPath)) continue;
      const pkg = JSON.parse(readFileSync(pkgPath, 'utf8')) as {
        license?: string;
      };
      if (pkg.license) {
        expect(
          pkg.license,
          `${rel} must not carry a permissive OSS license identifier`
        ).not.toMatch(permissiveSpdx);
      }
    }
  });
});
