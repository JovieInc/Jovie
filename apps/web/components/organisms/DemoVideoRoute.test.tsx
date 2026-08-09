import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { DemoVideoPage } from '@/components/features/demo/DemoVideoPage';
import { APP_ROUTES } from '@/constants/routes';
import {
  DEMO_CAPTIONS_PUBLIC_PATH,
  getDemoVideoDownloadHref,
  getDemoVideoUrl,
} from '@/lib/demo-video';
import demoVideoMeta, {
  Web028DemoVideo,
  Web029DemoVideoAlias,
} from './DemoVideoRoute.stories';

vi.mock('@/components/features/demo/DemoVideoPlayer', () => ({
  DemoVideoPlayer: ({
    captionsUrl,
    label,
    videoUrl,
  }: {
    captionsUrl: string;
    label: string;
    videoUrl: string;
  }) => (
    <div
      data-testid='demo-video-player'
      data-captions-url={captionsUrl}
      data-label={label}
      data-video-url={videoUrl}
    />
  ),
}));

describe('DemoVideoPage route contract', () => {
  it('renders the exact accessible production body with canonical media URLs', () => {
    render(<DemoVideoPage />);

    expect(
      screen.getByRole('heading', {
        level: 1,
        name: 'Jovie Turns Artist Signals Into Execution',
      })
    ).toBeInTheDocument();
    expect(screen.getByTestId('demo-video-player')).toHaveAttribute(
      'data-label',
      'Jovie Demo Video'
    );
    expect(screen.getByTestId('demo-video-player')).toHaveAttribute(
      'data-captions-url',
      DEMO_CAPTIONS_PUBLIC_PATH
    );
    expect(screen.getByTestId('demo-video-player')).toHaveAttribute(
      'data-video-url',
      getDemoVideoUrl()
    );
    expect(screen.getByRole('link', { name: 'Download demo' })).toHaveAttribute(
      'href',
      getDemoVideoDownloadHref(getDemoVideoUrl())
    );
    expect(screen.getByRole('link', { name: 'Try it free' })).toHaveAttribute(
      'href',
      APP_ROUTES.SIGNUP
    );
  });

  it('binds both route identities to one exact component and no counter body', () => {
    const demoRoute = readFileSync(
      resolve(process.cwd(), 'app/(marketing)/demo/video/page.tsx'),
      'utf8'
    );
    const aliasRoute = readFileSync(
      resolve(process.cwd(), 'app/(marketing)/demovideo/page.tsx'),
      'utf8'
    );

    for (const source of [demoRoute, aliasRoute]) {
      expect(source).toContain(
        "import { DemoVideoPage } from '@/features/demo/DemoVideoPage';"
      );
      expect(source).toContain('return <DemoVideoPage />;');
      expect(source).toContain('robots: NOINDEX_ROBOTS');
      expect(source).toContain('export const revalidate = false');
    }

    expect(demoVideoMeta.component).toBe(DemoVideoPage);
    expect(demoVideoMeta.parameters.pen).toEqual({
      registryIds: ['web-028-demo--video', 'web-029-demovideo'],
      routes: ['/demo/video', '/demovideo'],
      source: 'apps/web/components/features/demo/DemoVideoPage.tsx',
      sourceSha: '61690d2a4af920183f4a85366799ff0bafe4540b',
      implementation: 'exact-production-component',
    });
    expect(Web028DemoVideo.parameters?.pen).toEqual({
      registryId: 'web-028-demo--video',
      route: '/demo/video',
    });
    expect(Web029DemoVideoAlias.parameters?.pen).toEqual({
      registryId: 'web-029-demovideo',
      route: '/demovideo',
    });
  });
});
