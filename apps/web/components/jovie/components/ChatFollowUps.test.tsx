import { fireEvent, render, renderHook, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { PROFILE_CHAT_FOLLOW_UPS } from '../profile-chat-follow-ups';
import { ChatFollowUps, useProfileChatFollowUps } from './ChatFollowUps';

const PROFILE_ID = 'profile-own';
const chip = `@profile:${PROFILE_ID}[Tim White]`;
const thread = [
  {
    id: 'u1',
    role: 'user' as const,
    parts: [{ type: 'text' as const, text: chip }],
  },
  {
    id: 'a1',
    role: 'assistant' as const,
    parts: [{ type: 'text' as const, text: 'Your profile pulled 40 views.' }],
  },
];

describe('ChatFollowUps', () => {
  it('sends the prompt behind a tapped next move', () => {
    const onSelect = vi.fn();
    render(
      <ChatFollowUps items={PROFILE_CHAT_FOLLOW_UPS} onSelect={onSelect} />
    );
    fireEvent.click(screen.getByRole('button', { name: 'Tighten My Bio' }));
    expect(onSelect).toHaveBeenCalledWith('Tighten my bio.');
  });
});

describe('useProfileChatFollowUps', () => {
  it('anchors under the first reply of a profile chat', () => {
    const onSelect = vi.fn();
    const { result } = renderHook(() =>
      useProfileChatFollowUps(thread, PROFILE_ID, false, onSelect)
    );
    expect(result.current?.afterMessageId).toBe('a1');
  });

  it('stays off while streaming or with no handler', () => {
    const streaming = renderHook(() =>
      useProfileChatFollowUps(thread, PROFILE_ID, true, vi.fn())
    );
    expect(streaming.result.current).toBeNull();
    const noHandler = renderHook(() =>
      useProfileChatFollowUps(thread, PROFILE_ID, false, undefined)
    );
    expect(noHandler.result.current).toBeNull();
  });
});
