import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ArtistProfileSectionHeader } from './ArtistProfileSectionHeader';
import storyMeta, { Centered } from './ArtistProfileSectionHeader.stories';

describe('ArtistProfileSectionHeader', () => {
  it('renders the section headline with an explicit two-line bound', () => {
    render(
      <ArtistProfileSectionHeader
        eyebrow='Artist Profile'
        headline='Own the fan path from first tap.'
        body='Route every visitor to the next useful action.'
      />
    );

    expect(screen.getByText('Artist Profile')).toBeInTheDocument();
    expect(
      screen.getByRole('heading', {
        level: 2,
        name: 'Own the fan path from first tap.',
      })
    ).toHaveClass('line-clamp-2');
    expect(
      screen.getByText('Route every visitor to the next useful action.')
    ).toBeInTheDocument();
  });

  it('keeps its Storybook receipt bound to the production component', () => {
    expect(storyMeta.component).toBe(ArtistProfileSectionHeader);
    expect(Centered.args?.headline).toBe('Own the fan path from first tap.');
  });
});
