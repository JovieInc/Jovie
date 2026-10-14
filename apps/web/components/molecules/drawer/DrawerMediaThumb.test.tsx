import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { DrawerMediaThumb } from './DrawerMediaThumb';

const { nextImage } = vi.hoisted(() => ({ nextImage: vi.fn() }));

vi.mock('next/image', () => ({
  default: ({
    fill: _fill,
    priority: _priority,
    alt,
    ...props
  }: {
    readonly src: string;
    readonly alt: string;
    readonly fill?: boolean;
    readonly [key: string]: unknown;
  }) => {
    nextImage({ alt, ...props });
    return <img alt={alt} {...props} />;
  },
}));

describe('DrawerMediaThumb', () => {
  it('uses explicit dimensions for the 60px profile header avatar without fill', () => {
    nextImage.mockClear();

    render(
      <DrawerMediaThumb
        src='/avatars/default-user.png'
        alt='Artist profile'
        dimension={60}
        sizeClassName='h-15 w-15 rounded-xl'
        imageClassName='rounded-xl'
        fallback={<span>AP</span>}
      />
    );

    const media = screen.getByRole('img', { name: 'Artist profile' });
    const image = media.querySelector('img');
    expect(image).toHaveAttribute('width', '60');
    expect(image).toHaveAttribute('height', '60');
    expect(image).not.toHaveAttribute('fill');
    expect(image).toHaveClass('h-full', 'w-full', 'object-cover', 'rounded-xl');
    expect(nextImage).toHaveBeenCalledWith(
      expect.objectContaining({ height: 60, width: 60 })
    );
    expect(nextImage.mock.calls[0]?.[0]).not.toHaveProperty('fill');
  });
});

it('retains its accessible identity on failure and retries a replacement URL', () => {
  const onImageError = vi.fn();
  const props = { alt: 'Alex Rivera', fallback: <span>AR</span>, onImageError };
  const { container, rerender } = render(
    <DrawerMediaThumb {...props} src='/first.jpg' />
  );
  fireEvent.error(container.querySelector('img')!);
  expect(onImageError).toHaveBeenCalledOnce();
  expect(screen.getByRole('img', { name: 'Alex Rivera' })).toHaveTextContent(
    'AR'
  );
  rerender(<DrawerMediaThumb {...props} src='/replacement.jpg' />);
  expect(container.querySelector('img')).toHaveAttribute(
    'src',
    '/replacement.jpg'
  );
});
