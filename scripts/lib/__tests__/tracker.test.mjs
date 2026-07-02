import { describe, expect, it } from 'vitest';
import {
  buildIssueCreateArgs,
  fileGithubIssue,
  parseIssueNumber,
  shouldMirrorLinear,
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
