import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { DrawerMediaThumb } from './DrawerMediaThumb';

const { nextImage } = vi.hoisted(() => ({ nextImage: vi.fn() }));

vi.mock('next/image', () => ({
  default: ({
    fill: _fill,
    ...props
  }: {
    readonly src: string;
    readonly alt: string;
    readonly fill?: boolean;
    readonly [key: string]: unknown;
  }) => {
    nextImage(props);
    return <img {...props} />;
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
        fallback={<span>AP</span>}
      />
    );

    const image = screen.getByRole('img', { name: 'Artist profile' });
    expect(image).toHaveAttribute('width', '60');
    expect(image).toHaveAttribute('height', '60');
    expect(image).not.toHaveAttribute('fill');
    expect(image).toHaveClass('h-full', 'w-full', 'object-cover');
    expect(nextImage).toHaveBeenCalledWith(
      expect.objectContaining({ height: 60, width: 60 })
    );
    expect(nextImage.mock.calls[0]?.[0]).not.toHaveProperty('fill');
  });
});
