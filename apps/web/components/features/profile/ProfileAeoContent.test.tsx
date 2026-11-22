import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
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
  it('stays in the DOM but visually hidden, never a visible block below the footer', () => {
    render(<ProfileAeoContent content={baseContent} />);

    const section = screen.getByTestId('profile-aeo-content');
    expect(section).toHaveClass('sr-only');
    expect(
      screen.getByRole('heading', { name: 'About Tim White' })
    ).toBeInTheDocument();
    expect(screen.getByText('Los Angeles')).toBeInTheDocument();
    expect(
      screen.getByText('Tim White is a producer, songwriter, and DJ.')
    ).toBeInTheDocument();
  });

  it('renders no claim card, share control or repeated Listen/Follow rows', () => {
    render(
      <ProfileAeoContent
        content={{
          ...baseContent,
          listenLinks: [
            {
              id: 'spotify',
              platform: 'spotify',
              label: 'Spotify',
              url: 'https://open.spotify.com/artist/4u',
            },
          ],
        }}
      />
    );

    expect(screen.queryByTestId('profile-aeo-claim-card')).toBeNull();
    expect(screen.queryByTestId('profile-about-listen')).toBeNull();
    expect(screen.queryByTestId('profile-about-follow')).toBeNull();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('renders the FAQ section only when at least one sourced FAQ exists', async () => {
    const { container, rerender } = render(
      <ProfileAeoContent content={baseContent} />
    );

    expect(
      screen.getByRole('heading', { name: 'Tim White FAQ' })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'Source: Jovie profile' })
    ).toHaveAttribute('href', '/timwhite');
    await expectNoA11yViolations(container);

    rerender(<ProfileAeoContent content={{ ...baseContent, faqs: [] }} />);

    expect(screen.queryByRole('heading', { name: 'Tim White FAQ' })).toBeNull();
    expect(screen.queryByText('Where is Tim White based?')).toBeNull();
  });

  it('omits the facts list when there are no facts', () => {
    render(<ProfileAeoContent content={{ ...baseContent, facts: [] }} />);

    expect(screen.queryByTestId('profile-about-facts')).toBeNull();
  });
});
