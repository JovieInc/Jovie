import { afterEach, describe, expect, it } from 'vitest';
import {
  dismissProposal,
  isProposalDismissed,
  undismissProposal,
} from './proposal-dismiss-ledger';

const STORAGE_KEY = 'jovie:chat-proposal-dismissals:v1';

describe('proposal-dismiss-ledger', () => {
  afterEach(() => {
    globalThis.localStorage?.removeItem(STORAGE_KEY);
  });

  it('records and reads dismissals by toolCallId', () => {
    expect(isProposalDismissed('tool-1')).toBe(false);
    dismissProposal('tool-1');
    expect(isProposalDismissed('tool-1')).toBe(true);
    expect(isProposalDismissed('tool-2')).toBe(false);
  });

  it('supports undo and no-ops on empty ids', () => {
    dismissProposal('tool-1');
    undismissProposal('tool-1');
    expect(isProposalDismissed('tool-1')).toBe(false);

    dismissProposal(undefined);
    undismissProposal(undefined);
    expect(isProposalDismissed(undefined)).toBe(false);
  });

  it('survives re-read from storage (reload durability)', () => {
    dismissProposal('tool-reload');
    // Simulate a fresh module consumer by reading storage directly.
    const raw = globalThis.localStorage.getItem(STORAGE_KEY);
    expect(raw).toContain('tool-reload');
    expect(isProposalDismissed('tool-reload')).toBe(true);
  });
});
