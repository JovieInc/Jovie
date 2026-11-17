import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { ArtistName } from './ArtistName';

vi.mock('next/link', () => ({
  default: ({
    href,
    children,
    ...props
  }: {
    readonly href: string;
    readonly children: ReactNode;
  }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

describe('ArtistName', () => {
  it('links the heading to the profile and takes keyboard focus', async () => {
    const user = userEvent.setup();
    const { container } = render(
      <ArtistName name='Taylor Swift' handle='taylorswift' isVerified />
    );

    const heading = screen.getByRole('heading', { level: 1 });
    const link = screen.getByRole('link', { name: /Taylor Swift/ });
    expect(heading).toContainElement(link);
    expect(link).toHaveAttribute('href', '/taylorswift');
    expect(
      screen.getByRole('img', { name: 'Verified Jovie Profile' })
    ).toBeInTheDocument();

    await user.tab();
    expect(link).toHaveFocus();
    await expectNoA11yViolations(container);
  });

  it('renders the partial state as plain text in the requested element', async () => {
    const { container } = render(
      <p>
        By{' '}
        <ArtistName
          name='Taylor Swift'
          handle='taylorswift'
          showLink={false}
          as='span'
        />
      </p>
    );

    expect(screen.queryByRole('link')).toBeNull();
    expect(screen.queryByRole('heading')).toBeNull();
    expect(screen.queryByRole('img')).toBeNull();
    expect(screen.getByText('Taylor Swift').closest('[itemprop="name"]')).toBe(
      container.querySelector('span[itemprop="name"]')
    );
    await expectNoA11yViolations(container);
  });

  it('keeps a long name and an RTL name whole and accessible', async () => {
    const longName =
      'The Midnight Orchestra and the Late Night Chorus of Saint Augustine';
    const { container, unmount } = render(
      <ArtistName name={longName} handle='midnightorchestra' isVerified />
    );
    expect(
      screen.getByRole('link', { name: new RegExp(longName) })
    ).toBeInTheDocument();
    await expectNoA11yViolations(container);
    unmount();

    const rtl = render(
      <div dir='rtl' lang='ar'>
        <ArtistName name='فيروز' handle='fairuz' size='xl' isVerified />
      </div>
    );
    expect(screen.getByRole('link', { name: /فيروز/ })).toHaveAttribute(
      'href',
      '/fairuz'
    );
    await expectNoA11yViolations(rtl.container);
  });
});
