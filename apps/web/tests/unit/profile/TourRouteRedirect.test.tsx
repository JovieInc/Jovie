import { render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getProfileModeHref } from '@/components/profile/registry';
import TourPage from '../../../app/[username]/tour/page';

const { replaceMock, searchParamsMock } = vi.hoisted(() => ({
  replaceMock: vi.fn(),
  searchParamsMock: vi.fn(() => new URLSearchParams()),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    replace: replaceMock,
  }),
  useSearchParams: () => searchParamsMock(),
}));

describe('/[username]/tour redirect', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    searchParamsMock.mockReturnValue(new URLSearchParams());
  });

  it('redirects to profile tour mode', async () => {
    render(
      <TourPage
        params={Promise.resolve({
          username: 'testartist',
        })}
      />
    );

    await vi.waitFor(() => {
      expect(replaceMock).toHaveBeenCalledWith(
        getProfileModeHref('testartist', 'tour')
      );
    });
  });

  it('preserves source query parameter', async () => {
    searchParamsMock.mockReturnValue(new URLSearchParams('source=qr'));

    render(
      <TourPage
        params={Promise.resolve({
          username: 'testartist',
        })}
      />
    );

    await vi.waitFor(() => {
      expect(replaceMock).toHaveBeenCalledWith(
        getProfileModeHref('testartist', 'tour', '&source=qr')
      );
    });
  });
});
