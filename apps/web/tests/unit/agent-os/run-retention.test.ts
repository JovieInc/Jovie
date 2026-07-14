import { promises as fs } from 'node:fs';
import {
  lstat,
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  realpath,
  rm,
  symlink,
  utimes,
  writeFile,
} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import { assertOwnedTreeBudget } from '@/lib/agent-os/artifact-budget';
import {
  retainCompletedRunDirectories,
  retainRegularFiles,
  writeTextFileAtomic,
} from '@/lib/agent-os/run-retention';

const fixtures: string[] = [];
const DAY_MS = 24 * 60 * 60 * 1000;

async function fixture(): Promise<string> {
  const root = await realpath(
    await mkdtemp(path.join(os.tmpdir(), 'agentos-retention-'))
  );
  fixtures.push(root);
  return root;
}

async function setTreeAge(target: string, ageDays: number): Promise<void> {
  const modified = new Date(Date.now() - ageDays * DAY_MS);
  const stats = await lstat(target);
  if (stats.isDirectory() && !stats.isSymbolicLink()) {
    for (const name of await readdir(target)) {
      await setTreeAge(path.join(target, name), ageDays);
    }
  }
  await utimes(target, modified, modified);
}

async function makeRun(
  root: string,
  runId: string,
  ageDays: number,
  state: 'complete' | 'incomplete' | 'invalid'
): Promise<string> {
  const run = path.join(root, runId);
  await mkdir(run, { recursive: true });
  await writeFile(path.join(run, 'artifact.json'), '{}');
  if (state !== 'incomplete') {
    await writeFile(
      path.join(run, 'complete.json'),
      JSON.stringify(
        state === 'complete'
          ? { status: 'completed', runId }
          : { status: 'running', runId }
      )
    );
  }
  await setTreeAge(run, ageDays);
  return run;
}

afterEach(async () => {
  await Promise.all(
    fixtures.splice(0).map(root => rm(root, { recursive: true, force: true }))
  );
});

