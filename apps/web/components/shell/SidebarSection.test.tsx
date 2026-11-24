import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { SIDEBAR_SECTION_RHYTHM, SidebarSection } from './SidebarSection';

describe('SidebarSection', () => {
  it('exports the separator-free section rhythm used by the shell', () => {
    expect(SIDEBAR_SECTION_RHYTHM).toEqual({
      navGroup: 'space-y-0.5',
      searchSlot: 'mb-4 mt-1.5 h-7 shrink-0',
      threads: 'mt-1.5',
    });
  });

  it('renders the chevron header with the section name', () => {
    render(
      <SidebarSection
        name='Releases'
        open
        onToggle={() => undefined}
        itemCount={3}
      >
        <span>item-1</span>
        <span>item-2</span>
        <span>item-3</span>
      </SidebarSection>
    );
    expect(
      screen.getByRole('button', { name: /Releases/ })
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Releases/ })).toHaveClass(
      'hover:bg-sidebar-accent',
      'h-(--app-shell-sidebar-row-height)',
      'px-(--app-shell-sidebar-inset)',
      'gap-x-(--app-shell-sidebar-icon-gap)',
      'grid-cols-(--app-shell-sidebar-nav-grid)'
    );
    expect(screen.getByText('Releases')).toBeInTheDocument();
    expect(screen.getByText('item-1')).toBeInTheDocument();
  });

  it('fires onToggle when the header is clicked', () => {
    const onToggle = vi.fn();
    render(
      <SidebarSection name='X' open onToggle={onToggle} itemCount={1}>
        <span />
      </SidebarSection>
    );
    fireEvent.click(screen.getByRole('button'));
    expect(onToggle).toHaveBeenCalledOnce();
  });

  it('renders nothing in collapsed + closed mode', () => {
    const { container } = render(
      <SidebarSection
        name='X'
        open={false}
        onToggle={() => undefined}
        itemCount={3}
        collapsed
      >
        <span data-testid='item' />
      </SidebarSection>
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders just the items in collapsed + open mode (no header)', () => {
    render(
      <SidebarSection
        name='X'
        open
        onToggle={() => undefined}
        itemCount={2}
        collapsed
      >
        <span data-testid='item' />
        <span data-testid='item' />
      </SidebarSection>
    );
    expect(screen.queryByText('X')).not.toBeInTheDocument();
    expect(screen.getAllByTestId('item').length).toBe(2);
  });

  it('reflects the open prop on aria-expanded', () => {
    const { rerender } = render(
      <SidebarSection
        name='X'
        open={false}
        onToggle={() => undefined}
        itemCount={1}
      >
        <span />
      </SidebarSection>
    );
    expect(screen.getByRole('button')).toHaveAttribute(
      'aria-expanded',
      'false'
    );
    rerender(
      <SidebarSection name='X' open onToggle={() => undefined} itemCount={1}>
        <span />
      </SidebarSection>
    );
    expect(screen.getByRole('button')).toHaveAttribute('aria-expanded', 'true');
  });
});

describe('SidebarSection PlainButton header', () => {
  it('is a type=button header that toggles on userEvent.click', async () => {
    const user = userEvent.setup();
    const onToggle = vi.fn();
    render(
      <SidebarSection name='Releases' open onToggle={onToggle} itemCount={1}>
        <span />
      </SidebarSection>
    );
    const header = screen.getByRole('button', { name: /Releases/ });
    expect(header).toHaveAttribute('type', 'button');
    expect(header).toHaveAttribute('aria-expanded', 'true');
    await user.click(header);
    expect(onToggle).toHaveBeenCalledOnce();
  });
});
