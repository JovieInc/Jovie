// @vitest-environment node
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { findRepoRoot } from './nightly-test-agent-root';

const temporaryDirs: string[] = [];
function fixture(): string {
  const root = mkdtempSync(path.join(tmpdir(), 'nightly-root-'));
  temporaryDirs.push(root);
  return root;
}
function file(root: string, name: string, content = ''): void {
  const target = path.join(root, name);
  mkdirSync(path.dirname(target), { recursive: true });
  writeFileSync(target, content);
}
afterEach(() => {
  for (const dir of temporaryDirs.splice(0))
    rmSync(dir, { recursive: true, force: true });
  vi.resetModules();
});

describe('nightly agent repository discovery', () => {
  it('walks past package-local agent instructions to the workspace root', () => {
    const root = fixture();
    file(root, 'package.json', '{}');
    file(root, 'pnpm-workspace.yaml', 'packages: [apps/*]');
    file(root, 'AGENTS.md');
    file(root, 'apps/web/package.json', '{}');
    file(root, 'apps/web/AGENTS.md');
    mkdirSync(path.join(root, 'apps/web/scripts'));
    expect(findRepoRoot(path.join(root, 'apps/web/scripts'))).toBe(root);
    expect(findRepoRoot(root)).toBe(root);
  });

  it('does not depend on agent instruction files or a .git directory', () => {
    const root = fixture();
    file(root, 'package.json', '{}');
    file(root, 'pnpm-workspace.yaml', 'packages: [apps/*]');
    expect(findRepoRoot(root)).toBe(root);
  });

  it('fails clearly when no workspace root exists', () => {
    const root = fixture();
    file(root, 'package.json', '{}');
    file(root, 'AGENTS.md');
    expect(() => findRepoRoot(root)).toThrow(
      `Unable to locate repo root from ${root}`
    );
  });

  it('rejects a workspace marker without its package manifest', () => {
    const root = fixture();
    file(root, 'pnpm-workspace.yaml', 'packages: []');
    expect(() => findRepoRoot(root)).toThrow('Unable to locate repo root');
  });

  it('builds real manifest context and targets at repository-relative output paths', async () => {
    const repoRoot = path.resolve(
      path.dirname(fileURLToPath(import.meta.url)),
      '../../..'
    );
    const relativeOutput = `apps/web/test-results/nightly-agent/root-regression-${process.pid}`;
    const absoluteOutput = path.join(repoRoot, relativeOutput);
    temporaryDirs.push(absoluteOutput);
    const originalArgv = process.argv;
    try {
      for (const command of ['context', 'select']) {
        process.argv = [
          'node',
          'nightly-test-agent.ts',
          command,
          '--',
          '--out',
          relativeOutput,
        ];
        await import('./nightly-test-agent');
        vi.resetModules();
      }
      const manifest = JSON.parse(
        readFileSync(
          path.join(
            repoRoot,
            '.agents/skills/nightly-test-agent/manifests.json'
          ),
          'utf8'
        )
      );
      const context = JSON.parse(
        readFileSync(path.join(absoluteOutput, 'context.json'), 'utf8')
      );
      const targets = JSON.parse(
        readFileSync(path.join(absoluteOutput, 'selected-targets.json'), 'utf8')
      );
      expect(context.repo).toBe('jovie');
      expect(context.profile).toEqual(manifest.repos.jovie);
      expect(context.riskItems.length).toBeGreaterThan(0);
      expect(targets.repo).toBe('jovie');
      expect(targets.selectedTargets.length).toBeGreaterThan(0);
      expect(existsSync(path.join(repoRoot, 'apps/web', relativeOutput))).toBe(
        false
      );
    } finally {
      process.argv = originalArgv;
    }
  });
});
