import { describe, expect, it, vi } from 'vitest';
import {
  AGENT_READY_LABEL,
  buildIssueCreateArgs,
  claimIssue,
  fileGithubIssue,
  finalizeIssueClaim,
  parseIssueNumber,
  queryTodoIssues,
  shouldDispatchIssue,
  shouldMirrorLinear,
  transitionIssue,
} from '../tracker.mjs';

const URL = 'https://github.com/JovieInc/Jovie/issues/1234\n';

describe('retired GitHub Issue compatibility facade', () => {
  it('fails every mutation closed without invoking an executor', () => {
    const exec = vi.fn();
    const results = [
      fileGithubIssue({ title: 'T', body: 'B' }, exec),
      claimIssue({ number: 42 }, exec),
      finalizeIssueClaim(
        {
          number: 42,
          ownerToken: 'github-ai:JovieInc/Jovie:123:1',
          outcome: 'retryable',
          repo: 'JovieInc/Jovie',
        },
        exec
      ),
      transitionIssue({ number: 42, status: 'done' }, exec),
    ];

    for (const result of results) {
      expect(result).toMatchObject({
        success: false,
        error: expect.stringContaining('intake retired'),
      });
    }
    expect(exec).not.toHaveBeenCalled();
  });

  it('cannot select, infer, or build GitHub Issue intake', () => {
    const exec = vi.fn();
    expect(queryTodoIssues({}, exec)).toMatchObject({
      success: false,
      issues: [],
      error: expect.stringContaining('selection retired'),
    });
    expect(shouldDispatchIssue({ labels: [{ name: AGENT_READY_LABEL }] })).toBe(
      false
    );
    expect(buildIssueCreateArgs({ title: 'T', labels: ['P0'] })).toEqual([]);
    expect(shouldMirrorLinear({ TRACKER_GITHUB_ONLY: '0' })).toBe(false);
    expect(exec).not.toHaveBeenCalled();
  });
});

describe('parseIssueNumber', () => {
  it('extracts the number from a gh create URL', () => {
    expect(parseIssueNumber(URL)).toBe(1234);
  });
  it('returns null for non-issue output', () => {
    expect(parseIssueNumber('something went wrong')).toBeNull();
    expect(parseIssueNumber('')).toBeNull();
  });
});
