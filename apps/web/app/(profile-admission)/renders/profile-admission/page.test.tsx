import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

const { fixtureEnabledMock, notFoundMock } = vi.hoisted(() => ({
  fixtureEnabledMock: vi.fn(),
  notFoundMock: vi.fn(() => {
    throw new Error('NEXT_NOT_FOUND');
  }),
}));

vi.mock('next/navigation', () => ({
  notFound: notFoundMock,
}));

vi.mock('@/lib/render-fixture-policy', () => ({
  isRenderFixtureEnabled: fixtureEnabledMock,
  RENDER_FIXTURE_METADATA: {
    robots: { index: false, follow: false },
  },
}));

vi.mock(
  '../../../(marketing)/renders/profile-admission/ProfileAdmissionFixtureClient',
  () => ({
    ProfileAdmissionFixtureClient: ({
      params,
    }: {
      params: Record<string, string | string[] | undefined>;
    }) => (
      <div data-testid='fixture-client'>
        {String(params.layout ?? 'missing')}
      </div>
    ),
  })
);

import ProfileAdmissionFixturePage from './page';

describe('ProfileAdmissionFixturePage', () => {
  it('keeps the guarded route outside the marketing shell', async () => {
    fixtureEnabledMock.mockReturnValue(true);

    render(
      await ProfileAdmissionFixturePage({
        searchParams: Promise.resolve({ layout: 'public' }),
      })
    );

    expect(screen.getByRole('main')).toHaveClass(
      'flex',
      'h-dvh',
      'overflow-hidden'
    );
    expect(screen.getByTestId('fixture-client')).toHaveTextContent('public');
    expect(notFoundMock).not.toHaveBeenCalled();
  });

  it('fails closed before resolving route params when disabled', async () => {
    fixtureEnabledMock.mockReturnValue(false);

    await expect(
      ProfileAdmissionFixturePage({
        searchParams: Promise.resolve({
          layout: 'public',
          secret: 'must-not-render',
        }),
      })
    ).rejects.toThrow('NEXT_NOT_FOUND');

    expect(notFoundMock).toHaveBeenCalledOnce();
    expect(screen.queryByText('must-not-render')).toBeNull();
  });
});
