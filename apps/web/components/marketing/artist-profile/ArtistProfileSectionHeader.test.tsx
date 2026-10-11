import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ArtistProfileSectionHeader } from './ArtistProfileSectionHeader';
import storyMeta, { Centered } from './ArtistProfileSectionHeader.stories';

describe('ArtistProfileSectionHeader', () => {
  it('preserves the complete long section headline', () => {
    render(
      <ArtistProfileSectionHeader
        eyebrow='Artist Profile'
        headline='Your music stays together. The right action leads.'
        body='Route every visitor to the next useful action.'
      />
    );

    expect(screen.getByText('Artist Profile')).toBeInTheDocument();
    const heading = screen.getByRole('heading', {
      level: 2,
      name: 'Your music stays together. The right action leads.',
    });
    expect(heading).toHaveTextContent(
      'Your music stays together. The right action leads.'
    );
    expect(heading).toHaveAttribute('data-wrap', 'editorial-title');
    expect(heading.className).not.toMatch(/line-clamp|truncate/);
    expect(
      screen.getByText('Route every visitor to the next useful action.')
    ).toBeInTheDocument();
  });

  it('keeps its Storybook receipt bound to the production component', () => {
    expect(storyMeta.component).toBe(ArtistProfileSectionHeader);
    expect(Centered.args?.headline).toBe('Own the fan path from first tap.');
  });
});
