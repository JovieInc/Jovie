import { describe, expect, it } from 'vitest';
import { connectionChatDraft } from './connection-chat-context';
import type { ProfileWorkspaceRow } from './data';

describe('connectionChatDraft', () => {
  it('carries the exact entity and profile rather than only the platform name', () => {
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
    const draft = connectionChatDraft(row, {
      profileId: 'profile-11',
      artist: { name: 'Tim', username: 'tim', avatarUrl: null, isPublic: true },
    });
    expect(JSON.parse(draft.split('\n').at(-1) ?? '')).toEqual({
      profileId: 'profile-11',
      owner: 'Tim',
      entityKind: 'connector',
      entityId: 'connector-17',
      platform: 'gmail',
      name: 'Email',
      handle: 'tim@example.com',
      url: '/app/settings/connectors',
    });
  });
});
