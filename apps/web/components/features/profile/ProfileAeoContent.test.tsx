import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { ProfileAeoContent as ProfileAeoContentModel } from '@/lib/profile/aeo-content';
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
