import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

// ── Mock @jovie/ui Popover primitives ──

let popoverOpen = false;
let popoverOnOpenChange: ((open: boolean) => void) | undefined;

vi.mock('@jovie/ui', () => ({
  Popover: ({
    children,
    open,
    onOpenChange,
  }: {
    children: React.ReactNode;
    open?: boolean;
    onOpenChange?: (open: boolean) => void;
  }) => {
    popoverOpen = open ?? false;
    popoverOnOpenChange = onOpenChange;
    return <div data-testid='popover-root'>{children}</div>;
  },
  PopoverTrigger: ({
    children,
  }: {
    children: React.ReactNode;
    asChild?: boolean;
  }) => (
    <button
      data-testid='popover-trigger'
      type='button'
      onClick={() => popoverOnOpenChange?.(!popoverOpen)}
    >
      {children}
    </button>
  ),
  PopoverContent: ({
    children,
  }: {
    children: React.ReactNode;
    [key: string]: unknown;
  }) =>
    popoverOpen ? <div data-testid='popover-content'>{children}</div> : null,
}));

import { LocationPicker } from '@/components/molecules/LocationPicker';

function renderPicker(
  props: Partial<React.ComponentProps<typeof LocationPicker>> = {}
) {
  const defaultProps = {
    value: null as string | null,
    onSelect: vi.fn(),
    trigger: <button type='button'>Pick location</button>,
    ...props,
  };
  return {
    ...render(<LocationPicker {...defaultProps} />),
    onSelect: defaultProps.onSelect,
  };
}

async function openPicker(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByText('Pick location'));
}

describe('LocationPicker', () => {
  it('renders the trigger element', () => {
    renderPicker();
    expect(screen.getByText('Pick location')).toBeInTheDocument();
  });

  it('opens popover and shows search input and Popular section', async () => {
    const user = userEvent.setup();
    renderPicker();

    expect(
      screen.queryByPlaceholderText('Search cities...')
    ).not.toBeInTheDocument();

    await openPicker(user);

    expect(screen.getByPlaceholderText('Search cities...')).toBeInTheDocument();
    expect(screen.getByText('Popular')).toBeInTheDocument();
    expect(screen.getByText('All Cities')).toBeInTheDocument();
  });

  it('selecting a city calls onSelect and closes popover', async () => {
    const user = userEvent.setup();
    const { onSelect } = renderPicker();
    await openPicker(user);

    const nashvilleButtons = screen.getAllByText('Nashville, TN');
    await user.click(nashvilleButtons[0]!);

    expect(onSelect).toHaveBeenCalledWith('Nashville, TN');
    expect(screen.queryByTestId('popover-content')).not.toBeInTheDocument();
  });

  it('search filtering narrows results', async () => {
    const user = userEvent.setup();
    renderPicker();
    await openPicker(user);

    await user.type(
      screen.getByPlaceholderText('Search cities...'),
      'nashville'
    );

    expect(screen.getByText('Nashville, TN')).toBeInTheDocument();
    expect(screen.queryByText('Los Angeles, CA')).not.toBeInTheDocument();
    expect(screen.queryByText('Popular')).not.toBeInTheDocument();
  });

  it('free-text entry option appears when search does not match exactly', async () => {
    const user = userEvent.setup();
    renderPicker();
    await openPicker(user);

    await user.type(
      screen.getByPlaceholderText('Search cities...'),
      'Portland'
    );

    expect(screen.getByText(/Use \u201cPortland\u201d/)).toBeInTheDocument();
  });

  it('selecting free-text calls onSelect with the typed text', async () => {
    const user = userEvent.setup();
    const { onSelect } = renderPicker();
    await openPicker(user);

    await user.type(
      screen.getByPlaceholderText('Search cities...'),
      'Reykjavik'
    );

    const freeTextOption = screen.getByText(/Use \u201cReykjavik\u201d/);
    await user.click(freeTextOption);

    expect(onSelect).toHaveBeenCalledWith('Reykjavik');
    expect(screen.queryByTestId('popover-content')).not.toBeInTheDocument();
  });

  it('current value shows as selected with a check icon', async () => {
    const user = userEvent.setup();
    renderPicker({ value: 'nashville, tn' });
    await openPicker(user);

    const cityButtons = screen
      .getAllByRole('button')
      .filter(btn => btn.textContent?.includes('Nashville, TN'));
    expect(cityButtons.length).toBeGreaterThan(0);
    const selectedButton = cityButtons[0]!;
    expect(selectedButton.querySelector('svg')).toBeInTheDocument();
  });
});