describe('AgentOS run retention', () => {
  it('atomically replaces files and leaves no temp file after a failed rename', async () => {
    const root = await fixture();
    const target = path.join(root, 'manifest.json');
    await writeTextFileAtomic(target, 'first');
    await writeTextFileAtomic(target, 'second');
    expect(await readFile(target, 'utf8')).toBe('second');

    const blockedTarget = path.join(root, 'blocked.json');
    await mkdir(blockedTarget);
    await expect(writeTextFileAtomic(blockedTarget, 'nope')).rejects.toThrow();
    expect((await lstat(blockedTarget)).isDirectory()).toBe(true);
    expect((await readdir(root)).some(name => name.endsWith('.tmp'))).toBe(
      false
    );
    await expect(writeTextFileAtomic(target, 'too big', 2)).rejects.toThrow(
      /limit is 2/
    );
    expect(await readFile(target, 'utf8')).toBe('second');
  });

  it('keeps 14 completed runs and preserves current, young, invalid, symlinked, and raced runs', async () => {
    const root = await fixture();
    for (let index = 1; index <= 16; index += 1) {
      await makeRun(root, `run-${index}`, 20 - index, 'complete');
    }
    await makeRun(root, 'current-run', 30, 'complete');
    await makeRun(root, 'stale-incomplete', 10, 'incomplete');
    await makeRun(root, 'young-incomplete', 2, 'incomplete');
    await makeRun(root, 'invalid-marker', 30, 'invalid');
    await makeRun(root, '!invalid-name', 30, 'incomplete');

    const outside = await fixture();
    const linked = await makeRun(root, 'linked-run', 30, 'complete');
    await symlink(outside, path.join(linked, 'outside'));

    const racedPath = path.join(root, 'run-1');
    const result = await retainCompletedRunDirectories({
      completionMarker: 'complete.json',
      currentRunId: 'current-run',
      hooks: {
        beforeRevalidate: async candidate => {
          if (candidate === racedPath) {
            await writeFile(path.join(candidate, 'late-write.json'), '{}');
          }
        },
      },
      keepCompleted: 14,
      nowMs: Date.now(),
      root,
      staleIncompleteMs: 7 * DAY_MS,
    });

    expect(result.removed).toBe(2);
    expect(await lstat(racedPath)).toBeTruthy();
    await expect(lstat(path.join(root, 'run-2'))).rejects.toMatchObject({
      code: 'ENOENT',
    });
    await expect(
      lstat(path.join(root, 'stale-incomplete'))
    ).rejects.toMatchObject({ code: 'ENOENT' });
    for (const name of [
      'current-run',
      'young-incomplete',
      'invalid-marker',
      '!invalid-name',
      'linked-run',
    ]) {
      expect(await lstat(path.join(root, name))).toBeTruthy();
    }
    expect(await lstat(outside)).toBeTruthy();
  });

  it('caps dispatch manifests at 100 and revalidates before unlinking', async () => {
    const root = await fixture();
    const modifiedBase = Date.now() - 200 * DAY_MS;
    for (let index = 0; index < 102; index += 1) {
      const name = `design-lab-00000000-0000-4000-8000-${String(index).padStart(12, '0')}.json`;
      const target = path.join(root, name);
      await writeFile(target, '{}');
      const modified = new Date(modifiedBase + index * 1000);
      await utimes(target, modified, modified);
    }
    const oldest = path.join(
      root,
      'design-lab-00000000-0000-4000-8000-000000000000.json'
    );
    const secondOldest = path.join(
      root,
      'design-lab-00000000-0000-4000-8000-000000000001.json'
    );
    const outside = await fixture();
    await symlink(
      outside,
      path.join(root, 'design-lab-ffffffff-ffff-4fff-8fff-ffffffffffff.json')
    );

    const result = await retainRegularFiles({
      currentFile: path.join(
        root,
        'design-lab-00000000-0000-4000-8000-000000000101.json'
      ),
      fileNamePattern: /^design-lab-[a-f0-9-]{36}\.json$/,
      hooks: {
        beforeRevalidate: async candidate => {
          if (candidate === oldest)
            await writeFile(candidate, '{"changed":true}');
        },
      },
      keep: 100,
      root,
    });

    expect(result.removed).toBe(1);
    expect(await readFile(oldest, 'utf8')).toBe('{"changed":true}');
    await expect(lstat(secondOldest)).rejects.toMatchObject({ code: 'ENOENT' });
    expect(await lstat(outside)).toBeTruthy();
  });

  it('fails closed when artifact bytes, files, directories, or symlinks exceed a budget', async () => {
    const root = await fixture();
    await mkdir(path.join(root, 'run-1'));
    await writeFile(path.join(root, 'run-1', 'artifact.bin'), '12345');

    await expect(
      assertOwnedTreeBudget(root, {
        maxBytes: 4,
        maxDirectories: 10,
        maxFiles: 10,
      })
    ).rejects.toThrow(/Artifact budget exceeded/);
    await expect(
      assertOwnedTreeBudget(root, {
        maxBytes: 10,
        maxDirectories: 0,
        maxFiles: 10,
      })
    ).rejects.toThrow(/Artifact budget exceeded/);
    await expect(
      assertOwnedTreeBudget(root, {
        maxBytes: 10,
        maxDirectories: 10,
        maxFiles: 0,
      })
    ).rejects.toThrow(/Artifact budget exceeded/);

    const outside = await fixture();
    await symlink(outside, path.join(root, 'unknown-output'));
    await expect(
      assertOwnedTreeBudget(root, {
        maxBytes: 10,
        maxDirectories: 10,
        maxFiles: 10,
      })
    ).rejects.toThrow(/symlinked artifact path/);
    expect(await lstat(outside)).toBeTruthy();
  });

  it('tolerates atomic temp-file churn during live budget scans', async () => {
    const root = await fixture();
    const churnPath = path.join(root, 'atomic-write.tmp');
    const originalLstat = fs.lstat.bind(fs);
    let disappeared = 0;
    vi.spyOn(fs, 'lstat').mockImplementation(async target => {
      if (String(target) === churnPath) {
        await rm(churnPath);
        disappeared += 1;
      }
      return originalLstat(target);
    });

    for (let index = 0; index < 20; index += 1) {
      await writeFile(churnPath, `temporary-${index}`);
      await expect(
        assertOwnedTreeBudget(
          root,
          {
            maxBytes: 1024 * 1024,
            maxDirectories: 100,
            maxFiles: 100,
          },
          { requireStableSnapshot: false }
        )
      ).resolves.toEqual({ bytes: 0, directories: 0, files: 0 });
    }
    expect(disappeared).toBe(20);
  });
});
