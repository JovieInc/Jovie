import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { DrawerHeader } from '@/components/molecules/drawer/DrawerHeader';

describe('DrawerHeader', () => {
  it('renders the provided title', () => {
    render(<DrawerHeader title='Contact details' />);

    expect(screen.getByText('Contact details')).toBeInTheDocument();
  });

  it('renders actions when provided', () => {
    render(
      <DrawerHeader
        title='Profile'
        actions={<button type='button'>Edit</button>}
      />
    );

    expect(screen.getByRole('button', { name: 'Edit' })).toBeInTheDocument();
  });

  it('does not render actions container when no actions provided', () => {
    const { container } = render(<DrawerHeader title='Profile' />);

    expect(container.querySelectorAll('button')).toHaveLength(0);
  });
});
