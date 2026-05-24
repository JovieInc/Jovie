import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import {
  ZoomParallax,
  type ZoomParallaxImage,
} from '@/components/ui/zoom-parallax';

vi.mock('next/image', () => ({
  default: ({
    alt,
    src,
    fill: _fill,
    priority: _priority,
    ...props
  }: React.ImgHTMLAttributes<HTMLImageElement> & {
    src: string;
    fill?: boolean;
    priority?: boolean;
  }) => <img alt={alt} src={src} {...props} />,
}));

describe('ZoomParallax', () => {
  it('renders at most seven images from the provided list', () => {
    const images: ZoomParallaxImage[] = Array.from(
      { length: 9 },
      (_, index) => ({
        src: `https://images.unsplash.com/photo-${index}`,
        alt: `Image ${index + 1}`,
      })
    );

    render(<ZoomParallax images={images} priorityFirstImage={false} />);

    expect(screen.getAllByRole('img')).toHaveLength(7);
    expect(screen.queryByAltText('Image 8')).not.toBeInTheDocument();
  });

  it('falls back to generated alt text when alt is omitted', () => {
    render(
      <ZoomParallax
        images={[
          { src: 'https://images.unsplash.com/photo-a' },
          { src: 'https://images.unsplash.com/photo-b', alt: 'Named image' },
        ]}
        priorityFirstImage={false}
      />
    );

    expect(screen.getByAltText('Parallax image 1')).toBeInTheDocument();
    expect(screen.getByAltText('Named image')).toBeInTheDocument();
  });
});
