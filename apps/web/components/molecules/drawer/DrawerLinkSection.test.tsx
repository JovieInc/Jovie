import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
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

describe('DrawerLinkSection add PlainButton', () => {
  it('renders a type=button add control that fires onAdd on userEvent.click', async () => {
    const user = userEvent.setup();
    const onAdd = vi.fn();
    render(
      <DrawerLinkSection title='Links' onAdd={onAdd} addLabel='Add link'>
        <div>Link row</div>
      </DrawerLinkSection>
    );
    const add = screen.getByRole('button', { name: 'Add link' });
    expect(add).toHaveAttribute('type', 'button');
    await user.click(add);
    expect(onAdd).toHaveBeenCalledOnce();
  });
});
