import { describe, expect, it } from 'vitest';
import {
  AGENT_READY_LABEL,
  buildClaimArgs,
  buildIssueCreateArgs,
  buildTransitionArgs,
  claimIssue,
  fileGithubIssue,
  parseIssueNumber,
  queryTodoIssues,
  shouldMirrorLinear,
  shouldSkipGithubIssue,
  STATUS_IN_PROGRESS,
  STATUS_IN_REVIEW,
  transitionIssue,
} from '../tracker.mjs';

const URL = 'https://github.com/JovieInc/Jovie/issues/1234\n';

describe('buildIssueCreateArgs', () => {
  it('builds a stdin-body create with one --label per label', () => {
    expect(
      buildIssueCreateArgs({ title: 'Bug: x', labels: ['P0', 'qa-swarm'] })
    ).toEqual([
      'issue',
      'create',
      '--title',
      'Bug: x',
      '--body-file',
      '-',
      '--label',
      'P0',
      '--label',
      'qa-swarm',
    ]);
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

describe('fileGithubIssue', () => {
  it('returns success with number, identifier, and url', () => {
    const calls = [];
    const exec = (args, input) => {
      calls.push({ args, input });
      return URL;
    };
    const result = fileGithubIssue(
      { title: 'T', body: 'B', labels: ['P1'] },
      exec
    );
    expect(result).toMatchObject({
      success: true,
      number: 1234,
      identifier: '#1234',
      url: URL.trim(),
      labelsDropped: false,
    });
    expect(calls[0].input).toBe('B');
  });

  it('retries without labels when the labeled create fails, and flags it', () => {
    let call = 0;
    const exec = args => {
      call++;
      if (args.includes('--label')) throw new Error('label not found');
      return URL;
    };
    const result = fileGithubIssue(
      { title: 'T', body: 'B', labels: ['nope'] },
      exec
    );
    expect(call).toBe(2);
    expect(result.success).toBe(true);
    expect(result.labelsDropped).toBe(true);
  });

  it('never throws — returns success:false with the error message', () => {
    const exec = () => {
      throw new Error('gh: not logged in');
    };
    const result = fileGithubIssue({ title: 'T', body: 'B' }, exec);
    expect(result.success).toBe(false);
    expect(result.error).toContain('not logged in');
    expect(result.url).toBeNull();
  });
});

describe('shouldMirrorLinear', () => {
  it('mirrors by default and stops on TRACKER_GITHUB_ONLY=1', () => {
    expect(shouldMirrorLinear({})).toBe(true);
    expect(shouldMirrorLinear({ TRACKER_GITHUB_ONLY: '1' })).toBe(false);
    expect(shouldMirrorLinear({ TRACKER_GITHUB_ONLY: '0' })).toBe(true);
  });
});

describe('buildClaimArgs', () => {
  it('adds in-progress label, removes agent-ready, and assigns', () => {
    expect(
      buildClaimArgs({ number: 42, assignee: 'jovie-bot', repo: 'o/r' })
    ).toEqual([
      'issue',
      'edit',
      '42',
      '--repo',
      'o/r',
      '--add-label',
      STATUS_IN_PROGRESS,
      '--remove-label',
      AGENT_READY_LABEL,
      '--add-assignee',
      'jovie-bot',
    ]);
  });
});

describe('buildTransitionArgs', () => {
  it('closes and strips status labels for done', () => {
    expect(buildTransitionArgs({ number: 9, status: 'done' })).toEqual([
      'issue',
      'close',
      '9',
      '--remove-label',
      STATUS_IN_PROGRESS,
      '--remove-label',
      STATUS_IN_REVIEW,
    ]);
  });

  it('swaps to in-review', () => {
    expect(buildTransitionArgs({ number: 9, status: 'in-review' })).toEqual([
      'issue',
      'edit',
      '9',
      '--add-label',
      STATUS_IN_REVIEW,
      '--remove-label',
      STATUS_IN_PROGRESS,
    ]);
  });
});

describe('claimIssue', () => {
  it('claims and comments without throwing', () => {
    const calls = [];
    const exec = (args, input) => {
      calls.push({ args, input });
      return '';
    };
    const result = claimIssue(
      { number: 7, assignee: 'bot', comment: 'hi' },
      exec
    );
    expect(result.success).toBe(true);
    expect(calls).toHaveLength(2);
    expect(calls[1].args).toContain('comment');
  });
});

describe('transitionIssue', () => {
  it('never throws on gh failure', () => {
    const exec = () => {
      throw new Error('gh down');
    };
    expect(transitionIssue({ number: 1, status: 'done' }, exec)).toMatchObject({
      success: false,
      error: 'gh down',
    });
  });
});

describe('shouldSkipGithubIssue', () => {
  it('skips human-review and in-progress issues', () => {
    expect(
      shouldSkipGithubIssue({
        title: 'x',
        labels: [{ name: 'human-review-required' }],
      })
    ).toBe(true);
    expect(
      shouldSkipGithubIssue({
        title: 'x',
        labels: [{ name: STATUS_IN_PROGRESS }],
      })
    ).toBe(true);
    expect(
      shouldSkipGithubIssue({ title: 'ok', labels: [{ name: 'agent-ready' }] })
    ).toBe(false);
  });
});

describe('queryTodoIssues', () => {
  it('filters and sorts eligible issues', () => {
    const exec = () =>
      JSON.stringify([
        {
          number: 2,
          title: 'skip me',
          labels: [{ name: STATUS_IN_PROGRESS }],
          updatedAt: '2026-07-02T00:00:00Z',
        },
        {
          number: 1,
          title: 'ready',
          labels: [{ name: AGENT_READY_LABEL }],
          updatedAt: '2026-07-03T00:00:00Z',
        },
      ]);
    const result = queryTodoIssues({}, exec);
    expect(result.success).toBe(true);
    expect(result.issues).toHaveLength(1);
    expect(result.issues[0].number).toBe(1);
  });
});
