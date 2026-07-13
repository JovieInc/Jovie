import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ComponentProps, ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fastRender } from '@/tests/utils/fast-render';
import { EntityChip } from './EntityChip';
import { EntityChipPopover } from './EntityChipPopover';

const mockEntityPanelState = vi.hoisted(() => ({
  designV1Enabled: false,
  entityPanel: null as null | { open: (payload: unknown) => void },
}));

vi.mock('@/lib/flags/client', () => ({
  useAppFlag: () => mockEntityPanelState.designV1Enabled,
}));

vi.mock('@/app/app/(shell)/chat/ChatEntityPanelContext', () => ({
  useOptionalChatEntityPanel: () => mockEntityPanelState.entityPanel,
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
  beforeEach(() => {
    mockEntityPanelState.designV1Enabled = false;
    mockEntityPanelState.entityPanel = null;
  });

  it('exposes the trigger with proper aria semantics', () => {
    renderPopover();
    const trigger = screen.getByTestId('entity-chip-popover-trigger');
    expect(trigger.tagName).toBe('BUTTON');
    expect(trigger.getAttribute('aria-haspopup')).toBe('dialog');
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    expect(trigger.getAttribute('aria-label')).toBe('Release: Sober');
    expect(trigger).toHaveClass('system-b-entity-chip-trigger');
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

  it('opens on mouse hover and closes after pointer leave', async () => {
    const user = userEvent.setup();
    renderPopover();
    const trigger = screen.getByTestId('entity-chip-popover-trigger');

    await user.hover(trigger);

    await waitFor(() =>
      expect(trigger.getAttribute('aria-expanded')).toBe('true')
    );
    expect(screen.getByTestId('entity-chip-popover-content')).toBeTruthy();

    await user.unhover(trigger);

    await waitFor(() =>
      expect(trigger.getAttribute('aria-expanded')).toBe('false')
    );
    expect(screen.queryByTestId('entity-chip-popover-content')).toBeNull();
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

  it('uses the chat overlay tier with an opaque bounded surface', async () => {
    const user = userEvent.setup();
    renderPopover();
    await user.click(screen.getByTestId('entity-chip-popover-trigger'));
    const content = await screen.findByTestId('entity-chip-popover-content');

    expect(content).toHaveClass('system-b-entity-chip-popover-content');
    expect(
      content.querySelector('.system-b-entity-chip-popover-body')
    ).toBeTruthy();
    expect(
      content.querySelector('.system-b-entity-chip-popover-placeholder')
    ).toBeTruthy();
    expect(
      content.querySelector('.system-b-entity-chip-popover-title')
    ).toHaveTextContent('Sober');
  });

  it('renders the release panel action with System B casing and primitives', async () => {
    const user = userEvent.setup();
    const openEntityPanel = vi.fn();
    mockEntityPanelState.designV1Enabled = true;
    mockEntityPanelState.entityPanel = { open: openEntityPanel };

    renderPopover();
    await user.click(screen.getByTestId('entity-chip-popover-trigger'));

    const action = await screen.findByRole('button', {
      name: /Open Release/i,
    });
    expect(action).toHaveClass('system-b-entity-chip-popover-action');
    expect(action).toHaveTextContent('Open Release');

    await user.click(action);

    expect(openEntityPanel).toHaveBeenCalledWith({
      kind: 'release',
      id: 'rel_1',
      label: 'Sober',
      source: 'manual',
      focusKey: 'release:rel_1:Sober',
    });
  });
});
