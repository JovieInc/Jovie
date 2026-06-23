import { mkdtemp } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { saveTasteSlackCard } from './card-store';
import {
  TASTE_AUTHORITY_SLACK_USER_ID,
  TASTE_BUILD_AGENT_SLACK_USER_ID,
  TASTE_SLACK_APPROVE_REACTION,
  TASTE_SLACK_REJECT_REACTION,
} from './constants';
import {
  handleTasteSlackReaction,
  isAuthoritativeTasteSlackReaction,
  shouldIgnoreTasteSlackReaction,
} from './reaction-handler';

const approveMock = vi.fn();
const rejectMock = vi.fn();
const preferenceMock = vi.fn();

vi.mock('./linear-actions', () => ({
  approveTasteInboxIssue: (...args: unknown[]) => approveMock(...args),
  rejectTasteInboxIssue: (...args: unknown[]) => rejectMock(...args),
}));

vi.mock('./gbrain-preference', () => ({
  writeTastePreference: (...args: unknown[]) => preferenceMock(...args),
}));

describe('taste-slack reaction filtering', () => {
  it('ignores the build agent and accepts only Aria', () => {
    expect(
      shouldIgnoreTasteSlackReaction(TASTE_BUILD_AGENT_SLACK_USER_ID)
    ).toBe(true);
    expect(
      isAuthoritativeTasteSlackReaction(TASTE_AUTHORITY_SLACK_USER_ID)
    ).toBe(true);
    expect(
      isAuthoritativeTasteSlackReaction(TASTE_BUILD_AGENT_SLACK_USER_ID)
    ).toBe(false);
  });
});

describe('handleTasteSlackReaction', () => {
  let tempDir = '';
  let storePath = '';

  beforeEach(async () => {
    approveMock.mockReset();
    rejectMock.mockReset();
    preferenceMock.mockReset();
    preferenceMock.mockResolvedValue({
      localLogPath: '/tmp/taste-preferences.log.md',
      gbrainEntryId: null,
    });

    tempDir = await mkdtemp(path.join(os.tmpdir(), 'taste-slack-'));
    storePath = path.join(tempDir, 'cards.json');
    await saveTasteSlackCard(
      {
        issueId: 'issue-1',
        identifier: 'JOV-100',
        title: 'Pick hero color',
        label: 'needs:taste',
        channel: 'C123',
        messageTs: '1710000000.000100',
        postedAt: '2026-06-20T12:00:00.000Z',
      },
      storePath
    );
    process.env.LINEAR_API_KEY = 'test-linear-key';
  });

  afterEach(async () => {
    delete process.env.LINEAR_API_KEY;
  });

  it('ignores build-agent paired reactions', async () => {
    const result = await handleTasteSlackReaction(
      {
        type: 'reaction_added',
        user: TASTE_BUILD_AGENT_SLACK_USER_ID,
        reaction: TASTE_SLACK_APPROVE_REACTION,
        item: { type: 'message', channel: 'C123', ts: '1710000000.000100' },
      },
      { storePath }
    );

    expect(result).toEqual({
      handled: false,
      reason: 'Ignored build-agent reaction',
    });
    expect(approveMock).not.toHaveBeenCalled();
    expect(rejectMock).not.toHaveBeenCalled();
  });

  it('approves on Aria thumbs-up and logs preference + Linear comment path', async () => {
    const result = await handleTasteSlackReaction(
      {
        type: 'reaction_added',
        user: TASTE_AUTHORITY_SLACK_USER_ID,
        reaction: TASTE_SLACK_APPROVE_REACTION,
        item: { type: 'message', channel: 'C123', ts: '1710000000.000100' },
      },
      { storePath }
    );

    expect(result).toEqual({
      handled: true,
      decision: 'approved',
      issueId: 'issue-1',
      identifier: 'JOV-100',
    });
    expect(approveMock).toHaveBeenCalledWith({
      apiKey: 'test-linear-key',
      issueId: 'issue-1',
      identifier: 'JOV-100',
      label: 'needs:taste',
      reviewerSlackUserId: TASTE_AUTHORITY_SLACK_USER_ID,
    });
    expect(preferenceMock).toHaveBeenCalledWith(
      expect.objectContaining({
        identifier: 'JOV-100',
        decision: 'approved',
        reviewerSlackUserId: TASTE_AUTHORITY_SLACK_USER_ID,
      })
    );
  });

  it('routes back on Aria thumbs-down without clearing the label', async () => {
    const result = await handleTasteSlackReaction(
      {
        type: 'reaction_added',
        user: TASTE_AUTHORITY_SLACK_USER_ID,
        reaction: TASTE_SLACK_REJECT_REACTION,
        item: { type: 'message', channel: 'C123', ts: '1710000000.000100' },
      },
      { storePath }
    );

    expect(result).toEqual({
      handled: true,
      decision: 'rejected',
      issueId: 'issue-1',
      identifier: 'JOV-100',
    });
    expect(rejectMock).toHaveBeenCalled();
    expect(approveMock).not.toHaveBeenCalled();
    expect(preferenceMock).toHaveBeenCalledWith(
      expect.objectContaining({ decision: 'rejected' })
    );
  });
});
