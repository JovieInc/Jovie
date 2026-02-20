import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock useBreakpointDown so we can control mobile vs desktop in tests
const mockUseBreakpointDown = vi.fn();
vi.mock('@/hooks/useBreakpoint', () => ({
  useBreakpointDown: (...args: unknown[]) => mockUseBreakpointDown(...args),
}));

// Lazy import after mock is set up
const { DrawerHeader } = await import(
  '@/components/molecules/drawer/DrawerHeader'
);

describe('DrawerHeader', () => {
  describe('title rendering', () => {
    it('renders a string title', () => {
      mockUseBreakpointDown.mockReturnValue(false);
      render(<DrawerHeader title='Contact Details' />);

      expect(screen.getByText('Contact Details')).toBeInTheDocument();
    });

    it('renders a ReactNode title', () => {
      mockUseBreakpointDown.mockReturnValue(false);
      render(
        <DrawerHeader title={<span data-testid='custom-title'>Custom</span>} />
      );

      expect(screen.getByTestId('custom-title')).toBeInTheDocument();
      expect(screen.getByText('Custom')).toBeInTheDocument();
    });

    it('renders without a close button when onClose is omitted', () => {
      mockUseBreakpointDown.mockReturnValue(false);
      render(<DrawerHeader title='No Close' />);

      expect(screen.queryByRole('button')).not.toBeInTheDocument();
    });
  });

  describe('onClose handler', () => {
    it('calls onClose when close button is clicked on desktop', async () => {
      mockUseBreakpointDown.mockReturnValue(false);
      const onClose = vi.fn();
      const user = userEvent.setup();

      render(<DrawerHeader title='Details' onClose={onClose} />);

      await user.click(screen.getByRole('button', { name: /close sidebar/i }));

      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('calls onClose when back button is clicked on mobile', async () => {
      mockUseBreakpointDown.mockReturnValue(true);
      const onClose = vi.fn();
      const user = userEvent.setup();

      render(<DrawerHeader title='Details' onClose={onClose} />);

      await user.click(screen.getByRole('button', { name: /go back/i }));

      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('renders additional actions alongside the close button', () => {
      mockUseBreakpointDown.mockReturnValue(false);
      const onClose = vi.fn();

      render(
        <DrawerHeader
          title='Details'
          onClose={onClose}
          actions={<button type='button'>Edit</button>}
        />
      );

      expect(screen.getByRole('button', { name: /edit/i })).toBeInTheDocument();
      expect(
        screen.getByRole('button', { name: /close sidebar/i })
      ).toBeInTheDocument();
    });
  });

  describe('mobile vs desktop aria-labels', () => {
    beforeEach(() => {
      mockUseBreakpointDown.mockClear();
    });

    it('uses "Close sidebar" aria-label on desktop (isMobile=false)', () => {
      mockUseBreakpointDown.mockReturnValue(false);
      render(<DrawerHeader title='Details' onClose={vi.fn()} />);

      expect(
        screen.getByRole('button', { name: 'Close sidebar' })
      ).toBeInTheDocument();
      expect(
        screen.queryByRole('button', { name: 'Go back' })
      ).not.toBeInTheDocument();
    });

    it('uses "Go back" aria-label on mobile (isMobile=true)', () => {
      mockUseBreakpointDown.mockReturnValue(true);
      render(<DrawerHeader title='Details' onClose={vi.fn()} />);

      expect(
        screen.getByRole('button', { name: 'Go back' })
      ).toBeInTheDocument();
      expect(
        screen.queryByRole('button', { name: 'Close sidebar' })
      ).not.toBeInTheDocument();
    });

    it('passes "lg" breakpoint to useBreakpointDown', () => {
      mockUseBreakpointDown.mockReturnValue(false);
      render(<DrawerHeader title='Details' onClose={vi.fn()} />);

      expect(mockUseBreakpointDown).toHaveBeenCalledWith('lg');
    });
  });
});
