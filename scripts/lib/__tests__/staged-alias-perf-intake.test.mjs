import { describe, expect, it } from 'vitest';
import {
  buildStagedAliasPerfIssue,
  FINGERPRINT,
} from '../../staged-alias-perf-intake.mjs';

describe('staged alias perf intake', () => {
  it('files one fingerprinted, reopenable perf ticket naming the missed routes', () => {
    const issue = buildStagedAliasPerfIssue({
      routes: 'public-profile-listen public-profile-tip',
      runUrl: 'https://github.com/JovieInc/Jovie/actions/runs/1',
      sha: 'abc123',
    });
    expect(issue.fingerprint).toBe(FINGERPRINT);
    expect(issue.title).toContain(FINGERPRINT);
    expect(issue.reopenTerminal).toBe(true);
    expect(issue.description).toContain(
      'public-profile-listen public-profile-tip'
    );
    expect(issue.description).toContain('actions/runs/1');
    expect(issue.description).toContain('abc123');
  });
});
