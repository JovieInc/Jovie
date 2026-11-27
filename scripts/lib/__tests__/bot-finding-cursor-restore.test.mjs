import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ghShape } from '../../../packages/api-client/gh.ts';
import { restoreFindingCursor } from '../bot-finding-recovery.mjs';
import { storedZip } from '../real-gh-harness.mjs';

const repo = 'JovieInc/Jovie';
const sha = 'a'.repeat(40);
const member = 'bot-findings-cursor.json';
const cursor = {
  repo,
  page: 2,
  offset: 3,
  until: '2026-11-27T03:00:00Z',
  threadCursor: 'cursor-300',
  threadPr: 7,
  threadOriginalUrl: 'https://github.com/comment/référence',
};
const run = {
  id: 12,
  status: 'completed',
  event: 'schedule',
  path: '.github/workflows/remediation-sweep.yml',
  head_sha: sha,
  repository: { id: 9, full_name: repo },
  head_repository: { id: 9 },
};

function fixture({
  bytes = storedZip({ [member]: JSON.stringify(cursor) }),
  changeRun = value => value,
  changeArtifact = value => value,
  total = 1,
  runs = [run],
} = {}) {
  const calls = [];
  const ghRunner = async args => {
    calls.push(args);
    const path = args.at(-1);
    if (path.includes('/workflows/'))
      return {
        code: 0,
        stdout: JSON.stringify({
          workflow_runs: runs.map(value => changeRun(structuredClone(value))),
        }),
      };
    if (path.endsWith('/zip'))
      return { code: 0, stdout: bytes.toString('latin1') };
    const runId = Number(path.match(/\/runs\/(\d+)\/artifacts/)[1]);
    const artifact = {
      id: 42,
      name: 'bot-findings-cursor',
      expired: false,
      size_in_bytes: bytes.length,
      digest: `sha256:${createHash('sha256').update(bytes).digest('hex')}`,
      workflow_run: {
        id: runId,
        repository_id: 9,
        head_repository_id: 9,
        head_sha: sha,
      },
    };
    return {
      code: 0,
      stdout: JSON.stringify({
        total_count: total,
        artifacts: [changeArtifact(artifact)],
      }),
    };
  };
  return { ghRunner, calls };
}

