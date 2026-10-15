import { spawnSync } from 'node:child_process';
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  TRUSTED_SIZE_BOOTSTRAP_BASE,
  validateSizeGuardBootstrapWorkflow,
} from '../merge-group-size-bootstrap-contract.mjs';

const workflow = readFileSync(
  resolve(import.meta.dirname, '../../../.github/workflows/pr-size-guard.yml'),
  'utf8'
);

function errorsAfter(replacement, value) {
  return validateSizeGuardBootstrapWorkflow(
    workflow.replace(replacement, value)
  );
}

describe('merge-group size trusted bootstrap contract', () => {
  it('accepts the exact reviewed workflow', () => {
    expect(validateSizeGuardBootstrapWorkflow(workflow)).toEqual([]);
  });

  it('fails closed on a wrong or broadened bootstrap base', () => {
    expect(
      errorsAfter(TRUSTED_SIZE_BOOTSTRAP_BASE, 'f'.repeat(40))
    ).not.toEqual([]);
    expect(errorsAfter('base_sha ==', 'base_sha !=')).not.toEqual([]);
  });

  it('fails closed when checkout credentials persist or candidate code can run', () => {
    expect(
      errorsAfter('persist-credentials: false', 'persist-credentials: true')
    ).not.toEqual([]);
    expect(
      errorsAfter(
        "ref: ${{ github.event.merge_group.base_sha == '7641ffa76d03326542541c62080735c28190a1f0' && '7641ffa76d03326542541c62080735c28190a1f0' || 'main' }}",
        'ref: ${{ github.event.merge_group.head_sha }}'
      )
    ).not.toEqual([]);
    expect(
      errorsAfter(
        'node scripts/lib/merge-group-member-policy.mjs --policy=size',
        'node "$BOOTSTRAP_HEAD/scripts/policy.mjs"'
      )
    ).not.toEqual([]);
  });

  it.each([
    'echo candidate',
    'curl example.com',
    'python leak.py',
    'gh api /user',
  ])(
    'fails closed when an extra token-bearing command is inserted: %s',
    command => {
      expect(
        errorsAfter(
          '          set -euo pipefail\n          [[ "$BOOTSTRAP_HEAD"',
          `          set -euo pipefail\n          ${command}\n          [[ "$BOOTSTRAP_HEAD"`
        )
      ).not.toEqual([]);
    }
  );

  it('fails closed on missing command-scoped auth or leaked token argv', () => {
    expect(errorsAfter('GH_TOKEN: ${{ github.token }}', '')).not.toEqual([]);
    expect(errorsAfter('GIT_CONFIG_VALUE_0="$AUTH_HEADER"', '')).not.toEqual(
      []
    );
    expect(
      errorsAfter(
        'git fetch --refetch',
        'git -c http.extraheader="$GH_TOKEN" fetch --refetch'
      )
    ).not.toEqual([]);
  });

  it('fails closed when the aggregate timeout or cleanup is removed', () => {
    expect(
      errorsAfter('timeout --kill-after=5s 40s', 'timeout 45s')
    ).not.toEqual([]);
    expect(
      errorsAfter("trap 'unset AUTH_HEADER GH_TOKEN' EXIT", '')
    ).not.toEqual([]);
  });

  it('fails closed when normal policy can double-run on the bootstrap base', () => {
    expect(
      errorsAfter(
        `github.event.merge_group.base_sha != '${TRUSTED_SIZE_BOOTSTRAP_BASE}'`,
        "github.event_name == 'merge_group'"
      )
    ).not.toEqual([]);
  });
});

function bootstrapScript() {
  return workflow
    .split('      - name: Run exact-base bootstrap size policy')[1]
    .split('        run: |\n')[1]
    .split('\n      - name:')[0]
    .split('\n')
    .map(line => (line.startsWith('          ') ? line.slice(10) : line))
    .join('\n');
}

