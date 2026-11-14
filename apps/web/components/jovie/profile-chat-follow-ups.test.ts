import { describe, expect, it } from 'vitest';
import {
  isOwnProfileChipTurn,
  PROFILE_CHAT_FOLLOW_UPS,
  profileFollowUpAnchorId,
} from './profile-chat-follow-ups';

const chip = '@profile:profile-1[Tim White]';
const user = (text: string) => ({
  id: 'u1',
  role: 'user' as const,
  parts: [{ type: 'text' as const, text }],
});
const assistant = (text: string, status?: string) => ({
  id: 'a1',
  role: 'assistant' as const,
  status,
  parts: [{ type: 'text' as const, text }],
});

describe('profile chat follow-ups', () => {
  it('offers two to four short next moves', () => {
    expect(PROFILE_CHAT_FOLLOW_UPS.length).toBeGreaterThanOrEqual(2);
    expect(PROFILE_CHAT_FOLLOW_UPS.length).toBeLessThanOrEqual(4);
    for (const item of PROFILE_CHAT_FOLLOW_UPS) {
      expect(item.label.split(' ').length).toBeLessThanOrEqual(4);
    }
  });

  it('recognises a chip-only turn for the signed-in profile only', () => {
    expect(isOwnProfileChipTurn(chip, 'profile-1')).toBe(true);
    expect(isOwnProfileChipTurn(` ${chip} `, 'profile-1')).toBe(true);
    expect(isOwnProfileChipTurn(`${chip} Plan my release`, 'profile-1')).toBe(
      false
    );
    expect(isOwnProfileChipTurn(chip, 'profile-2')).toBe(false);
    expect(isOwnProfileChipTurn(chip, undefined)).toBe(false);
  });

  it('anchors under the finished first reply and disappears after', () => {
    const messages = [user(chip), assistant('You have 1,240 profile views.')];
    expect(profileFollowUpAnchorId(messages, 'profile-1', false)).toBe('a1');
    expect(profileFollowUpAnchorId(messages, 'profile-1', true)).toBeNull();
    expect(
      profileFollowUpAnchorId(
        [user(chip), assistant('', 'pending')],
        'profile-1',
        false
      )
    ).toBeNull();
    expect(
      profileFollowUpAnchorId(
        [...messages, { ...user('Tighten my bio.'), id: 'u2' }],
        'profile-1',
        false
      )
    ).toBeNull();
  });
});
