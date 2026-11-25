import { spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  actionStep,
  coldHosted,
  evaluateCondition,
  setupAction,
} from './runner-setup-fixture';

export function registerPreparedWorkspaceTests() {
  describe('prepared Dashboard workspace', () => {
    const temporaryRoots: string[] = [];
    afterEach(() => {
      for (const root of temporaryRoots.splice(0))
        rmSync(root, { recursive: true, force: true });
    });

    it('only prefers the prepared workspace on an opted-in hosted merge-group exact hit', () => {
      const eligible = {
        ...coldHosted,
        'github.event_name': 'merge_group',
        'inputs.prefer_prepared_workspace': 'true',
        'steps.node-modules-cache.outputs.cache-hit': 'true',
      };
      const expression = actionStep('Install dependencies').env
        ?.USE_PREPARED_WORKSPACE;
      expect(setupAction.inputs.prefer_prepared_workspace?.default).toBe(
        'false'
      );
      expect(expression).toBeDefined();
      expect(evaluateCondition(expression, eligible)).toBe(true);
      for (const [key, value] of [
        ['github.event_name', 'workflow_dispatch'],
        ['github.event_name', 'pull_request'],
        ['runner.environment', 'self-hosted'],
        ['inputs.prefer_prepared_workspace', 'false'],
        ['steps.node-modules-cache.outputs.cache-hit', 'false'],
        ['steps.node-modules-cache.outputs.cache-hit', ''],
      ] as const) {
        expect(
          evaluateCondition(expression, { ...eligible, [key]: value })
        ).toBe(false);
      }
    });

    it('validates the prepared workspace and retains frozen install and patch repair on fallback', () => {
      const stamp = actionStep('Stamp installed workspace receipt');
      expect(actionStep('Install dependencies').id).toBe(
        'install-dependencies'
      );
      const install = 'pnpm install --frozen-lockfile';
      const validate = 'node scripts/lib/ci-dependency-workspace.mjs validate';
      const verify = 'node scripts/lib/verify-patched-dependencies.mjs';
      const native = 'load Next native compiler';
      const healthy = {
        eligible: true,
        receipt: 0,
        broken: false,
        tool: 'ready',
        installExit: 0,
      };
      const scenarios = [
        { ...healthy, calls: [validate, native, verify] },
        { ...healthy, tool: 'missing', calls: [validate, install, verify] },
        {
          ...healthy,
          tool: 'native-fails',
          calls: [validate, native, install, verify],
        },
        { ...healthy, eligible: false, calls: [install, verify] },
        { ...healthy, receipt: 1, calls: [validate, install, verify] },
        {
          ...healthy,
          broken: true,
          calls: [validate, native, verify, install, verify, install, verify],
        },
        { ...healthy, receipt: 1, installExit: 17, calls: [validate, install] },
      ];
      const script = String(actionStep('Install dependencies').run)
        .replaceAll(
          '${{ steps.runner-prereqs.outputs.dependencies_warm }}',
          'false'
        )
        .replaceAll(
          /\$\{\{ steps\.runner-prereqs\.outputs\.installed_tree_archive_(path|sha256) \}\}/g,
          'unused'
        );
      for (const scenario of scenarios) {
        const root = mkdtempSync(resolve(tmpdir(), 'jovie-dashboard-install-'));
        temporaryRoots.push(root);
        const cache = resolve(root, 'node_modules');
        mkdirSync(cache);
        if (scenario.broken) writeFileSync(resolve(cache, 'stale'), '');
        const webBin = resolve(root, 'apps/web/node_modules/.bin');
        mkdirSync(webBin, { recursive: true });
        for (const name of [
          'next',
          'next-sitemap',
          'tsx',
          'vitest',
          'playwright',
          'lhci',
        ]) {
          writeFileSync(resolve(webBin, name), '', {
            mode:
              name === 'lhci' && scenario.tool === 'missing' ? 0o644 : 0o755,
          });
        }
        const tools = {
          node: `if [ "$1" = "-e" ]; then
    echo "load Next native compiler" >> "$CALLS"
    exit "$NATIVE_EXIT"
  fi
  echo "node $*" >> "$CALLS"
  if [ "$2" = validate ]; then exit "$RECEIPT"; fi
  [ ! -f node_modules/stale ]`,
          pnpm: 'echo "pnpm $*" >> "$CALLS"\nexit "$INSTALL_EXIT"',
        };
        for (const [tool, body] of Object.entries(tools)) {
          writeFileSync(resolve(root, tool), `#!/bin/sh\n${body}\n`, {
            mode: 0o755,
          });
        }
        const result = spawnSync('bash', ['-eo', 'pipefail', '-c', script], {
          cwd: root,
          encoding: 'utf8',
          env: {
            NODE_ENV: 'test',
            PATH: `${root}${delimiter}${process.env.PATH ?? ''}`,
            CALLS: resolve(root, 'calls'),
            GITHUB_OUTPUT: resolve(root, 'output'),
            NATIVE_EXIT: scenario.tool === 'native-fails' ? '1' : '0',
            USE_PREPARED_WORKSPACE: String(scenario.eligible),
            RECEIPT: String(scenario.receipt),
            INSTALL_EXIT: String(scenario.installExit),
          },
        });
        expect(result.status, result.stderr).toBe(scenario.installExit);
        const output = resolve(root, 'output');
        const reused =
          existsSync(output) &&
          readFileSync(output, 'utf8').trim() ===
            'prepared-workspace-reused=true';
        expect(reused).toBe(!scenario.calls.includes(install));
        expect(
          evaluateCondition(stamp.if, {
            ...coldHosted,
            'github.event_name': 'merge_group',
            'steps.install-dependencies.outputs.prepared-workspace-reused':
              String(reused),
          })
        ).toBe(!reused);
        expect(
          readFileSync(resolve(root, 'calls'), 'utf8').trim().split('\n')
        ).toEqual(scenario.calls);
      }
    });
  });
}
