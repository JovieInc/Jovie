import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ProductDemoPage from '@/app/(marketing)/demo/video/page';
import ProductDemoVideoPage from '@/app/(marketing)/demovideo/page';
import { APP_ROUTES } from '@/constants/routes';

const { flags, redirectMock } = vi.hoisted(() => ({
  flags: { SHOW_PRODUCT_DEMO_VIDEO: false },
  redirectMock: vi.fn((href: string) => {
    throw new Error(`NEXT_REDIRECT:${href}`);
  }),
}));

vi.mock('@/lib/flags/marketing-static', () => ({ FEATURE_FLAGS: flags }));
vi.mock('next/navigation', () => ({ redirect: redirectMock }));
vi.mock('@/components/features/demo/DemoVideoPlayer', () => ({
  DemoVideoPlayer: ({ videoUrl }: { videoUrl: string }) => (
    <div data-testid='enabled-demo-video' data-video-url={videoUrl} />
  ),
}));

const routes = [
  ['/demo/video', ProductDemoPage],
  ['/demovideo', ProductDemoVideoPage],
] as const;

describe.each(routes)('%s feature availability', (_path, Page) => {
  beforeEach(() => {
    flags.SHOW_PRODUCT_DEMO_VIDEO = false;
    redirectMock.mockClear();
  });

  it('temporarily recovers to the real product page while video is unavailable', () => {
    expect(() => Page()).toThrow(`NEXT_REDIRECT:${APP_ROUTES.PRODUCT}`);
    expect(redirectMock).toHaveBeenCalledExactlyOnceWith(APP_ROUTES.PRODUCT);
  });

  it('retains the actual video, download and signup path when enabled', () => {
    flags.SHOW_PRODUCT_DEMO_VIDEO = true;
    render(Page());
    expect(redirectMock).not.toHaveBeenCalled();
    expect(
      screen.getByRole('heading', {
        name: 'Jovie Turns Artist Signals Into Execution',
      })
    ).toBeVisible();
    expect(screen.getByTestId('enabled-demo-video')).toHaveAttribute(
      'data-video-url'
    );
    expect(screen.getByRole('link', { name: 'Download demo' })).toBeVisible();
    expect(screen.getByRole('link', { name: 'Try it free' })).toHaveAttribute(
      'href',
      APP_ROUTES.START
    );
  });
});
