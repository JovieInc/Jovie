import { fireEvent, render, renderHook, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
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
  it('sends the focused next move with Enter and Space', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(
      <ChatFollowUps items={PROFILE_CHAT_FOLLOW_UPS} onSelect={onSelect} />
    );
    await user.tab();
    expect(
      screen.getByRole('button', { name: 'Plan My Next Release' })
    ).toHaveFocus();
    await user.keyboard('{Enter}');
    await user.tab();
    await user.keyboard(' ');
    expect(onSelect.mock.calls).toEqual([
      ['Plan my next release.'],
      ['Tighten my bio.'],
    ]);
  });

  it.each([
    { state: 'default', items: PROFILE_CHAT_FOLLOW_UPS, dir: 'ltr' },
    { state: 'empty', items: [], dir: 'ltr' },
    {
      state: 'long content',
      items: [
        {
          label: 'Review my next release and the audience I want to reach',
          prompt: 'Plan my next release.',
        },
      ],
      dir: 'ltr',
    },
    {
      state: 'right to left',
      items: [{ label: 'خطط لإصداري القادم', prompt: 'Plan my next release.' }],
      dir: 'rtl',
    },
  ])(
    'has accessible next moves in the $state state',
    async ({ items, dir }) => {
      const { container } = render(
        <div dir={dir}>
          <ChatFollowUps items={items} onSelect={vi.fn()} />
        </div>
      );
      expect(screen.queryAllByRole('button')).toHaveLength(items.length);
      for (const item of items) {
        expect(screen.getByRole('button', { name: item.label })).toBeVisible();
      }
      await expectNoA11yViolations(container);
    }
  );

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
