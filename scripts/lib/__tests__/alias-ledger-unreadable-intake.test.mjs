import { describe, expect, it } from 'vitest';
import {
  buildLedgerUnreadableIssue,
  FINGERPRINT,
} from '../../alias-ledger-unreadable-intake.mjs';

describe('certification ledger unreadable intake', () => {
  it('files one urgent, reopenable issue naming the lane, state and read detail', () => {
    const issue = buildLedgerUnreadableIssue({
      lane: 'staged-alias',
      state: 'unavailable',
      source: 'https://jov.ie/api/internal/ovie/golden-path-evidence',
      detail: 'HTTP 405',
      runUrl: 'https://github.com/JovieInc/Jovie/actions/runs/1',
      sha: 'abc123',
    });
    expect(issue.fingerprint).toBe(FINGERPRINT);
    expect(issue.priority).toBe(1);
    expect(issue.reopenTerminal).toBe(true);
    for (const text of [
      'staged-alias',
      'unavailable',
      'HTTP 405',
      'abc123',
      'actions/runs/1',
    ])
      expect(issue.description).toContain(text);
  });
});
