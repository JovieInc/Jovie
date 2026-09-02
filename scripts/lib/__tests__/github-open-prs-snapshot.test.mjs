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
import { describe, expect, it, vi } from 'vitest';
import {
  formatInventoryFailure,
  ghJson,
  runOpenPrSnapshot,
} from '../../github-open-prs-snapshot.mjs';

const SNAPSHOT = fileURLToPath(
  new URL('../../github-open-prs-snapshot.mjs', import.meta.url)
);

describe('open PR snapshot CLI', () => {
  it('retries transient reads without losing the inventory stage', async () => {
    const execute = vi
      .fn()
      .mockRejectedValueOnce(
        Object.assign(new Error('GitHub could not respond'), {
          stderr: 'HTTP 502: GitHub could not respond',
        })
      )
      .mockResolvedValueOnce({ stdout: '{"ok":true}' });
    const wait = vi.fn().mockResolvedValue(undefined);
    const consoleError = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);
    try {
      await expect(
        ghJson(['api', '--method', 'GET'], {
          execute,
          retries: 2,
          stage: 'rest-enumeration',
          wait,
        })
      ).resolves.toEqual({ ok: true });
      expect(wait).toHaveBeenCalledWith(2000);
      expect(consoleError).toHaveBeenCalledWith(
        expect.stringContaining('stage=rest-enumeration')
      );
    } finally {
      consoleError.mockRestore();
    }
  });

  it('runs REST enumeration and GraphQL hydration as distinct stages', async () => {
    const head = 'a'.repeat(40);
    const base = 'b'.repeat(40);
    const stages = [];
    const githubRequest = vi.fn(async (_args, { stage }) => {
      stages.push(stage);
      if (stage === 'rest-enumeration') {
        return [
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
      }
      return {
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
    });
    const write = vi.fn();

    const result = await runOpenPrSnapshot(
      ['--repo', 'JovieInc/Jovie', '--limit', '1'],
      { githubRequest, write }
    );

    expect(stages).toEqual(['rest-enumeration', 'graphql-hydration']);
    expect(result).toEqual([
      expect.objectContaining({ number: 17, headRefOid: head }),
    ]);
    expect(write).toHaveBeenCalledWith(JSON.stringify(result));
  });

  it('formats terminal failures with a typed stage', async () => {
    const failure = Object.assign(new Error('unauthorized'), {
      stderr: 'HTTP 401: unauthorized',
    });
    await expect(
      ghJson(['api'], {
        execute: vi.fn().mockRejectedValue(failure),
        retries: 1,
        stage: 'graphql-hydration',
      })
    ).rejects.toMatchObject({ inventoryStage: 'graphql-hydration' });
    expect(
      formatInventoryFailure(
        Object.assign(new Error('metadata omitted'), {
          inventoryStage: 'graphql-hydration',
        })
      )
    ).toContain('stage=graphql-hydration metadata omitted');
  });

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
        '  if [[ "${MOCK_GRAPHQL_FAILURE:-0}" == "1" ]]; then',
        "    echo 'GraphQL: Could not resolve pull request metadata' >&2",
        '    exit 1',
        '  fi',
        '  printf \'%s\\n\' "$MOCK_GRAPHQL_JSON"',
        '  exit 0',
        'fi',
        'if [[ "${MOCK_REST_FAILURE:-0}" == "1" ]]; then',
        "  echo 'HTTP 401: unauthorized' >&2",
        '  exit 1',
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
      expect(result.stderr).toContain(
        'stage=rest-enumeration api --method GET transient failure; retry 1/5'
      );
      expect(readFileSync(statePath, 'utf8').trim()).toBe('2');
      expect(JSON.parse(result.stdout)).toEqual([
        expect.objectContaining({
          number: 17,
          headRefOid: head,
          baseRefOid: base,
          mergeable: 'MERGEABLE',
        }),
      ]);

      const restFailure = spawnSync(
        process.execPath,
        [SNAPSHOT, '--repo', 'JovieInc/Jovie', '--limit', '1'],
        {
          encoding: 'utf8',
          env: {
            ...process.env,
            MOCK_GRAPHQL_JSON: JSON.stringify(graphql),
            MOCK_REST_FAILURE: '1',
            MOCK_REST_JSON: JSON.stringify(rest),
            MOCK_STATE: statePath,
            PATH: `${binPath}:${process.env.PATH}`,
          },
          timeout: 10_000,
        }
      );
      expect(restFailure.status).toBe(1);
      expect(restFailure.stderr).toContain(
        'stage=rest-enumeration HTTP 401: unauthorized'
      );

      const graphqlFailure = spawnSync(
        process.execPath,
        [SNAPSHOT, '--repo', 'JovieInc/Jovie', '--limit', '1'],
        {
          encoding: 'utf8',
          env: {
            ...process.env,
            MOCK_GRAPHQL_FAILURE: '1',
            MOCK_GRAPHQL_JSON: JSON.stringify(graphql),
            MOCK_REST_JSON: JSON.stringify(rest),
            MOCK_STATE: statePath,
            PATH: `${binPath}:${process.env.PATH}`,
          },
          timeout: 10_000,
        }
      );
      expect(graphqlFailure.status).toBe(1);
      expect(graphqlFailure.stderr).toContain(
        'stage=graphql-hydration GraphQL: Could not resolve pull request metadata'
      );
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  }, 15_000);
});
