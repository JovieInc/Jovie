import { TooltipProvider } from '@jovie/ui';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { SpotifyAccountIdentity } from './SpotifyAccountIdentity';

function wrap(node: ReactNode) {
  return render(<TooltipProvider>{node}</TooltipProvider>);
}

describe('SpotifyAccountIdentity certificate', () => {
  const open = vi.fn();

  beforeEach(() => {
    vi.stubGlobal('open', open);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    open.mockReset();
  });

  it('opens the Spotify profile in a new tab without an opener', async () => {
    const user = userEvent.setup();
    const { container } = wrap(
      <SpotifyAccountIdentity
        displayName='Jovie Artist'
        href='https://open.spotify.com/artist/1'
      />
    );

    const pill = screen.getByRole('button');
    expect(pill).toHaveAccessibleName(/Spotify/);
    await user.click(pill);
    expect(open).toHaveBeenCalledWith(
      'https://open.spotify.com/artist/1',
      '_blank',
      'noopener,noreferrer'
    );
    await expectNoA11yViolations(container);
  });

  it('renders a static pill when there is no link', async () => {
    const { container } = wrap(<SpotifyAccountIdentity handle='@jovie' />);

    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.getByTestId('spotify-account-identity')).toHaveTextContent(
      '@jovie'
    );
    await expectNoA11yViolations(container);
  });

  it('falls back to a generic label with no identity', async () => {
    const { container } = wrap(
      <SpotifyAccountIdentity displayName='  ' handle='' accountId={null} />
    );

    expect(screen.getByTestId('spotify-account-identity')).toHaveTextContent(
      'Spotify account'
    );
    await expectNoA11yViolations(container);
  });

  it('keeps a long name and RTL copy axe-clean', async () => {
    const long =
      'The Extraordinarily Long Named Orchestra and Friends Featuring Everyone';
    const { container } = wrap(
      <div dir='rtl' lang='ar'>
        <SpotifyAccountIdentity
          displayName={long}
          href='https://open.spotify.com/artist/1'
        />
        <SpotifyAccountIdentity displayName='فنان جوفي' />
      </div>
    );

    expect(screen.getByText(long)).toBeInTheDocument();
    expect(screen.getByText('فنان جوفي')).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });
});
