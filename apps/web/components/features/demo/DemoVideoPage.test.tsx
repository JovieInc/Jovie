import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DemoVideoPage } from './DemoVideoPage';

const { flags } = vi.hoisted(() => ({
  flags: { SHOW_PRODUCT_DEMO_VIDEO: true },
}));

vi.mock('@/lib/flags/marketing-static', () => ({ FEATURE_FLAGS: flags }));
vi.mock('./DemoVideoPlayer', () => ({
  DemoVideoPlayer: () => <div data-testid='demo-video-player' />,
}));

describe('DemoVideoPage', () => {
  beforeEach(() => {
    flags.SHOW_PRODUCT_DEMO_VIDEO = true;
  });

  it('sends "Try it free" into the /start flow', () => {
    render(<DemoVideoPage />);
    expect(screen.getByRole('link', { name: 'Try it free' })).toHaveAttribute(
      'href',
      '/start'
    );
  });

  it('renders nothing while the demo video is off', () => {
    flags.SHOW_PRODUCT_DEMO_VIDEO = false;
    const { container } = render(<DemoVideoPage />);
    expect(container).toBeEmptyDOMElement();
  });
});
