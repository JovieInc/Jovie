import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { classifyProductLanes } from '../product-lane-classifier.mjs';
import {
  applyRelocationPlan,
  insertWorkspaceGlob,
  parseUnmappedPaths,
  planUnmappedPackageRelocation,
  rewriteTsconfigExtends,
} from '../unmapped-package-relocation.mjs';

const tempRoots = [];
afterEach(() => {
  for (const root of tempRoots.splice(0))
    rmSync(root, { recursive: true, force: true });
});

const WORKSPACE =
  "packages:\n  - 'apps/*'\n  - '!apps/eve-pilot'\n  - 'packages/*'\n";

function classify(paths) {
  classifyProductLanes(paths);
}

describe('unmapped package relocation', () => {
  it('parses the product-lane unmapped-path error', () => {
    expect(
      parseUnmappedPaths(
        'Product lane classification failed: Unmapped changed paths: packages/shipping-state-contracts/package.json, packages/shipping-state-contracts/index.ts. Add an explicit product-lane rule before intake can continue.'
      )
    ).toEqual([
      'packages/shipping-state-contracts/package.json',
      'packages/shipping-state-contracts/index.ts',
    ]);
  });

  it('leaves a diff that the trusted classifier already accepts', () => {
    expect(
      planUnmappedPackageRelocation({
        changedPaths: ['apps/web/app/page.tsx', 'scripts/example.mjs'],
        classify,
        workspaceYaml: WORKSPACE,
      })
    ).toEqual({ action: 'none' });
  });

  it('moves one new packages tree under apps/web when that prefix classifies', () => {
    const plan = planUnmappedPackageRelocation({
      changedPaths: [
        'apps/web/package.json',
        'packages/shipping-state-contracts/package.json',
        'packages/shipping-state-contracts/index.ts',
        'pnpm-lock.yaml',
        'scripts/lockfile-specifier-preflight.mjs',
      ],
      classify,
      workspaceYaml: WORKSPACE,
    });
    expect(plan).toMatchObject({
      action: 'relocate',
      packageName: 'shipping-state-contracts',
      fromDir: 'packages/shipping-state-contracts',
      toDir: 'apps/web/packages/shipping-state-contracts',
      glob: 'apps/web/packages/*',
    });
    expect(plan.nextPaths).toContain(
      'apps/web/packages/shipping-state-contracts/index.ts'
    );
    expect(plan.nextPaths).not.toContain(
      'packages/shipping-state-contracts/index.ts'
    );
    expect(() => classify(plan.nextPaths)).not.toThrow();
  });

  it('does not add a workspace glob that is already present', () => {
    const plan = planUnmappedPackageRelocation({
      changedPaths: ['packages/shipping-state-contracts/package.json'],
      classify,
      workspaceYaml: `${WORKSPACE}  - 'apps/web/packages/*'\n`,
    });
    expect(plan.glob).toBeNull();
  });

  it('blocks a diff that is not exactly one new workspace package', () => {
    expect(
      planUnmappedPackageRelocation({
        changedPaths: ['packages/a/package.json', 'packages/b/package.json'],
        classify,
        workspaceYaml: WORKSPACE,
      })
    ).toMatchObject({
      action: 'blocked',
      reason: 'unmapped paths span 2 workspace packages',
    });
    expect(
      planUnmappedPackageRelocation({
        changedPaths: ['vendor/unknown.txt'],
        classify,
        workspaceYaml: WORKSPACE,
      }).reason
    ).toContain('vendor/unknown.txt');
    expect(
      planUnmappedPackageRelocation({
        changedPaths: ['packages/only-src/index.ts'],
        classify,
        workspaceYaml: WORKSPACE,
      }).reason
    ).toContain('package.json is not in the unmapped set');
  });

  it('blocks when the rewritten paths are still unmapped', () => {
    const plan = planUnmappedPackageRelocation({
      changedPaths: ['packages/shipping-state-contracts/package.json'],
      classify(paths) {
        const relocated = paths.some(path => path.startsWith('apps/web/'));
        const listed = relocated
          ? paths
          : ['packages/shipping-state-contracts/package.json'];
        throw new Error(
          `Unmapped changed paths: ${listed.join(', ')}. Add an explicit product-lane rule before intake can continue.`
        );
      },
      workspaceYaml: WORKSPACE,
    });
    expect(plan.action).toBe('blocked');
    expect(plan.reason).toContain('apps/web/packages/shipping-state-contracts');
  });

  it('rewrites a root tsconfig extends to the destination depth', () => {
    const source = '{\n  "extends": "../../tsconfig.json"\n}\n';
    expect(
      rewriteTsconfigExtends(
        source,
        'packages/shipping-state-contracts',
        'apps/web/packages/shipping-state-contracts'
      )
    ).toBe('{\n  "extends": "../../../../tsconfig.json"\n}\n');
    expect(rewriteTsconfigExtends(source, 'packages/a', 'packages/a')).toBe(
      source
    );
    expect(
      rewriteTsconfigExtends(
        '{ "extends": "../../other.json" }\n',
        'packages/a',
        'apps/web/packages/a'
      )
    ).toBe('{ "extends": "../../other.json" }\n');
  });

  it('inserts the nested workspace glob once, after apps/*', () => {
    const once = insertWorkspaceGlob(WORKSPACE, 'apps/web/packages/*');
    expect(once).toContain("  - 'apps/*'\n  - 'apps/web/packages/*'\n");
    expect(insertWorkspaceGlob(once, 'apps/web/packages/*')).toBe(once);
  });

  it('applies the plan by moving the package and patching workspace files', () => {
    const root = mkdtempSync(join(tmpdir(), 'jovie-unmapped-package-'));
    tempRoots.push(root);
    writeFileSync(join(root, 'pnpm-workspace.yaml'), WORKSPACE);
    const fromDir = 'packages/shipping-state-contracts';
    mkdirSync(join(root, fromDir), { recursive: true });
    writeFileSync(
      join(root, fromDir, 'tsconfig.json'),
      '{ "extends": "../../tsconfig.json" }\n'
    );
    const plan = {
      action: 'relocate',
      fromDir,
      toDir: 'apps/web/packages/shipping-state-contracts',
      glob: 'apps/web/packages/*',
    };
    applyRelocationPlan({
      root,
      plan,
      move(from, to) {
        mkdirSync(join(root, to), { recursive: true });
        writeFileSync(
          join(root, to, 'tsconfig.json'),
          readFileSync(join(root, from, 'tsconfig.json'), 'utf8')
        );
        rmSync(join(root, from), { recursive: true, force: true });
      },
    });
    expect(readFileSync(join(root, 'pnpm-workspace.yaml'), 'utf8')).toContain(
      "'apps/web/packages/*'"
    );
    expect(
      readFileSync(join(root, plan.toDir, 'tsconfig.json'), 'utf8')
    ).toContain('../../../../tsconfig.json');
  });
});
