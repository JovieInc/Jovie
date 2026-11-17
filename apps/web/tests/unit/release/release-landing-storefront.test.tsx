import '../../fixtures/release-landing-page';
import { render, screen, waitFor } from '@testing-library/react';
import { renderToString } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ReleaseLandingPage } from '@/app/r/[slug]/ReleaseLandingPage';
import { COUNTRY_CODE_COOKIE } from '@/constants/app';
import { defaultProps } from '../../fixtures/release-landing-page-data';

const storedUrl = 'https://music.apple.com/us/album/midnight/123?i=456';
const providers = [{ ...defaultProps.providers[1], url: storedUrl }];

afterEach(() => vi.restoreAllMocks());

describe('release provider storefront', () => {
  it('keeps stored SSR markup and hydrates the visible action to the visitor storefront', async () => {
    vi.spyOn(document, 'cookie', 'get').mockReturnValue(
      `${COUNTRY_CODE_COOKIE}=JP`
    );
    const page = <ReleaseLandingPage {...defaultProps} providers={providers} />;
    const html = renderToString(page);
    expect(html).toContain('/us/album/midnight/123?i=456');
    expect(html).not.toContain('/jp/album/');

    render(page);
    await waitFor(() =>
      expect(screen.getByTestId('provider-button')).toHaveAttribute(
        'data-href',
        'https://music.apple.com/jp/album/midnight/123?i=456&utm_source=jovie'
      )
    );
  });

  it.each(['XX', ''])(
    'retains the stored destination for unsupported country %s',
    async country => {
      vi.spyOn(document, 'cookie', 'get').mockReturnValue(
        `${COUNTRY_CODE_COOKIE}=${country}`
      );
      render(<ReleaseLandingPage {...defaultProps} providers={providers} />);
      await waitFor(() =>
        expect(screen.getByTestId('provider-button')).toHaveAttribute(
          'data-href',
          `${storedUrl}&utm_source=jovie`
        )
      );
    }
  );
});
