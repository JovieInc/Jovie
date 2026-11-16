import { describe, expect, it } from 'vitest';
import { splitLeadingEntityMentions } from '@/lib/chat/tokens';
import { connectionChatDraft } from './connection-chat-context';
import type { ProfileWorkspaceRow } from './data';

const data = {
  profileId: '8473a72f-51a0-4ce0-8739-4facfd89a7a5',
  artist: {
    name: 'Tim White',
    username: 'tim',
    avatarUrl: null,
    isPublic: true,
  },
};

function surface(
  overrides: Partial<Extract<ProfileWorkspaceRow, { rowType: 'surface' }>>
): ProfileWorkspaceRow {
  return {
    id: '67fbd30e-1378-44c1-96ce-5aad13f11fc6',
    rowType: 'surface',
    kind: 'jovie',
    platform: 'jovie',
    label: 'Tim White',
    handle: 'tim',
    url: 'https://jov.ie/tim',
    trackedUrl: null,
    qualificationStatus: 'qualified',
    isOfficial: true,
    monitoringState: 'active',
    rank: null,
    previousRank: null,
    lastObservedAt: null,
    ...overrides,
  } as ProfileWorkspaceRow;
}

describe('connectionChatDraft', () => {
  it('opens the own Jovie profile as a profile chip and nothing else', () => {
    const draft = connectionChatDraft(surface({}), data);
    const { mentions, text } = splitLeadingEntityMentions(draft);
    expect(mentions).toEqual([
      {
        type: 'entity',
        kind: 'profile',
        id: data.profileId,
        label: 'Tim White',
      },
    ]);
    expect(text).toBe('');
  });

  it('names another surface in words the person can read', () => {
    const draft = connectionChatDraft(
      surface({
        id: 'surface-ig',
        kind: 'social',
        platform: 'instagram',
        label: 'Instagram',
        handle: 'timwhite',
        url: 'https://www.instagram.com/timwhite/',
      }),
      data
    );
    const { mentions, text } = splitLeadingEntityMentions(draft);
    expect(mentions.map(m => m.kind)).toEqual(['profile']);
    expect(text).toBe('Help me with my Instagram (instagram.com/timwhite).');
  });

  it('falls back to the handle when the row has no public link', () => {
    const row: ProfileWorkspaceRow = {
      rowType: 'connector',
      kind: 'connector',
      platform: 'gmail',
      id: 'connector-17',
      label: 'Email',
      handle: 'tim@example.com',
      url: '/app/settings/connectors',
      status: 'connected',
      monitoringState: 'active',
    };
    const { text } = splitLeadingEntityMentions(connectionChatDraft(row, data));
    expect(text).toBe('Help me with my Email (tim@example.com).');
  });

  it('never puts machine context in the visible text', () => {
    const { text } = splitLeadingEntityMentions(
      connectionChatDraft(surface({}), data)
    );
    expect(text).not.toMatch(/[{}]|profileId|entityId|instructions/);
  });
});
