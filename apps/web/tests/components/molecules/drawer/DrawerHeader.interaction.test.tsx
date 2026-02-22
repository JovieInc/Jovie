import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DrawerHeader } from '@/components/molecules/drawer/DrawerHeader';

const { mockUseBreakpointDown } = vi.hoisted(() => ({
  mockUseBreakpointDown: vi.fn(),
}));

vi.mock('@/hooks/useBreakpoint', () => ({
  useBreakpointDown: mockUseBreakpointDown,
}));

describe('DrawerHeader', () => {
  beforeEach(() => {
    mockUseBreakpointDown.mockReset();
    mockUseBreakpointDown.mockReturnValue(false);
  });

  it('renders the provided title', () => {
    render(<DrawerHeader title='Contact details' />);

    expect(screen.getByText('Contact details')).toBeInTheDocument();
  });

  it('calls onClose when the close button is clicked', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();

    render(<DrawerHeader title='Profile' onClose={onClose} />);

    await user.click(screen.getByRole('button', { name: 'Close sidebar' }));

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('uses desktop aria-label when breakpoint is desktop', () => {
    mockUseBreakpointDown.mockReturnValue(false);

    render(<DrawerHeader title='Profile' onClose={() => {}} />);

    expect(
      screen.getByRole('button', { name: 'Close sidebar' })
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Go back' })
    ).not.toBeInTheDocument();
  });

  it('uses mobile aria-label when breakpoint is mobile', () => {
    mockUseBreakpointDown.mockReturnValue(true);

    render(<DrawerHeader title='Profile' onClose={() => {}} />);

    expect(screen.getByRole('button', { name: 'Go back' })).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Close sidebar' })
    ).not.toBeInTheDocument();
  });
});
