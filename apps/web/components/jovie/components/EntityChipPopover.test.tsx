import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ComponentProps, ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fastRender } from '@/tests/utils/fast-render';
import { EntityChip } from './EntityChip';
import { EntityChipPopover } from './EntityChipPopover';

vi.mock('@/lib/flags/client', () => ({
  useAppFlag: () => false,
}));

vi.mock('@/app/app/(shell)/chat/ChatEntityPanelContext', () => ({
  useOptionalChatEntityPanel: () => null,
}));

vi.mock('next/image', () => ({
  default: ({ src, alt, ...rest }: ComponentProps<'img'>) => (
    <img src={src as string} alt={alt ?? ''} {...rest} />
  ),
}));

function renderPopover(children?: ReactNode) {
  return fastRender(
    <EntityChipPopover kind='release' id='rel_1' label='Sober'>
      {children ?? (
        <EntityChip
          data={{ kind: 'release', id: 'rel_1', label: 'Sober' }}
          variant='transcript'
        />
      )}
    </EntityChipPopover>
  );
}

describe('EntityChipPopover', () => {
  it('exposes the trigger with proper aria semantics', () => {
    renderPopover();
    const trigger = screen.getByTestId('entity-chip-popover-trigger');
    expect(trigger.tagName).toBe('BUTTON');
    expect(trigger.getAttribute('aria-haspopup')).toBe('dialog');
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    expect(trigger.getAttribute('aria-label')).toBe('Release: Sober');
  });

  it('opens on click and reflects aria-expanded', async () => {
    const user = userEvent.setup();
    renderPopover();
    const trigger = screen.getByTestId('entity-chip-popover-trigger');
    await user.click(trigger);
    await waitFor(() =>
      expect(trigger.getAttribute('aria-expanded')).toBe('true')
    );
    expect(screen.getByTestId('entity-chip-popover-content')).toBeTruthy();
  });

  it('opens on keyboard Enter', async () => {
    const user = userEvent.setup();
    renderPopover();
    const trigger = screen.getByTestId('entity-chip-popover-trigger');
    trigger.focus();
    await user.keyboard('{Enter}');
    await waitFor(() =>
      expect(trigger.getAttribute('aria-expanded')).toBe('true')
    );
  });

  it('opens on keyboard Space', async () => {
    const user = userEvent.setup();
    renderPopover();
    const trigger = screen.getByTestId('entity-chip-popover-trigger');
    trigger.focus();
    await user.keyboard(' ');
    await waitFor(() =>
      expect(trigger.getAttribute('aria-expanded')).toBe('true')
    );
  });

  it('closes on Escape and returns focus to trigger', async () => {
    const user = userEvent.setup();
    renderPopover();
    const trigger = screen.getByTestId('entity-chip-popover-trigger');
    await user.click(trigger);
    await waitFor(() =>
      expect(trigger.getAttribute('aria-expanded')).toBe('true')
    );
    await user.keyboard('{Escape}');
    await waitFor(() =>
      expect(trigger.getAttribute('aria-expanded')).toBe('false')
    );
    expect(document.activeElement).toBe(trigger);
  });

  it('lazy-mounts content: popover content is not in the DOM until open', () => {
    renderPopover();
    expect(screen.queryByTestId('entity-chip-popover-content')).toBeNull();
  });

  it('renders label inside the popover body when open', async () => {
    const user = userEvent.setup();
    renderPopover();
    await user.click(screen.getByTestId('entity-chip-popover-trigger'));
    const content = await screen.findByTestId('entity-chip-popover-content');
    expect(content.textContent).toContain('Sober');
  });
});
