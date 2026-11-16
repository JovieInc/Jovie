import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { ZoomParallax } from './zoom-parallax';

const IMAGES = [
  { src: '/images/feature_speed_minimal_arc_1344x1280.webp', alt: 'Speed' },
  { src: '/images/feature_zero_setup_plug_1344x1280.webp' },
];

describe('ZoomParallax', () => {
  it('renders each image with its alt or a generated fallback', async () => {
    const { container } = render(
      <ZoomParallax
        images={IMAGES}
        priorityFirstImage={false}
        className='mt-4'
      />
    );

    expect(screen.getByRole('img', { name: 'Speed' })).toBeInTheDocument();
    expect(
      screen.getByRole('img', { name: 'Parallax image 2' })
    ).toBeInTheDocument();
    expect(container.firstElementChild).toHaveClass('mt-4');
    await expectNoA11yViolations(container);
  });

  it('renders an empty stage without images', async () => {
    const { container } = render(<ZoomParallax images={[]} />);

    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    expect(container.querySelector('.sticky')).not.toBeNull();
    await expectNoA11yViolations(container);
  });
});
