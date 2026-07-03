import { describe, expect, it } from 'vitest';
import {
  AGENT_READY_LABEL,
  buildIssueCreateArgs,
  claimIssue,
  fileGithubIssue,
  parseIssueNumber,
  queryTodoIssues,
  STATUS_IN_PROGRESS,
  STATUS_IN_REVIEW,
  shouldDispatchIssue,
  shouldMirrorLinear,
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

describe('claimIssue', () => {
  it('assigns, swaps to status:in-progress, and comments', () => {
    const calls = [];
    const exec = args => {
      calls.push(args);
      return '';
    };
    const result = claimIssue(
      { number: 42, assignee: 'jovie-bot', note: 'test claim' },
      exec
    );
    expect(result.success).toBe(true);
    expect(calls[0]).toContain('edit');
    expect(calls[0]).toContain('--add-label');
    expect(calls[0]).toContain(STATUS_IN_PROGRESS);
    expect(calls[0]).toContain('--add-assignee');
    expect(calls[0]).toContain('jovie-bot');
    expect(calls[1]).toContain('comment');
    expect(calls[1].join(' ')).toContain('test claim');
  });
});

describe('transitionIssue', () => {
  it('moves to in-review via label swap', () => {
    const calls = [];
    const exec = args => {
      calls.push(args);
      return '';
    };
    const result = transitionIssue({ number: 9, status: 'in-review' }, exec);
    expect(result.success).toBe(true);
    expect(calls[0]).toContain('--remove-label');
    expect(calls[0]).toContain(STATUS_IN_PROGRESS);
    expect(calls[0]).toContain('--add-label');
    expect(calls[0]).toContain(STATUS_IN_REVIEW);
  });

  it('closes the issue for done', () => {
    const calls = [];
    const exec = args => {
      calls.push(args);
      return '';
    };
    const result = transitionIssue(
      { number: 9, status: 'done', note: 'merged' },
      exec
    );
    expect(result.success).toBe(true);
    expect(calls[0]).toContain('close');
    expect(calls[0]).toContain('merged');
  });
});

describe('shouldDispatchIssue', () => {
  it('requires agent-ready and no status labels', () => {
    expect(
      shouldDispatchIssue({
        title: 'Fix bug',
        body: '',
        labels: [{ name: AGENT_READY_LABEL }],
      })
    ).toBe(true);
    expect(
      shouldDispatchIssue({
        title: 'Fix bug',
        body: '',
        labels: [{ name: AGENT_READY_LABEL }, { name: STATUS_IN_PROGRESS }],
      })
    ).toBe(false);
    expect(
      shouldDispatchIssue({
        title: 'Fix bug',
        body: 'This issue requires human review',
        labels: [{ name: AGENT_READY_LABEL }],
      })
    ).toBe(false);
  });
});

describe('queryTodoIssues', () => {
  it('filters to dispatchable agent-ready issues', () => {
    const exec = args => {
      expect(args).toContain('issue');
      return JSON.stringify([
        {
          number: 1,
          title: 'Ready',
          body: '',
          labels: [{ name: AGENT_READY_LABEL }],
          updatedAt: '2026-07-01T00:00:00Z',
        },
        {
          number: 2,
          title: 'In flight',
          body: '',
          labels: [{ name: AGENT_READY_LABEL }, { name: STATUS_IN_PROGRESS }],
          updatedAt: '2026-07-02T00:00:00Z',
        },
      ]);
    };
    const result = queryTodoIssues({}, exec);
    expect(result.success).toBe(true);
    expect(result.issues).toHaveLength(1);
    expect(result.issues[0].number).toBe(1);
  });
});
