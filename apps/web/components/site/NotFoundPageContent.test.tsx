import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { APP_ROUTES } from '@/constants/routes';
import { getNotFoundCopy } from '@/lib/routing/not-found-copy';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { NotFoundPageContent } from './NotFoundPageContent';

describe('NotFoundPageContent', () => {
  it('renders the profile miss with both recovery links', async () => {
    const copy = getNotFoundCopy('profile-miss');
    const { container } = render(
      <NotFoundPageContent variant='profile-miss' surface='profile' />
    );

    expect(
      screen.getByRole('heading', { level: 1, name: copy.title })
    ).toBeInTheDocument();
    expect(screen.getByText(copy.description)).toBeInTheDocument();
    expect(screen.getByText('404')).toHaveClass(
      'system-b-public-profile-not-found-code'
    );
    expect(screen.getByRole('link', { name: 'Go home' })).toHaveAttribute(
      'href',
      APP_ROUTES.HOME
    );
    expect(
      screen.getByRole('link', { name: 'Explore profiles' })
    ).toHaveAttribute('href', APP_ROUTES.ARTIST_PROFILES);
    await expectNoA11yViolations(container);
  });

  it('renders the root 404 with a decorative code and one action', async () => {
    const { container } = render(
      <NotFoundPageContent variant='generic' surface='root' />
    );

    expect(screen.getByText('404')).toHaveAttribute('aria-hidden', 'true');
    expect(screen.getAllByRole('link')).toHaveLength(1);
    expect(
      screen.queryByRole('link', { name: 'Explore profiles' })
    ).not.toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('stays axe-clean in a right-to-left document', async () => {
    const { container } = render(
      <div dir='rtl' lang='ar'>
        <NotFoundPageContent variant='profile-miss' surface='profile' />
      </div>
    );

    expect(screen.getByRole('link', { name: 'Go home' })).toBeVisible();
    await expectNoA11yViolations(container);
  });
});
