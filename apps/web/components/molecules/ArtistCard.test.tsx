import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { ArtistCard } from './ArtistCard';

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

const AVATAR =
  'https://i.scdn.co/image/ab6761610000e5ebcdce7620dc940db079bf4952';

describe('ArtistCard', () => {
  it('links the card to the profile under one accessible name', async () => {
    const user = userEvent.setup();
    const { container } = render(
      <ArtistCard handle='arianagrande' name='Ariana Grande' src={AVATAR} />
    );

    const link = screen.getByRole('link', {
      name: "View Ariana Grande's profile",
    });
    expect(link).toHaveAttribute('href', '/arianagrande');
    expect(link).toHaveAttribute('title', 'Ariana Grande');
    expect(link).toHaveTextContent('Ariana Grande');
    expect(
      screen.getByRole('img', { name: 'Ariana Grande' })
    ).toBeInTheDocument();

    await user.tab();
    expect(link).toHaveFocus();
    await expectNoA11yViolations(container);
  });

  it('hides the visible name on request but keeps the link name', async () => {
    const { container } = render(
      <ArtistCard
        handle='arianagrande'
        name='Ariana Grande'
        src={AVATAR}
        showName={false}
      />
    );
    const link = screen.getByRole('link', {
      name: "View Ariana Grande's profile",
    });
    expect(link).not.toHaveTextContent('Ariana Grande');
    await expectNoA11yViolations(container);
  });

  it('renders a partial card with no photo, a long name and an RTL name', async () => {
    const longName = 'The Midnight Orchestra and the Late Night Chorus';
    const { container } = render(
      <div>
        <ArtistCard handle='risingstar' name='Rising Star' src='' />
        <ArtistCard
          handle='midnightorchestra'
          name={longName}
          src={AVATAR}
          isVerified
        />
        <div dir='rtl' lang='ar'>
          <ArtistCard handle='fairuz' name='فيروز' src={AVATAR} />
        </div>
      </div>
    );

    expect(
      // The no-photo fallback renders the initials as visible text, so the
      // accessible name carries them too (axe label-content-name-mismatch).
      screen.getByRole('link', { name: "View Rising Star's profile — RS" })
    ).toHaveAttribute('href', '/risingstar');
    // The image path keeps the base label without initials.
    expect(
      screen.getByRole('link', { name: `View ${longName}'s profile` })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: "View فيروز's profile" })
    ).toHaveAttribute('href', '/fairuz');
    await expectNoA11yViolations(container);
  });
});
