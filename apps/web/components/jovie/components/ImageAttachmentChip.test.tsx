import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ComponentProps } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
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

function renderChip(
  props: Partial<ComponentProps<typeof ImageAttachmentChip>> = {}
) {
  return fastRender(
    <ImageAttachmentChip
      url='https://example.com/cover.png'
      name='cover.png'
      tone='onLight'
      {...props}
    />
  );
}

describe('ImageAttachmentChip', () => {
  it.each([
    { state: 'named', name: 'cover.png' as string | undefined },
    { state: 'empty filename', name: undefined },
    {
      state: 'long content',
      name: 'final-album-cover-art-for-international-tour-deluxe-edition-master.png',
    },
  ])('has no axe violations in the $state state', async ({ name }) => {
    const { container } = renderChip({ name });
    await expectNoA11yViolations(container);
  });

  it('has no axe violations in an RTL overflow frame', async () => {
    const { container } = fastRender(
      <div dir='rtl' className='w-40'>
        <ImageAttachmentChip
          url='https://example.com/cover.png'
          name='غلاف-الألبوم-النهائي.png'
          tone='onLight'
        />
      </div>
    );
    await expectNoA11yViolations(container);
  });

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
    expect(
      screen.getByTestId('image-attachment-popover-content').className
    ).toContain('z-popover');
  });

  it('uses the chat overlay tier with a System B popover surface', async () => {
    const user = userEvent.setup();
    renderChip();

    const trigger = screen.getByTestId('image-attachment-chip-trigger');
    await user.click(trigger);
    const content = await screen.findByTestId(
      'image-attachment-popover-content'
    );

    expect(content.className).toContain('z-popover');
    expect(
      content.querySelector('.system-b-image-attachment-popover')?.className
    ).toContain('system-b-image-attachment-popover');
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
