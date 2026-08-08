import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { DrawerLinkSection } from './DrawerLinkSection';

describe('DrawerLinkSection', () => {
  it('renders the inline note with the empty message when the section is empty', () => {
    render(
      <DrawerLinkSection
        title='Links'
        isEmpty
        emptyMessage='No links yet.'
        emptyStateTestId='links-empty'
      >
        <div>Link row</div>
      </DrawerLinkSection>
    );

    expect(screen.getByTestId('links-empty')).toHaveTextContent(
      'No links yet.'
    );
    expect(screen.queryByText('Link row')).not.toBeInTheDocument();
  });

  it('does not render the empty message when links exist', () => {
    render(
      <DrawerLinkSection title='Links' emptyMessage='No links yet.'>
        <div>Link row</div>
      </DrawerLinkSection>
    );

    expect(screen.getByText('Link row')).toBeInTheDocument();
    expect(screen.queryByText('No links yet.')).not.toBeInTheDocument();
  });
});
