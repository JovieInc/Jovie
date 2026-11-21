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
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { shouldOverlapTypecheckLanes } from '../ci-typecheck-overlap.mjs';

const REPO_ROOT = resolve(import.meta.dirname, '..', '..', '..');

describe('typecheck lane overlap policy', () => {
  it('overlaps on merge_group and workflow_dispatch; serializes pull_request', () => {
    expect(shouldOverlapTypecheckLanes('pull_request', {})).toBe(false);
    expect(shouldOverlapTypecheckLanes('merge_group', {})).toBe(true);
    expect(shouldOverlapTypecheckLanes('workflow_dispatch', {})).toBe(true);
    expect(
      shouldOverlapTypecheckLanes('pull_request', {
        CI_FAST_TYPECHECK_OVERLAP: 'true',
      })
    ).toBe(true);
    expect(
      shouldOverlapTypecheckLanes('merge_group', {
        CI_FAST_TYPECHECK_OVERLAP: 'false',
      })
    ).toBe(false);
  });

  it('serializes typecheck lanes on pull_request Source Validation twins', () => {
    const repo = mkdtempSync(join(tmpdir(), 'ci-fast-serial-pr-'));
    const binDir = join(repo, 'bin');
    try {
      mkdirSync(binDir);
      // Concurrency probe: serial cannot satisfy ≥4 concurrent stubs.
      writeFileSync(
        join(binDir, 'pnpm'),
        `#!/bin/sh\ntouch "$0.$$"\nfor i in 1 2 3 4 5 6 7 8 9 10; do\n  [ "$(ls "${binDir}" | wc -l)" -ge 4 ] && { echo "dir=$TYPECHECK_SINGLEFLIGHT_DIR"; exit 0; }\n  sleep 0.5\ndone\nexit 9\n`
      );
      chmodSync(join(binDir, 'pnpm'), 0o755);
      const result = spawnSync(
        process.execPath,
        [resolve(REPO_ROOT, 'scripts/ci-fast-lanes.mjs')],
        {
          cwd: repo,
          encoding: 'utf8',
          env: {
            ...process.env,
            CI_FAST_LANE_GROUP: 'typecheck',
            CI_FAST_LANES_OUT: join(repo, 'out.json'),
            CI_FAST_ONLY_STRUCTURAL: 'false',
            GITHUB_EVENT_NAME: 'pull_request',
            TYPECHECK_SINGLEFLIGHT_DIR: '',
            PATH: `${binDir}:${process.env.PATH}`,
          },
        }
      );
      expect(result.status, `${result.stdout}\n${result.stderr}`).not.toBe(0);
      const { lanes } = JSON.parse(
        readFileSync(join(repo, 'out.json'), 'utf8')
      );
      // First lane alone proves serial (later stubs may see leftover touches).
      expect(lanes[0]).toEqual(
        expect.objectContaining({ id: 'typecheck', status: 'failure' })
      );
      expect(lanes.map(lane => lane.id)).toEqual([
        'typecheck',
        'web-tests-typecheck',
        'web-stories-typecheck',
      ]);
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });
});
