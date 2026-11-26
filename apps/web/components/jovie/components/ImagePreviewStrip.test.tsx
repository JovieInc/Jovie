import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ComponentProps } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { ImagePreviewStrip } from './ImagePreviewStrip';

vi.mock('next/image', () => ({
  default: ({
    src,
    alt,
    fill: _fill,
    unoptimized: _unoptimized,
    ...rest
  }: ComponentProps<'img'> & { fill?: boolean; unoptimized?: boolean }) => (
    <img src={src as string} alt={alt ?? ''} {...rest} />
  ),
}));

const image = (id: string, name: string) => ({
  id,
  name,
  mediaType: 'image/png',
  previewUrl: `blob:${id}`,
  dataUrl: `data:image/png;base64,${id}`,
});

describe('ImagePreviewStrip', () => {
  it('renders nothing when there are no images', () => {
    const { container } = render(
      <ImagePreviewStrip images={[]} onRemove={vi.fn()} />
    );

    expect(container).toBeEmptyDOMElement();
  });

  it('counts the images and removes one by id', async () => {
    const user = userEvent.setup();
    const onRemove = vi.fn();
    const { container } = render(
      <ImagePreviewStrip
        images={[image('a', 'cover.png'), image('b', 'press.png')]}
        onRemove={onRemove}
      />
    );

    expect(screen.getByText('2 images ready to send')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Remove press.png' }));

    expect(onRemove).toHaveBeenCalledWith('b');
    await expectNoA11yViolations(container);
  });

  it('uses the singular count for one image', async () => {
    const { container } = render(
      <ImagePreviewStrip
        images={[image('a', 'cover.png')]}
        onRemove={vi.fn()}
      />
    );

    expect(screen.getByText('1 image ready to send')).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });
});
