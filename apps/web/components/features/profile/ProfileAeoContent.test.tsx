import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { ProfileAeoContent as ProfileAeoContentModel } from '@/lib/profile/aeo-content';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { ProfileAeoContent } from './ProfileAeoContent';

const baseContent = {
  artistName: 'Tim White',
  profileUrl: 'https://jovie.dev/timwhite',
  facts: [{ label: 'Based in', value: 'Los Angeles' }],
  listenLinks: [],
  followLinks: [],
  description: ['Tim White is a producer, songwriter, and DJ.'],
  descriptionBlocks: [
    { kind: 'bio', text: 'Tim White is a producer, songwriter, and DJ.' },
  ],
  descriptionSegments: [
    [{ type: 'text', text: 'Tim White is a producer, songwriter, and DJ.' }],
  ],
  faqs: [
    {
      question: 'Where is Tim White based?',
      answer: 'Los Angeles.',
      source: { label: 'Jovie profile', href: '/timwhite' },
    },
  ],
} satisfies ProfileAeoContentModel;

describe('ProfileAeoContent', () => {
  it('renders the FAQ section only when at least one sourced FAQ exists', () => {
    const { rerender } = render(<ProfileAeoContent content={baseContent} />);

    expect(
      screen.getByRole('heading', { name: 'Tim White FAQ' })
    ).toBeInTheDocument();
    expect(screen.getByText('Where is Tim White based?')).toBeInTheDocument();

    rerender(<ProfileAeoContent content={{ ...baseContent, faqs: [] }} />);

    expect(screen.queryByRole('heading', { name: 'Tim White FAQ' })).toBeNull();
    expect(screen.queryByText('Where is Tim White based?')).toBeNull();
  });
});

const fullContent = {
  ...baseContent,
  listenLinks: [
    {
      id: 'spotify',
      platform: 'spotify',
      label: 'Spotify',
      url: 'https://open.spotify.com/artist/4u',
    },
  ],
  followLinks: [
    {
      id: 'instagram',
      platform: 'instagram',
      label: 'Instagram',
      url: 'https://instagram.com/timwhite',
    },
  ],
} satisfies ProfileAeoContentModel;

describe('ProfileAeoContent states', () => {
  it('reaches share, listen, follow, FAQ source and claim in reading order', async () => {
    const user = userEvent.setup();
    const { container } = render(
      <ProfileAeoContent content={fullContent} claimHref='/start' />
    );

    const order = [
      screen.getByRole('button', { name: "Share Tim White's profile" }),
      screen.getByRole('link', { name: /Listen to Tim White on Spotify/ }),
      screen.getByRole('link', { name: /Instagram/ }),
      screen.getByRole('link', { name: 'Source: Jovie profile' }),
      screen.getByRole('link', {
        name: 'Claim the Tim White profile and sign up for Jovie',
      }),
    ];
    for (const target of order) {
      await user.tab();
      expect(target).toHaveFocus();
    }
    expect(screen.getByTestId('profile-aeo-claim-cta')).toHaveAttribute(
      'href',
      '/start'
    );
    await expectNoA11yViolations(container);
  });

  it('copies the profile link from the share control', async () => {
    const user = userEvent.setup();
    const writeText = vi.fn(async () => {});
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText },
      configurable: true,
    });
    render(<ProfileAeoContent content={fullContent} />);

    await user.click(
      screen.getByRole('button', { name: "Share Tim White's profile" })
    );
    expect(writeText).toHaveBeenCalledWith('https://jovie.dev/timwhite');
    await waitFor(() =>
      expect(
        screen.getByRole('button', {
          name: "Copied link to Tim White's profile",
        })
      ).toBeInTheDocument()
    );
  });

  it('renders only the heading and share control for an empty profile', async () => {
    const { container } = render(
      <ProfileAeoContent
        content={{
          ...baseContent,
          facts: [],
          description: [],
          descriptionBlocks: [],
          descriptionSegments: [],
          faqs: [],
        }}
      />
    );

    expect(
      screen.getByRole('heading', { name: 'About Tim White' })
    ).toBeInTheDocument();
    expect(screen.queryByTestId('profile-about-facts')).toBeNull();
    expect(screen.queryByTestId('profile-about-listen')).toBeNull();
    expect(screen.queryByTestId('profile-about-follow')).toBeNull();
    expect(screen.queryByTestId('profile-aeo-claim-card')).toBeNull();
    await expectNoA11yViolations(container);
  });

  it('truncates a long fact value but keeps it in the title', async () => {
    const value = 'Armada, Anjunadeep, Spinnin Records, Toolroom, Defected';
    const { container } = render(
      <div dir='rtl' lang='ar'>
        <ProfileAeoContent
          content={{
            ...fullContent,
            artistName: 'Tim White and the Los Angeles After Hours Orchestra',
            facts: [{ label: 'Labels', value }],
          }}
        />
      </div>
    );

    const fact = screen.getByText(value);
    expect(fact).toHaveClass('truncate');
    expect(fact).toHaveAttribute('title', value);
    await expectNoA11yViolations(container);
  });
});
