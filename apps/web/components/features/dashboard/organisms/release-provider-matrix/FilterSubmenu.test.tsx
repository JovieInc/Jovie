import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { FilterSubmenu } from './FilterSubmenu';

vi.mock('@jovie/ui', async importOriginal => {
  const actual = await importOriginal<typeof import('@jovie/ui')>();
  return {
    ...actual,
    DropdownMenuSub: ({ children }: { readonly children?: ReactNode }) => (
      <div data-testid='dropdown-sub'>{children}</div>
    ),
    DropdownMenuSubTrigger: ({
      children,
      className,
    }: {
      readonly children?: ReactNode;
      readonly className?: string;
    }) => (
      <div data-testid='dropdown-sub-trigger' className={className}>
        {children}
      </div>
    ),
    DropdownMenuSubContent: ({
      children,
    }: {
      readonly children?: ReactNode;
    }) => <div data-testid='dropdown-sub-content'>{children}</div>,
  };
});

vi.mock('@/components/atoms/Icon', () => ({
  Icon: ({
    name,
    className,
  }: {
    readonly name: string;
    readonly className?: string;
  }) => <span data-testid={`icon-${name}`} className={className} />,
}));

const OPTIONS = [
  { id: 'album', label: 'Album', iconName: 'Layers' },
  { id: 'ep', label: 'EP', iconName: 'Layers2' },
];

describe('FilterSubmenu', () => {
  it('uses the banned-icon-safe Layers glyph for the trigger and options', () => {
    render(
      <FilterSubmenu
        label='Release Type'
        iconName='Layers'
        options={OPTIONS}
        selectedIds={[]}
        onToggle={vi.fn()}
      />
    );

    expect(screen.getByText('Release Type')).toBeInTheDocument();
    expect(screen.getAllByTestId('icon-Layers').length).toBeGreaterThan(0);
    expect(screen.queryByTestId('icon-Disc3')).toBeNull();
    expect(screen.getByTestId('icon-Layers2')).toBeInTheDocument();
  });

  it('shows the selected count badge only once options are toggled on', () => {
    render(
      <FilterSubmenu
        label='Release Type'
        iconName='Layers'
        options={OPTIONS}
        selectedIds={['album']}
        onToggle={vi.fn()}
      />
    );

    expect(screen.getByText('1')).toBeInTheDocument();
  });

  it('renders nothing when isVisible is false', () => {
    const { container } = render(
      <FilterSubmenu
        label='Release Type'
        iconName='Layers'
        options={OPTIONS}
        selectedIds={[]}
        onToggle={vi.fn()}
        isVisible={false}
      />
    );

    expect(container).toBeEmptyDOMElement();
  });
});
