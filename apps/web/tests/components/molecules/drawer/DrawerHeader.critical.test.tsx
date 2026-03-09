import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { DrawerHeader } from '@/components/molecules/drawer/DrawerHeader';

describe('DrawerHeader', () => {
  describe('title rendering', () => {
    it('renders a string title', () => {
      render(<DrawerHeader title='Contact Details' />);

      expect(screen.getByText('Contact Details')).toBeInTheDocument();
    });

    it('renders a ReactNode title', () => {
      render(
        <DrawerHeader title={<span data-testid='custom-title'>Custom</span>} />
      );

      expect(screen.getByTestId('custom-title')).toBeInTheDocument();
      expect(screen.getByText('Custom')).toBeInTheDocument();
    });

    it('renders without buttons when no actions provided', () => {
      render(<DrawerHeader title='No Actions' />);

      expect(screen.queryByRole('button')).not.toBeInTheDocument();
    });
  });

  describe('actions', () => {
    it('renders actions alongside the title', () => {
      render(
        <DrawerHeader
          title='Details'
          actions={<button type='button'>Edit</button>}
        />
      );

      expect(screen.getByRole('button', { name: /edit/i })).toBeInTheDocument();
    });
  });
});
