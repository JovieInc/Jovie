import { render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { HomeProfileShowcase } from './HomeProfileShowcase';

const { captureSurface } = vi.hoisted(() => ({ captureSurface: vi.fn() }));
vi.mock('../profile/templates/ProfileCompactSurface', () => ({
  ProfileCompactSurface: (props: Record<string, unknown>) => {
    captureSurface(props);
    return <div data-testid='mounted-preview' />;
  },
}));

it('keeps the real mock-home subject in an inert preview instead of enabling fan capture', () => {
  render(<HomeProfileShowcase stateId='mock-home' overlayMode='hidden' />);

  expect(screen.getByTestId('mounted-preview')).toBeInTheDocument();
  expect(screen.getByTestId('homepage-phone-state-mock-home')).toHaveAttribute(
    'aria-hidden',
    'true'
  );
  expect(screen.getByTestId('homepage-phone-state-mock-home')).toHaveAttribute(
    'inert'
  );
  expect(captureSurface).toHaveBeenCalledWith(
    expect.objectContaining({
      renderMode: 'preview',
      presentation: 'embedded',
      artist: expect.objectContaining({
        name: 'Tim White',
        handle: 'timwhite',
      }),
      latestRelease: expect.objectContaining({ title: 'Take Me Over' }),
    })
  );
});

it('rounds reference captures while keeping the preview inert', () => {
  render(
    <HomeProfileShowcase stateId='mock-home' referenceImageSrc='/preview.png' />
  );

  const image = screen.getByAltText('Tim White mock home review');
  expect(image).toHaveClass('marketing-rounded-frame');
  expect(image).toHaveAttribute('width', '853');
  expect(screen.getByTestId('homepage-phone-state-mock-home')).toHaveAttribute(
    'inert'
  );
  expect(screen.queryByTestId('mounted-preview')).not.toBeInTheDocument();
});
