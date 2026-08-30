import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { DrawerHeader } from './DrawerHeader';

describe('DrawerHeader', () => {
  it('renders title and actions without hiding the action name', () => {
    render(
      <DrawerHeader
        title='Artist details'
        actions={<button type='button'>Close details</button>}
      />
    );

    expect(screen.getByText('Artist details')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Close details' })
    ).toBeInTheDocument();
  });

  it('uses a non-announcing placeholder when the title is loading', () => {
    const { container } = render(<DrawerHeader />);

    expect(container.querySelector('[aria-hidden="true"]')).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});
