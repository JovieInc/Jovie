import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { DirectDspImagesProvider } from '@/lib/images/direct-dsp-images';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { DrawerMediaThumb } from './DrawerMediaThumb';

const { nextImage } = vi.hoisted(() => ({ nextImage: vi.fn() }));

vi.mock('next/image', () => ({
  default: ({
    fill: _fill,
    priority: _priority,
    unoptimized,
    alt,
    ...props
  }: {
    readonly src: string;
    readonly alt: string;
    readonly fill?: boolean;
    readonly unoptimized?: boolean;
    readonly [key: string]: unknown;
  }) => {
    nextImage({ alt, unoptimized, ...props });
    return <img alt={alt} {...props} />;
  },
}));

describe('DrawerMediaThumb', () => {
  it('uses explicit dimensions for the 60px profile header avatar without fill', async () => {
    nextImage.mockClear();

    const { container } = render(
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
    await expectNoA11yViolations(container);
  });
});

it('retains its accessible identity on failure and retries a replacement URL', async () => {
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
  await expectNoA11yViolations(container);
  rerender(<DrawerMediaThumb {...props} src='/replacement.jpg' />);
  expect(container.querySelector('img')).toHaveAttribute(
    'src',
    '/replacement.jpg'
  );
});

// 2026-11-08: the onboarding draft portrait sat blank while /_next/image
// cold-transformed it. Inside a direct-DSP preview it loads from Spotify.
it('loads a Spotify portrait directly inside a direct-DSP preview', () => {
  nextImage.mockClear();
  const src =
    'https://i.scdn.co/image/ab6761610000e5ebcdce7620dc940db079bf4952';
  render(
    <DirectDspImagesProvider>
      <DrawerMediaThumb src={src} alt='UNMARKED' fallback={<span>U</span>} />
    </DirectDspImagesProvider>
  );
  expect(nextImage).toHaveBeenLastCalledWith(
    expect.objectContaining({ src, unoptimized: true })
  );
});

it('hides a decorative thumb with no alt text from assistive tech', async () => {
  const { container } = render(
    <div>
      <DrawerMediaThumb src={null} alt='' fallback={<span>MS</span>} />
      <span>Midnight Static</span>
    </div>
  );
  expect(screen.queryByRole('img')).toBeNull();
  expect(container.querySelector('[aria-hidden="true"]')).toHaveTextContent(
    'MS'
  );
  await expectNoA11yViolations(container);
});

it('keeps non-preview portraits on the image optimizer', () => {
  nextImage.mockClear();
  render(
    <DrawerMediaThumb
      src='https://i.scdn.co/image/test'
      alt='Artist'
      fallback={<span>A</span>}
    />
  );
  expect(nextImage.mock.calls.at(-1)?.[0]?.unoptimized).toBeUndefined();
});
