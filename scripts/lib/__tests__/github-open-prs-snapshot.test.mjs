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
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const SNAPSHOT = fileURLToPath(
  new URL('../../github-open-prs-snapshot.mjs', import.meta.url)
);

describe('open PR snapshot CLI', () => {
  it('bounds and recovers a transient GitHub 502 before returning exact refs', () => {
    const directory = mkdtempSync(join(tmpdir(), 'open-pr-snapshot-'));
    const binPath = join(directory, 'bin');
    const ghPath = join(binPath, 'gh');
    const statePath = join(directory, 'attempts');
    mkdirSync(binPath);
    writeFileSync(
      ghPath,
      [
        '#!/usr/bin/env bash',
        'set -euo pipefail',
        'if [[ "${2:-}" == "graphql" ]]; then',
        '  printf \'%s\\n\' "$MOCK_GRAPHQL_JSON"',
        '  exit 0',
        'fi',
        'attempt=0',
        '[[ -f "$MOCK_STATE" ]] && attempt="$(<"$MOCK_STATE")"',
        'attempt=$((attempt + 1))',
        'printf \'%s\\n\' "$attempt" >"$MOCK_STATE"',
        'if [[ "$attempt" -eq 1 ]]; then',
        "  echo 'HTTP 502: GitHub could not respond' >&2",
        '  exit 1',
        'fi',
        'printf \'%s\\n\' "$MOCK_REST_JSON"',
      ].join('\n')
    );
    chmodSync(ghPath, 0o755);

    const head = 'a'.repeat(40);
    const base = 'b'.repeat(40);
    const rest = [
      {
        number: 17,
        title: 'bounded query',
        html_url: 'https://github.com/JovieInc/Jovie/pull/17',
        user: { login: 'jovie-bot' },
        draft: false,
        base: { ref: 'main', sha: base },
        head: { ref: 'codex/bounded-query', sha: head },
        labels: [],
      },
    ];
    const graphql = {
      data: {
        repository: {
          p0: {
            number: 17,
            baseRefName: 'main',
            baseRefOid: base,
            headRefName: 'codex/bounded-query',
            headRefOid: head,
            headRepository: {
              name: 'Jovie',
              nameWithOwner: 'JovieInc/Jovie',
            },
            headRepositoryOwner: { login: 'JovieInc' },
            isCrossRepository: false,
            mergeable: 'MERGEABLE',
            mergeStateStatus: 'CLEAN',
            autoMergeRequest: null,
            changedFiles: 1,
            additions: 2,
            deletions: 1,
            maintainerCanModify: false,
          },
        },
      },
    };

    try {
      const result = spawnSync(
        process.execPath,
        [SNAPSHOT, '--repo', 'JovieInc/Jovie', '--limit', '1'],
        {
          encoding: 'utf8',
          env: {
            ...process.env,
            MOCK_GRAPHQL_JSON: JSON.stringify(graphql),
            MOCK_REST_JSON: JSON.stringify(rest),
            MOCK_STATE: statePath,
            PATH: `${binPath}:${process.env.PATH}`,
          },
          timeout: 10_000,
        }
      );

      expect(result.status).toBe(0);
      expect(result.stderr).toContain('transient failure; retry 1/5');
      expect(readFileSync(statePath, 'utf8').trim()).toBe('2');
      expect(JSON.parse(result.stdout)).toEqual([
        expect.objectContaining({
          number: 17,
          headRefOid: head,
          baseRefOid: base,
          mergeable: 'MERGEABLE',
        }),
      ]);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
