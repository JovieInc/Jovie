import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { AdminTableSubheader } from './AdminTableHeader';

describe('AdminTableSubheader', () => {
  it('removes covered controls from accessible interaction while preserving their layout node', () => {
    const { container, rerender } = render(
      <AdminTableSubheader
        inert
        start='20 profiles'
        end={<button type='button'>Export</button>}
      />
    );
    expect(container.firstChild).toHaveAttribute('inert');
    expect(screen.queryByRole('button', { name: 'Export' })).toBeNull();
    expect(
      screen.getByRole('button', { name: 'Export', hidden: true })
    ).toBeInTheDocument();
    rerender(
      <AdminTableSubheader
        start='20 profiles'
        end={<button type='button'>Export</button>}
      />
    );
    expect(container.firstChild).not.toHaveAttribute('inert');
    expect(screen.getByRole('button', { name: 'Export' })).toBeVisible();
  });

  it('keeps table metadata and actions on the parent surface', async () => {
    const onExport = vi.fn();
    const { container } = render(
      <AdminTableSubheader
        start={<span>20 profiles</span>}
        end={
          <button type='button' onClick={onExport}>
            Export
          </button>
        }
      />
    );
    expect(screen.getByText('20 profiles')).toBeVisible();
    expect(container.firstChild).toHaveClass('bg-transparent');
    await userEvent.click(screen.getByRole('button', { name: 'Export' }));
    expect(onExport).toHaveBeenCalledOnce();
  });

  it('retains the divider for plain metadata without adding a raised background', () => {
    const { container } = render(
      <AdminTableSubheader>1364 releases</AdminTableSubheader>
    );
    expect(screen.getByText('1364 releases')).toBeVisible();
    expect(container.firstChild).toHaveClass('border-b', 'bg-transparent');
  });
});
