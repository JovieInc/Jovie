import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ComponentProps } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
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

describe('ImageAttachmentChip certificate', () => {
  it('is axe-clean closed and opens the preview dialog on click', async () => {
    const user = userEvent.setup();
    const { container } = render(
      <ImageAttachmentChip
        url='https://example.com/cover.png'
        name='cover.png'
        tone='onLight'
      />
    );

    await expectNoA11yViolations(container);

    const trigger = screen.getByRole('button', {
      name: 'Image attachment: cover.png',
    });
    expect(trigger).toHaveAttribute('aria-expanded', 'false');

    await user.click(trigger);

    expect(trigger).toHaveAttribute('aria-expanded', 'true');
  });

  it('keeps the dark tone axe-clean without a name', async () => {
    const { container } = render(
      <ImageAttachmentChip url='https://example.com/a.png' tone='onDark' />
    );

    expect(screen.getByTestId('image-attachment-chip')).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });
});
