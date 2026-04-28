import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { SidebarSection } from './SidebarSection';

describe('SidebarSection', () => {
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
    expect(screen.getByText('Releases')).toBeInTheDocument();
    expect(screen.getByText('item-1')).toBeInTheDocument();
  });

  it('fires onToggle when the header is clicked', () => {
    const onToggle = vi.fn();
    render(
      <SidebarSection name='X' open onToggle={onToggle} itemCount={0}>
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
