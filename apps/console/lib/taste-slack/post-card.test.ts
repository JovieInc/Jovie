import { mkdtemp } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { TasteIssue } from '../linear';
import { getTasteSlackCardByIssueId } from './card-store';
import { postTasteSlackCard } from './post-card';

const postMessageMock = vi.fn();
const addReactionsMock = vi.fn();

vi.mock('./slack-api', () => ({
  isTasteSlackConfigured: () => true,
  getTasteSlackChannelId: () => 'C_TASTE',
  postTasteSlackMessage: (...args: unknown[]) => postMessageMock(...args),
  addTasteSlackReactions: (...args: unknown[]) => addReactionsMock(...args),
}));

const sampleIssue: TasteIssue = {
  id: 'issue-42',
  identifier: 'JOV-42',
  title: 'Approve dashboard spacing',
  url: 'https://linear.app/jovie/issue/JOV-42',
  label: 'needs:taste',
  priority: 2,
  priorityLabel: 'High',
  createdAt: '2026-06-20T12:00:00.000Z',
  description: 'Spacing feels tight on mobile.',
  blockingReason: 'Spacing feels tight on mobile.',
};

describe('postTasteSlackCard', () => {
  let tempDir = '';
  let storePath = '';

  beforeEach(async () => {
    postMessageMock.mockReset();
    addReactionsMock.mockReset();
    postMessageMock.mockResolvedValue({
      ok: true,
      channel: 'C_TASTE',
      messageTs: '1710000001.000200',
    });
    addReactionsMock.mockResolvedValue(undefined);

    tempDir = await mkdtemp(path.join(os.tmpdir(), 'taste-slack-post-'));
    storePath = path.join(tempDir, 'cards.json');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('posts exactly one card per issue and records the message timestamp', async () => {
    const first = await postTasteSlackCard(sampleIssue, storePath);
    const second = await postTasteSlackCard(sampleIssue, storePath);

    expect(first).toEqual({
      posted: true,
      skipped: false,
      messageTs: '1710000001.000200',
    });
    expect(second).toEqual({
      posted: false,
      skipped: true,
      reason: 'Card already posted',
      messageTs: '1710000001.000200',
    });
    expect(postMessageMock).toHaveBeenCalledTimes(1);
    expect(addReactionsMock).toHaveBeenCalledWith({
      channel: 'C_TASTE',
      messageTs: '1710000001.000200',
    });

    const stored = await getTasteSlackCardByIssueId('issue-42', storePath);
    expect(stored?.messageTs).toBe('1710000001.000200');
    expect(stored?.identifier).toBe('JOV-42');
  });
});