describe('executed trusted bootstrap boundary', () => {
  function run({
    head = 'a'.repeat(40),
    failFetch = false,
    slowFetch = false,
  } = {}) {
    const root = mkdtempSync(join(tmpdir(), 'trusted-size-bootstrap-'));
    const bin = join(root, 'bin');
    mkdirSync(bin);
    const log = join(root, 'calls');
    try {
      const guard = `#!/bin/bash
set -eu
[[ "$GIT_CONFIG_COUNT" == 2 && "$GIT_CONFIG_KEY_0" == http.https://github.com/.extraheader ]]
[[ "$GIT_CONFIG_VALUE_0" == "AUTHORIZATION: basic $(printf 'x-access-token:%s' "$GH_TOKEN" | base64 | tr -d '\\n')" ]]
[[ "$GIT_CONFIG_KEY_1" == core.hooksPath && "$GIT_CONFIG_VALUE_1" == /dev/null ]]
[[ "$GIT_TERMINAL_PROMPT" == 0 && "$GCM_INTERACTIVE" == never && "$GIT_LFS_SKIP_SMUDGE" == 1 ]]
printf '%s\\n' "$(basename "$0") $*" >> "$CALL_LOG"
`;
      writeFileSync(
        join(bin, 'git'),
        guard + (slowFetch ? 'sleep 5\n' : failFetch ? 'exit 23\n' : 'exit 0\n')
      );
      writeFileSync(
        join(bin, 'node'),
        guard +
          '[[ "$*" == "scripts/lib/merge-group-member-policy.mjs --policy=size" ]]\n'
      );
      for (const name of ['git', 'node']) chmodSync(join(bin, name), 0o700);
      let script = bootstrapScript();
      // Shorten only the fixture clock; execute the same timeout process boundary.
      if (slowFetch) script = script.replace('40s', '0.2s');
      const result = spawnSync('/bin/bash', ['--noprofile', '--norc'], {
        input: script,
        cwd: root,
        encoding: 'utf8',
        timeout: 10000,
        env: {
          ...process.env,
          PATH: `${bin}${delimiter}${process.env.PATH}`,
          GH_TOKEN: 'synthetic-test-token',
          BOOTSTRAP_HEAD: head,
          CALL_LOG: log,
        },
      });
      let calls = '';
      try {
        calls = readFileSync(log, 'utf8');
      } catch {}
      expect(result.stdout + result.stderr + calls).not.toContain(
        'synthetic-test-token'
      );
      return { result, calls };
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }

  it('loads the complete policy dependency closure from the pinned protected base', () => {
    const root = mkdtempSync(join(tmpdir(), 'trusted-policy-closure-'));
    try {
      const entries = workflow
        .split('  merge-group-size:')[1]
        .split('sparse-checkout: |\n')[1]
        .split('          sparse-checkout-cone-mode:')[0]
        .trim()
        .split('\n')
        .map(line => line.trim());
      mkdirSync(join(root, 'scripts/lib'), { recursive: true });
      for (const path of entries) {
        const source = spawnSync(
          'git',
          ['show', `${TRUSTED_SIZE_BOOTSTRAP_BASE}:${path}`],
          { encoding: 'utf8' }
        );
        if (source.status !== 0) {
          // Main-only additions are not on the pinned one-flight base.
          // The policy that base runs does not import them.
          expect(source.stderr).toContain(path);
          continue;
        }
        writeFileSync(join(root, path), source.stdout);
      }
      const result = spawnSync(
        process.execPath,
        [
          '--input-type=module',
          '-e',
          "await import('./scripts/lib/merge-group-member-policy.mjs')",
        ],
        { cwd: root, encoding: 'utf8' }
      );
      expect(result.status, result.stderr).toBe(0);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('authenticates hydration and trusted policy inside the same no-prompt boundary', () => {
    const { result, calls } = run();
    expect(result.status, result.stderr).toBe(0);
    expect(calls.trim().split('\n')).toEqual([
      `git fetch --refetch --filter=blob:limit=1g --no-tags --depth=1 origin ${'a'.repeat(40)}`,
      'node scripts/lib/merge-group-member-policy.mjs --policy=size',
    ]);
  });
  it('rejects invalid heads before any authenticated process runs', () => {
    const { result, calls } = run({ head: '--upload-pack=bad' });
    expect(result.status).not.toBe(0);
    expect(calls).toBe('');
  });
  it('does not run policy after failed hydration', () => {
    const { result, calls } = run({ failFetch: true });
    expect(result.status).toBe(23);
    expect(calls).not.toContain('node ');
  });
  it('terminates stalled hydration without running policy', () => {
    const { result, calls } = run({ slowFetch: true });
    expect(result.status).toBe(124);
    expect(calls).not.toContain('node ');
  });
});

describe('merge-group tree fetch depth', () => {
  function normalScript() {
    return workflow
      .split(
        '      - name: Enforce combined-tree payload and member size policy'
      )[1]
      .split('        run: |\n')[1]
      .split('\n  merge-group-fork:')[0]
      .split('\n')
      .map(line => (line.startsWith('          ') ? line.slice(10) : line))
      .join('\n');
  }

  function runFetch({ presentAfterDepth2 }) {
    const root = mkdtempSync(join(tmpdir(), 'size-tree-fetch-'));
    const bin = join(root, 'bin');
    mkdirSync(join(root, 'scripts/lib'), { recursive: true });
    mkdirSync(bin);
    writeFileSync(join(root, 'scripts/lib/merge-group-local-evidence.mjs'), '');
    const log = join(root, 'calls');
    const head = 'a'.repeat(40);
    const git = `#!/bin/bash
set -eu
printf '%s\\n' "$*" >> "$CALL_LOG"
if [[ "$1" == cat-file ]]; then
  if [[ -f "$ROOT/have-commit" ]]; then exit 0; fi
  exit 1
fi
if [[ "$*" == *--depth=2* ]]; then
  if [[ "$PRESENT_AFTER_DEPTH_2" == 1 ]]; then touch "$ROOT/have-commit"; fi
fi
exit 0
`;
    writeFileSync(join(bin, 'git'), git);
    writeFileSync(
      join(bin, 'node'),
      '#!/bin/bash\nprintf \'%s\\n\' "node $*" >> "$CALL_LOG"\nexit 0\n'
    );
    chmodSync(join(bin, 'git'), 0o700);
    chmodSync(join(bin, 'node'), 0o700);
    try {
      const result = spawnSync('/bin/bash', ['--noprofile', '--norc'], {
        input: normalScript(),
        cwd: root,
        encoding: 'utf8',
        timeout: 15000,
        env: {
          ...process.env,
          PATH: `${bin}${delimiter}${process.env.PATH}`,
          GH_TOKEN: 'synthetic-test-token',
          GROUP_HEAD: head,
          GROUP_BASE: 'b'.repeat(40),
          MERGE_GROUP_POLICY_CACHE_DIR: join(root, 'cache'),
          CALL_LOG: log,
          ROOT: root,
          PRESENT_AFTER_DEPTH_2: presentAfterDepth2 ? '1' : '0',
        },
      });
      let calls = '';
      try {
        calls = readFileSync(log, 'utf8');
      } catch {}
      return { result, calls };
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }

  it('does not cat-file the group commit before measuring bytes', () => {
    const ran = runFetch({ presentAfterDepth2: true });
    expect(ran.result.status, ran.result.stderr).toBe(0);
    expect(ran.calls).toContain(
      'fetch --refetch --filter=blob:limit=1g --no-tags --depth=2 origin'
    );
    expect(ran.calls).toContain(
      'node scripts/lib/merge-group-local-evidence.mjs'
    );
    expect(ran.calls).not.toContain('--depth=64');
    expect(ran.calls).not.toContain('cat-file');
    expect(ran.calls).not.toContain('blob:none');
  });
});
