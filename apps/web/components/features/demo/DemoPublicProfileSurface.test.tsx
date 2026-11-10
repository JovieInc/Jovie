import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { INTERNAL_DJ_DEMO_PERSONA } from '@/lib/demo-personas';
import { DemoPublicProfileSurface } from './DemoPublicProfileSurface';

describe('DemoPublicProfileSurface', () => {
  it('renders one featured card from the registered artist catalog', () => {
    render(<DemoPublicProfileSurface />);

    const release = INTERNAL_DJ_DEMO_PERSONA.releases.find(
      entry => entry.id === 'calvin-96-months'
    );
    if (!release)
      throw new Error('Registered demo catalog is missing 96 Months');
    const cards = screen.getAllByTestId('profile-pac');
    expect(cards).toHaveLength(1);
    const card = cards[0];
    expect(card).toHaveAttribute('data-presentation', 'featured');
    expect(card).toHaveTextContent(release.title);
    expect(
      within(card).getByRole('link', { name: 'Listen now' })
    ).toHaveAttribute(
      'href',
      `/${INTERNAL_DJ_DEMO_PERSONA.profile.handle}/${release.slug}`
    );
    expect(screen.queryByTestId('profile-home-carousel')).toBeNull();
  });
});
