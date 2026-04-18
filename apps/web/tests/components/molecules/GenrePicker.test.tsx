import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

// ── Mock @jovie/ui Popover primitives ──
// The real Radix popover requires a browser portal; use simple stateful mocks.

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
    // biome-ignore lint/a11y/useKeyWithClickEvents: test mock only
    // biome-ignore lint/a11y/noStaticElementInteractions: test mock only
    <div
      data-testid='popover-trigger'
      onClick={() => popoverOnOpenChange?.(!popoverOpen)}
    >
      {children}
    </div>
  ),
  PopoverContent: ({
    children,
  }: {
    children: React.ReactNode;
    [key: string]: unknown;
  }) =>
    popoverOpen ? <div data-testid='popover-content'>{children}</div> : null,
}));

import { GenrePicker } from '@/components/molecules/GenrePicker';
import { GENRE_TAXONOMY } from '@/constants/genres';

function renderPicker(
  props: Partial<React.ComponentProps<typeof GenrePicker>> = {}
) {
  const defaultProps = {
    selected: [] as string[],
    onChange: vi.fn(),
    trigger: <button type='button'>Edit genres</button>,
    ...props,
  };
  return {
    ...render(<GenrePicker {...defaultProps} />),
    onChange: defaultProps.onChange,
  };
}

async function openPicker(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByText('Edit genres'));
}

describe('GenrePicker', () => {
  it('renders the trigger element', () => {
    renderPicker();
    expect(screen.getByText('Edit genres')).toBeInTheDocument();
  });

  it('opens popover on click and shows search input', async () => {
    const user = userEvent.setup();
    renderPicker();

    expect(
      screen.queryByPlaceholderText('Search genres...')
    ).not.toBeInTheDocument();

    await openPicker(user);

    expect(screen.getByPlaceholderText('Search genres...')).toBeInTheDocument();
  });

  it('filters genres by search text', async () => {
    const user = userEvent.setup();
    renderPicker();
    await openPicker(user);

    await user.type(screen.getByPlaceholderText('Search genres...'), 'jazz');

    // Should show genres containing "jazz" and hide others
    expect(screen.getByText('jazz')).toBeInTheDocument();
    expect(screen.queryByText('rock')).not.toBeInTheDocument();
  });

  it('toggles a genre on (adds to selection)', async () => {
    const user = userEvent.setup();
    const { onChange } = renderPicker({ selected: [] });
    await openPicker(user);

    await user.click(screen.getByText('rock'));

    expect(onChange).toHaveBeenCalledWith(['rock']);
  });

  it('toggles a genre off (removes from selection)', async () => {
    const user = userEvent.setup();
    const { onChange } = renderPicker({ selected: ['rock', 'jazz'] });
    await openPicker(user);

    await user.click(screen.getByText('rock'));

    expect(onChange).toHaveBeenCalledWith(['jazz']);
  });

  it('shows cap indicator when maxGenres reached', async () => {
    const user = userEvent.setup();
    renderPicker({ selected: ['rock', 'jazz', 'pop'], maxGenres: 3 });
    await openPicker(user);

    expect(screen.getByText('Maximum 3 genres reached')).toBeInTheDocument();
  });

  it('cannot add more genres when at cap', async () => {
    const user = userEvent.setup();
    const { onChange } = renderPicker({
      selected: ['rock', 'jazz'],
      maxGenres: 2,
    });
    await openPicker(user);

    await user.click(screen.getByText('blues'));

    expect(onChange).not.toHaveBeenCalled();
  });

  it('shows empty results message for non-matching search', async () => {
    const user = userEvent.setup();
    renderPicker();
    await openPicker(user);

    await user.type(
      screen.getByPlaceholderText('Search genres...'),
      'xyznonexistent'
    );

    expect(screen.getByText('No matching genres')).toBeInTheDocument();
  });

  it('shows selected genres first in the list', async () => {
    const user = userEvent.setup();
    // Pick genres that are NOT at the start of the alphabetical taxonomy
    renderPicker({ selected: ['rock', 'jazz'] });
    await openPicker(user);

    const buttons = screen
      .getAllByRole('button')
      .filter(
        btn =>
          btn.textContent && GENRE_TAXONOMY.includes(btn.textContent.trim())
      );

    // First two genre buttons should be the selected ones
    const firstTwo = buttons.slice(0, 2).map(btn => btn.textContent?.trim());
    expect(firstTwo).toContain('rock');
    expect(firstTwo).toContain('jazz');
  });
});
