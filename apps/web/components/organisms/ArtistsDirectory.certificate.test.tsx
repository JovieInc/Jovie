import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { ArtistsDirectory } from './ArtistsDirectory';
import { ARTISTS_DIRECTORY_STORY_PROFILES } from './ArtistsDirectory.fixture';

const handleOnly = {
  id: 'handle-only',
  username: 'handleonly',
  displayName: null,
  avatarUrl: null,
  bio: null,
};

describe('ArtistsDirectory certificate', () => {
  it('renders the fixture directory axe-clean', async () => {
    const { container } = render(
      <ArtistsDirectory profiles={ARTISTS_DIRECTORY_STORY_PROFILES} />
    );

    expect(
      screen.getByRole('heading', { level: 1, name: 'Artists' })
    ).toBeVisible();
    expect(screen.getAllByRole('heading', { level: 2 })).toHaveLength(1);
    expect(
      screen.queryByRole('navigation', { name: 'Artists Directory Pages' })
    ).not.toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('renders the empty directory axe-clean', async () => {
    const { container } = render(<ArtistsDirectory profiles={[]} />);

    expect(screen.getByText('No profiles yet.')).toBeVisible();
    await expectNoA11yViolations(container);
  });

  it('falls back to the handle for a partial profile, axe-clean', async () => {
    const { container } = render(<ArtistsDirectory profiles={[handleOnly]} />);

    const link = screen.getByRole('link', { name: /handleonly/ });
    expect(link).toHaveAttribute('href', '/handleonly');
    expect(within(link).getByRole('heading', { level: 2 })).toHaveTextContent(
      'handleonly'
    );
    await expectNoA11yViolations(container);
  });

  it('pages forward and back by keyboard with an encoded cursor', async () => {
    const user = userEvent.setup();
    const { container } = render(
      <ArtistsDirectory
        profiles={[handleOnly]}
        nextCursor='a b/c'
        isFirstPage={false}
      />
    );

    const pages = screen.getByRole('navigation', {
      name: 'Artists Directory Pages',
    });
    const first = within(pages).getByRole('link', { name: 'First page' });
    const next = within(pages).getByRole('link', { name: 'Load more artists' });
    expect(first).toHaveAttribute('href', '/artists');
    expect(next).toHaveAttribute('href', '/artists?cursor=a%20b%2Fc');

    await user.tab();
    await user.tab();
    expect(first).toHaveFocus();
    await user.tab();
    expect(next).toHaveFocus();
    await expectNoA11yViolations(container);
  });

  it('keeps long and right-to-left profiles axe-clean', async () => {
    const { container } = render(
      <div dir='rtl'>
        <ArtistsDirectory
          profiles={[
            {
              id: 'rtl',
              username: 'layla',
              displayName: 'ليلى حداد',
              avatarUrl: null,
              bio: 'سيرة طويلة. '.repeat(30).trim(),
            },
          ]}
        />
      </div>
    );

    expect(
      screen.getByRole('heading', { level: 2, name: 'ليلى حداد' })
    ).toBeVisible();
    await expectNoA11yViolations(container);
  });
});