async function restore(options) {
  const root = mkdtempSync(join(tmpdir(), 'finding-cursor-zip-'));
  const dir = join(root, 'restore');
  mkdirSync(dir);
  try {
    const result = await restoreFindingCursor({
      repo,
      dir,
      ghRunner: options.ghRunner,
    });
    return {
      result,
      saved: existsSync(join(dir, member))
        ? JSON.parse(readFileSync(join(dir, member), 'utf8'))
        : null,
      escaped: existsSync(join(root, 'escape')),
    };
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

describe('cursor-only REST artifact restore', () => {
  it('preserves real ZIP bytes and uses idempotent core GETs exclusively', async () => {
    const source = fixture({
      bytes: storedZip({
        [member]: JSON.stringify({ ...cursor, unexpected: 'discard this' }),
      }),
    });
    expect(await restore(source)).toEqual({
      result: true,
      saved: cursor,
      escaped: false,
    });
    expect(source.calls).toHaveLength(3);
    expect(source.calls[0].at(-1)).toBe(
      'repos/JovieInc/Jovie/actions/workflows/remediation-sweep.yml/runs?status=completed&per_page=5'
    );
    expect(source.calls[1].at(-1)).toBe(
      'repos/JovieInc/Jovie/actions/runs/12/artifacts?name=bot-findings-cursor&per_page=2'
    );
    expect(source.calls[2].at(-1)).toBe(
      'repos/JovieInc/Jovie/actions/artifacts/42/zip'
    );
    for (const args of source.calls)
      expect(ghShape(args)).toMatchObject({
        resource: 'core',
        write: false,
        idempotent: true,
      });
  });

  it.each([
    ['missing run', { changeRun: () => null }],
    ['missing artifact', { changeArtifact: () => null }],
    [
      'repository',
      {
        changeRun: value => ({
          ...value,
          repository: { id: 9, full_name: 'other/repo' },
        }),
      },
    ],
    [
      'workflow',
      {
        changeRun: value => ({ ...value, path: '.github/workflows/other.yml' }),
      },
    ],
    ['event', { changeRun: value => ({ ...value, event: 'pull_request' }) }],
    [
      'fork',
      { changeRun: value => ({ ...value, head_repository: { id: 10 } }) },
    ],
    [
      'run',
      {
        changeArtifact: value => ({
          ...value,
          workflow_run: { ...value.workflow_run, id: 99 },
        }),
      },
    ],
    [
      'artifact repository',
      {
        changeArtifact: value => ({
          ...value,
          workflow_run: { ...value.workflow_run, repository_id: 10 },
        }),
      },
    ],
    [
      'artifact head',
      {
        changeArtifact: value => ({
          ...value,
          workflow_run: { ...value.workflow_run, head_sha: 'b'.repeat(40) },
        }),
      },
    ],
    ['name', { changeArtifact: value => ({ ...value, name: 'different' }) }],
    ['expired', { changeArtifact: value => ({ ...value, expired: true }) }],
    ['size', { changeArtifact: value => ({ ...value, size_in_bytes: 65537 }) }],
    [
      'digest',
      {
        changeArtifact: value => ({
          ...value,
          digest: `sha256:${'0'.repeat(64)}`,
        }),
      },
    ],
    ['ambiguous artifact list', { total: 2 }],
  ])('rejects mismatched %s evidence', async (_name, options) => {
    expect(await restore(fixture(options))).toEqual({
      result: false,
      saved: null,
      escaped: false,
    });
  });

  it.each([
    ['path traversal', storedZip({ '../escape': JSON.stringify(cursor) })],
    [
      'extra member',
      storedZip({ [member]: JSON.stringify(cursor), 'extra.json': '{}' }),
    ],
    ['oversized member', storedZip({ [member]: ' '.repeat(16385) })],
    [
      'wrong cursor repository',
      storedZip({
        [member]: JSON.stringify({ ...cursor, repo: 'other/repo' }),
      }),
    ],
    ['malformed ZIP', Buffer.from('not a ZIP archive')],
  ])('reads no unsafe output from %s', async (_name, bytes) => {
    expect(await restore(fixture({ bytes }))).toEqual({
      result: false,
      saved: null,
      escaped: false,
    });
  });

  it('rejects a symbolic-link member without extracting it', async () => {
    const bytes = storedZip({ [member]: JSON.stringify(cursor) });
    const central = bytes.indexOf(Buffer.from('504b0102', 'hex'));
    bytes.writeUInt32LE((0o120777 << 16) >>> 0, central + 38);
    expect(await restore(fixture({ bytes }))).toEqual({
      result: false,
      saved: null,
      escaped: false,
    });
  });

  it('bounds fallback to five runs and eleven core reads', async () => {
    const source = fixture({
      bytes: Buffer.from('bad ZIP'),
      runs: Array.from({ length: 7 }, (_, index) => ({
        ...run,
        id: 12 - index,
      })),
    });
    expect((await restore(source)).result).toBe(false);
    expect(source.calls).toHaveLength(11);
  });

  it('retains an existing checkpoint when the restored archive is invalid', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'finding-cursor-existing-'));
    try {
      writeFileSync(join(dir, member), JSON.stringify(cursor));
      const source = fixture({ bytes: Buffer.from('invalid') });
      expect(
        await restoreFindingCursor({ repo, dir, ghRunner: source.ghRunner })
      ).toBe(false);
      expect(JSON.parse(readFileSync(join(dir, member), 'utf8'))).toEqual(
        cursor
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
