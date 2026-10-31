import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { FooterBranding } from './FooterBranding';

describe('FooterBranding', () => {
  it.each(['light', 'dark', 'linear'] as const)(
    'renders the named brand link in the %s variant',
    variant => {
      render(
        <FooterBranding
          mark='brand'
          variant={variant}
          artistHandle='test-artist'
          showCTA={false}
        />
      );

      const link = screen.getByRole('link', { name: 'Made with Jovie' });
      expect(link).toHaveAttribute(
        'href',
        '/?utm_source=profile&utm_artist=test-artist'
      );
      expect(link).toHaveTextContent('Made with Jovie');
      expect(link.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
      expect(screen.getAllByRole('link')).toHaveLength(1);
    }
  );

  it('keeps the brand link keyboard accessible', async () => {
    const user = userEvent.setup();
    render(<FooterBranding mark='brand' showCTA={false} />);

    await user.tab();

    expect(screen.getByRole('link', { name: 'Made with Jovie' })).toHaveFocus();
  });

  it('uses untracked destinations when there is no artist', () => {
    render(<FooterBranding mark='brand' />);

    expect(
      screen.getByRole('link', { name: 'Made with Jovie' })
    ).toHaveAttribute('href', '/');
    expect(
      screen.getByRole('link', { name: 'Join the waitlist' })
    ).toHaveAttribute('href', '/waitlist');
  });

  it('preserves artist attribution on the brand and waitlist links', () => {
    render(
      <FooterBranding
        mark='brand'
        variant='linear'
        artistHandle='test-artist'
      />
    );

    expect(
      screen.getByRole('link', { name: 'Made with Jovie' })
    ).toHaveAttribute('href', '/?utm_source=profile&utm_artist=test-artist');
    expect(
      screen.getByRole('link', { name: 'Join the waitlist' })
    ).toHaveAttribute(
      'href',
      '/waitlist?utm_source=profile&utm_artist=test-artist'
    );
  });

  it('retains the default icon link and optional waitlist action', () => {
    render(<FooterBranding />);

    expect(screen.getByRole('link', { name: 'Jovie Home' })).toHaveAttribute(
      'href',
      '/'
    );
    expect(screen.queryByText('Made with Jovie')).not.toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'Join the waitlist' })
    ).toHaveAttribute('href', '/waitlist');
  });

  it.each(['icon', 'wordmark', 'text'] as const)(
    'preserves the accessible home link for the %s mark',
    mark => {
      render(<FooterBranding mark={mark} size='sm' showCTA={false} />);

      expect(screen.getByRole('link', { name: 'Jovie Home' })).toHaveAttribute(
        'href',
        '/'
      );
      expect(screen.queryByText('Made with Jovie')).not.toBeInTheDocument();
      expect(screen.getAllByRole('link')).toHaveLength(1);
      if (mark === 'text') {
        expect(screen.getByRole('link')).toHaveTextContent(
          /Powered by\s*Jovie/
        );
      }
    }
  );
});
