import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { segmentedAccessibleName } from '@/tests/utils/accessible-name';
import { DrawerPropertyRow } from './DrawerPropertyRow';

// The copy path toasts through the shared notifications seam.
const { mockNotify } = vi.hoisted(() => ({
  mockNotify: { success: vi.fn(), error: vi.fn() },
}));
vi.mock('@/lib/hooks/useNotifications', () => ({
  useNotifications: () => mockNotify,
}));

describe('DrawerPropertyRow', () => {
  it('copies plain-string values on click of the value itself (founder note 2026-11-09)', async () => {
    const user = userEvent.setup();
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText },
      configurable: true,
    });

    render(
      <DrawerPropertyRow label='ISRC' value='NLD681903043' definitionList />
    );

    const valueButton = screen.getByRole('button', {
      name: 'Copy ISRC: NLD681903043',
    });
    await user.click(valueButton);

    await waitFor(() => expect(writeText).toHaveBeenCalledWith('NLD681903043'));
    await waitFor(() =>
      expect(mockNotify.success).toHaveBeenCalledWith('ISRC copied')
    );
    // Brief in-place confirmation: the affordance flips to a check.
    expect(valueButton).toHaveAttribute('data-copy-value', 'success');
  });

  it('does not turn interactive values or interactive rows into copy buttons', () => {
    const onClick = vi.fn();

    const { rerender } = render(
      <DrawerPropertyRow
        label='Review Status'
        value={<button type='button'>Approved</button>}
        definitionList
      />
    );
    // The ReactNode value keeps its own behavior; no copy affordance.
    expect(
      screen.queryByRole('button', { name: /Copy Review Status/ })
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Approved' })
    ).toBeInTheDocument();

    rerender(
      <DrawerPropertyRow
        label='Row'
        value='Whole row is the control'
        interactive
        onClick={onClick}
      />
    );
    // Interactive rows own the whole click surface — no nested copy button.
    expect(
      screen.queryByRole('button', { name: /Copy Row:/ })
    ).not.toBeInTheDocument();
  });

  it('supports opting out of copy-on-click with copyable={false}', () => {
    render(
      <DrawerPropertyRow
        label='Notes'
        value='Prose you would not paste into a form'
        copyable={false}
      />
    );
    expect(
      screen.queryByRole('button', { name: /Copy Notes:/ })
    ).not.toBeInTheDocument();
  });

  it('keeps read-only properties non-interactive at the row level and supports an explicit action mode', () => {
    const onClick = vi.fn();

    const { rerender } = render(
      <DrawerPropertyRow label='Status' value='Ready' />
    );
    // The row container itself is not a button (only the value is copyable).
    expect(screen.getByText('Status')).toBeInTheDocument();
    expect(screen.getByText('Ready')).toBeInTheDocument();

    rerender(
      <DrawerPropertyRow
        label='Status'
        value='Ready'
        interactive
        labelWidth={120}
        align='start'
        size='sm'
        onClick={onClick}
      />
    );

    const property = screen.getByRole('button', {
      name: segmentedAccessibleName('Status', 'Ready'),
    });
    expect(property).toHaveStyle({
      gridTemplateColumns: '120px minmax(0, 1fr)',
    });
    fireEvent.click(property);
    expect(onClick).toHaveBeenCalledOnce();
  });

  it('adds no horizontal inset so rows share the drawer content edge', () => {
    const { container } = render(
      <DrawerPropertyRow label='Type' value='Single' />
    );
    expect(container.firstElementChild?.className).toContain('px-0');
  });
});

describe('DrawerPropertyRow definition list semantics (JOV-8873)', () => {
  it('renders dt/dd pairs only when definitionList is set', () => {
    const { rerender } = render(
      <dl>
        <DrawerPropertyRow label='Status' value='Ready' definitionList />
      </dl>
    );
    expect(screen.getByText('Status').tagName).toBe('DT');
    // The copy affordance wraps the value text; it lives inside the dd.
    const valueControl = screen.getByRole('button', {
      name: 'Copy Status: Ready',
    });
    expect(valueControl.closest('dd')?.tagName).toBe('DD');

    rerender(<DrawerPropertyRow label='Status' value='Ready' />);
    expect(screen.getByText('Ready').closest('span')?.tagName).toBe('SPAN');
  });
});
