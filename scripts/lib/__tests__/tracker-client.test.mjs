import { existsSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

/** @param {{ execFileSync?: (...args: any[]) => unknown, env?: Record<string, string> }} [options] */
async function loadTrackerClient({ execFileSync, env = {} } = {}) {
  vi.resetModules();
  vi.doMock('node:child_process', () => ({
    execFileSync: execFileSync ?? vi.fn(),
  }));
  process.env.HERMES_HOME =
    env.HERMES_HOME ?? mkdtempSync(join(tmpdir(), 'hermes-'));
  for (const key of ['LINEAR_API_KEY', 'TRACKER_GITHUB_ONLY', 'GH_REPO']) {
    if (env[key] === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = env[key];
    }
  }
  return import('../../hermes/lib/tracker-client.ts');
}

function jsonResponse(body, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: vi.fn(async () => body),
    text: vi.fn(async () => JSON.stringify(body)),
  };
}

afterEach(() => vi.unstubAllGlobals());

describe('Hermes Linear-only tracker client', () => {
  it('creates exactly one Linear record and never invokes GitHub', async () => {
    const fetchSpy = vi.fn(async (_url, init) => {
      const query = JSON.parse(init.body).query;
      if (query.includes('query Teams')) {
        return jsonResponse({
          data: { teams: { nodes: [{ id: 't', key: 'JOV' }] } },
        });
      }
      if (query.includes('query TeamLabels')) {
        return jsonResponse({ data: { team: { labels: { nodes: [] } } } });
      }
      return jsonResponse({
        data: {
          issueCreate: {
            success: true,
            issue: {
              id: 'i',
              identifier: 'JOV-999',
              url: 'https://linear.app/JOV-999',
            },
          },
        },
      });
    });
    vi.stubGlobal('fetch', fetchSpy);
    const ghExec = vi.fn();
    const { fileIssue } = await loadTrackerClient({
      execFileSync: ghExec,
      env: { LINEAR_API_KEY: 'test-key', TRACKER_GITHUB_ONLY: '0' },
    });
    const result = await fileIssue({
      title: 'T',
      description: 'B',
      source: 'test',
    });
    expect(result).toMatchObject({
      success: true,
      identifier: 'JOV-999',
      tracker: 'linear',
    });
    const mutations = fetchSpy.mock.calls.filter(([, init]) =>
      JSON.parse(init.body).query.includes('mutation Create(')
    );
    expect(mutations).toHaveLength(1);
    expect(ghExec).not.toHaveBeenCalled();
  });

  it('fails closed on 429 and queues only a Linear retry', async () => {
    const home = mkdtempSync(join(tmpdir(), 'hermes-'));
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse({}, 429))
    );
    const { fileIssue } = await loadTrackerClient({
      env: {
        HERMES_HOME: home,
        LINEAR_API_KEY: 'test-key',
        GH_REPO: 'JovieInc/Jovie',
      },
    });
    const result = await fileIssue({
      title: 'T',
      description: 'B',
      source: 'test',
    });
    const queued = readFileSync(
      join(home, 'state', 'linear-queue.jsonl'),
      'utf8'
    );
    expect(result).toMatchObject({
      success: false,
      queued: true,
      tracker: 'linear',
    });
    expect(queued).toContain('"tracker":"linear"');
    expect(queued).not.toContain('"tracker":"github"');
  });
});

describe.skip('historical GitHub-first tracker-client behavior', () => {
  it('files GitHub issues via gh and skips the Linear mirror behind TRACKER_GITHUB_ONLY', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    const execFileSync = vi.fn(
      () => 'https://github.com/JovieInc/Jovie/issues/999\n'
    );
    const { fileIssue } = await loadTrackerClient({
      execFileSync,
      env: { TRACKER_GITHUB_ONLY: '1', GH_REPO: 'JovieInc/Jovie' },
    });

    const result = await fileIssue({
      title: 'T',
      description: 'B',
      source: 'test',
      labels: ['agent-ready'],
    });

    expect(result).toMatchObject({
      success: true,
      identifier: '#999',
      url: 'https://github.com/JovieInc/Jovie/issues/999',
      mirrored: false,
    });
    expect(execFileSync).toHaveBeenCalledWith(
      'gh',
      expect.arrayContaining(['issue', 'create', '--repo', 'JovieInc/Jovie']),
      expect.objectContaining({ input: 'B' })
    );
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('retries GitHub issue creation without labels when labeled create fails', async () => {
    const execFileSync = vi
      .fn()
      .mockImplementationOnce(() => {
        throw new Error('label not found');
      })
      .mockImplementationOnce(
        () => 'https://github.com/JovieInc/Jovie/issues/1000\n'
      );
    const { fileIssue } = await loadTrackerClient({
      execFileSync,
      env: { TRACKER_GITHUB_ONLY: '1' },
    });

    const result = await fileIssue({
      title: 'T',
      description: 'B',
      source: 'test',
      labels: ['missing-label'],
    });

    expect(result.success).toBe(true);
    expect(result.identifier).toBe('#1000');
    expect(execFileSync).toHaveBeenCalledTimes(2);
    expect(execFileSync.mock.calls[0][1]).toContain('--label');
    expect(execFileSync.mock.calls[1][1]).not.toContain('--label');
  });

  it('queues failed GitHub issue intents durably', async () => {
    const hermesHome = mkdtempSync(join(tmpdir(), 'hermes-'));
    const execFileSync = vi.fn(() => {
      throw new Error('gh unavailable');
    });
    const { fileIssue } = await loadTrackerClient({
      execFileSync,
      env: { HERMES_HOME: hermesHome, TRACKER_GITHUB_ONLY: '1' },
    });

    const result = await fileIssue({
      title: 'T',
      description: 'B',
      source: 'test',
    });

    const queuePath = join(hermesHome, 'state', 'linear-queue.jsonl');
    expect(result.success).toBe(false);
    expect(result.queued).toBe(true);
    expect(existsSync(queuePath)).toBe(true);
    expect(readFileSync(queuePath, 'utf8')).toContain('"tracker":"github"');
  });
});

describe('voice memo ingest retry contract', () => {
  it('keeps queued issue spans out of the handled filed-issue count', () => {
    const source = readFileSync(
      join(import.meta.dirname, '..', '..', 'hermes/jobs/voice-memo-ingest.ts'),
      'utf8'
    );
    expect(source).toContain('issue_queued_keeping_memo_for_retry');
    expect(source).not.toContain('queued:${basename(args.memoFile)}');
  });
});
