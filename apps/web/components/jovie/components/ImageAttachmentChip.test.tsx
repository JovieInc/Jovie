import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ComponentProps } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fastRender } from '@/tests/utils/fast-render';
import { ImageAttachmentChip } from './ImageAttachmentChip';

vi.mock('next/image', () => ({
  default: ({
    src,
    alt,
    unoptimized: _unoptimized,
    ...rest
  }: ComponentProps<'img'> & { unoptimized?: boolean }) => (
    <img src={src as string} alt={alt ?? ''} {...rest} />
  ),
}));

function renderChip() {
  return fastRender(
    <ImageAttachmentChip
      url='https://example.com/cover.png'
      name='cover.png'
      tone='onLight'
    />
  );
}

describe('ImageAttachmentChip', () => {
  it('exposes a dialog trigger with compact chip content', () => {
    renderChip();

    const trigger = screen.getByTestId('image-attachment-chip-trigger');
    expect(trigger.tagName).toBe('BUTTON');
    expect(trigger).toHaveAttribute('aria-haspopup', 'dialog');
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    expect(trigger).toHaveAttribute(
      'aria-label',
      'Image attachment: cover.png'
    );
    expect(screen.getByTestId('image-attachment-chip')).toHaveTextContent(
      'cover.png'
    );
  });

  it('opens on click and reflects aria-expanded', async () => {
    const user = userEvent.setup();
    renderChip();

    const trigger = screen.getByTestId('image-attachment-chip-trigger');
    await user.click(trigger);

    await waitFor(() =>
      expect(trigger.getAttribute('aria-expanded')).toBe('true')
    );
    expect(screen.getByTestId('image-attachment-popover-content')).toBeTruthy();
  });

  it('uses the chat overlay tier with an opaque viewport-bounded surface', async () => {
    const user = userEvent.setup();
    renderChip();

    const trigger = screen.getByTestId('image-attachment-chip-trigger');
    await user.click(trigger);
    const content = await screen.findByTestId(
      'image-attachment-popover-content'
    );

    expect(content.className).toContain('z-[150]');
    expect(content.className).toContain('bg-surface-1');
    expect(content.className).toContain('shadow-popover');
    expect(content.className).toContain('calc(100vw-24px)');
    expect(content.className).toContain(
      '--radix-popover-content-available-height'
    );
  });

  it('opens on keyboard Enter and closes on Escape', async () => {
    const user = userEvent.setup();
    renderChip();

    const trigger = screen.getByTestId('image-attachment-chip-trigger');
    trigger.focus();
    await user.keyboard('{Enter}');

    await waitFor(() =>
      expect(trigger.getAttribute('aria-expanded')).toBe('true')
    );

    await user.keyboard('{Escape}');

    await waitFor(() =>
      expect(trigger.getAttribute('aria-expanded')).toBe('false')
    );
    expect(document.activeElement).toBe(trigger);
  });

  it('opens on hover and closes after pointer leave', async () => {
    const user = userEvent.setup();
    renderChip();

    const trigger = screen.getByTestId('image-attachment-chip-trigger');
    await user.hover(trigger);

    await waitFor(() =>
      expect(trigger.getAttribute('aria-expanded')).toBe('true')
    );

    await user.unhover(trigger);

    await waitFor(() =>
      expect(trigger.getAttribute('aria-expanded')).toBe('false')
    );
  });
});
