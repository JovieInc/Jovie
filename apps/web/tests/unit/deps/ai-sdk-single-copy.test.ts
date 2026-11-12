import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

// @ai-sdk/react pins an exact `ai` version. When apps/web resolves a different
// `ai`, the browser gets two copies of ai, @ai-sdk/gateway and
// @ai-sdk/provider-utils (about 140 KB of JS on /start and every chat
// surface). Bump `ai` and `@ai-sdk/react` together so they share one copy.
const repoRoot = resolve(import.meta.dirname, '../../../../..');
const lockfile = readFileSync(resolve(repoRoot, 'pnpm-lock.yaml'), 'utf8');

function stripPeers(version: string): string {
  return version.split('(')[0] ?? version;
}

function webImporterVersion(name: string): string {
  const importer = lockfile.split('\n  apps/web:\n')[1]?.split('\n\n')[0];
  const quoted = name.includes('/') ? `'${name}'` : name;
  const match = importer?.match(
    new RegExp(
      `\\n      ${quoted}:\\n        specifier: [^\\n]+\\n        version: ([^\\n]+)`
    )
  );
  if (!match?.[1]) throw new Error(`apps/web has no ${name} in pnpm-lock.yaml`);
  return stripPeers(match[1]);
}

function snapshotDependency(pkg: string, dependency: string): string {
  const snapshots = lockfile.split('\nsnapshots:\n')[1] ?? '';
  const block = snapshots
    .split('\n\n')
    .find(
      entry => entry.startsWith(`  '${pkg}(`) || entry.startsWith(`  '${pkg}':`)
    );
  const match = block?.match(new RegExp(`\\n      ${dependency}: ([^\\n]+)`));
  if (!match?.[1])
    throw new Error(`${pkg} has no ${dependency} in pnpm-lock.yaml`);
  return stripPeers(match[1]);
}

describe('AI SDK client copies', () => {
  it('resolves the same ai version for apps/web and @ai-sdk/react', () => {
    const reactVersion = webImporterVersion('@ai-sdk/react');
    const webAi = webImporterVersion('ai');
    const reactAi = snapshotDependency(`@ai-sdk/react@${reactVersion}`, 'ai');

    expect(reactAi).toBe(webAi);
  });
});
