import { existsSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

async function loadTrackerClient({ env = {} } = {}) {
  vi.resetModules();
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

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('Hermes Linear-only tracker client', () => {
  it('creates exactly one Linear issue with no GitHub dual-write', async () => {
    const fetchSpy = vi.fn(async (_url, init) => {
      const payload = JSON.parse(init.body);
      if (payload.query.includes('query Teams')) {
        return jsonResponse({
          data: { teams: { nodes: [{ id: 'team-1', key: 'JOV' }] } },
        });
      }
      if (payload.query.includes('query TeamLabels')) {
        return jsonResponse({
          data: {
            team: {
              labels: { nodes: [{ id: 'label-1', name: 'agent-ready' }] },
            },
          },
        });
      }
      return jsonResponse({
        data: {
          issueCreate: {
            success: true,
            issue: {
              id: 'linear-1',
              identifier: 'JOV-999',
              url: 'https://linear.app/jovie/issue/JOV-999',
            },
          },
        },
      });
    });
    vi.stubGlobal('fetch', fetchSpy);
    const { fileIssue } = await loadTrackerClient({
      env: {
        LINEAR_API_KEY: 'linear-test-key',
        TRACKER_GITHUB_ONLY: '1',
        GH_REPO: 'JovieInc/Jovie',
      },
    });

    const result = await fileIssue({
      title: 'T',
      description: 'B',
      source: 'test',
      labels: ['agent-ready'],
    });

    expect(result).toEqual({
      success: true,
      id: 'linear-1',
      identifier: 'JOV-999',
      url: 'https://linear.app/jovie/issue/JOV-999',
      tracker: 'linear',
    });
    const payloads = fetchSpy.mock.calls.map(([, init]) =>
      JSON.parse(init.body)
    );
    expect(
      payloads.filter(payload => payload.query.includes('mutation Create('))
    ).toHaveLength(1);
    expect(
      payloads.some(payload => JSON.stringify(payload).includes('github'))
    ).toBe(false);
  });

  it('fails closed on a Linear rate limit and queues only a Linear retry', async () => {
    const hermesHome = mkdtempSync(join(tmpdir(), 'hermes-'));
    const fetchSpy = vi.fn(async () => jsonResponse({}, 429));
    vi.stubGlobal('fetch', fetchSpy);
    const { fileIssue } = await loadTrackerClient({
      env: { HERMES_HOME: hermesHome, LINEAR_API_KEY: 'linear-test-key' },
    });

    const result = await fileIssue({
      title: 'T',
      description: 'B',
      source: 'test',
    });

    const queuePath = join(hermesHome, 'state', 'linear-queue.jsonl');
    expect(result).toMatchObject({
      success: false,
      queued: true,
      tracker: 'linear',
    });
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(existsSync(queuePath)).toBe(true);
    expect(readFileSync(queuePath, 'utf8')).toContain('"tracker":"linear"');
    expect(readFileSync(queuePath, 'utf8')).not.toContain('"tracker":"github"');
  });

  it('fails closed before network access when Linear credentials are absent', async () => {
    const hermesHome = mkdtempSync(join(tmpdir(), 'hermes-'));
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    const { fileIssue } = await loadTrackerClient({
      env: { HERMES_HOME: hermesHome },
    });

    const result = await fileIssue({
      title: 'T',
      description: 'B',
      source: 'test',
    });

    expect(result).toMatchObject({
      success: false,
      queued: true,
      tracker: 'linear',
    });
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(
      readFileSync(join(hermesHome, 'state', 'linear-queue.jsonl'), 'utf8')
    ).toContain('LINEAR_API_KEY missing');
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
