import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

// Mock Radix dropdown components to inspect props
const mockSubContent = vi.fn();

vi.mock('@jovie/ui', () => ({
  DropdownMenuSub: ({ children }: { children: React.ReactNode }) => (
    <div data-testid='sub'>{children}</div>
  ),
  DropdownMenuSubTrigger: ({
    children,
    ...rest
  }: {
    children: React.ReactNode;
    [key: string]: unknown;
  }) => (
    <button data-testid='sub-trigger' {...rest}>
      {children}
    </button>
  ),
  DropdownMenuSubContent: ({
    children,
    collisionPadding,
    className,
    ...rest
  }: {
    children: React.ReactNode;
    collisionPadding?: number;
    className?: string;
    [key: string]: unknown;
  }) => {
    mockSubContent({ collisionPadding, className, ...rest });
    return (
      <div data-testid='sub-content' className={className}>
        {children}
      </div>
    );
  },
  MENU_ITEM_BASE: 'menu-item-base',
}));

vi.mock('@/components/atoms/Icon', () => ({
  Icon: ({ name, className }: { name: string; className?: string }) => (
    <span data-testid={`icon-${name}`} className={className} />
  ),
}));

const { FilterSubmenu } = await import(
  '@/components/dashboard/organisms/release-provider-matrix/FilterSubmenu'
);

describe('FilterSubmenu styling regression', () => {
  it('constrains sub-content width to viewport and sets collisionPadding', () => {
    render(
      <FilterSubmenu
        label='Release Type'
        iconName='Disc3'
        options={[
          { id: 'album', label: 'Album', iconName: 'Disc3' },
          { id: 'single', label: 'Single', iconName: 'Music' },
        ]}
        selectedIds={[]}
        onToggle={() => {}}
        counts={{}}
      />
    );

    const subContent = screen.getByTestId('sub-content');
    const className = subContent.className;

    // Must have viewport-constrained max-width to prevent mobile overflow
    expect(className).toContain('max-w-[calc(100vw-16px)]');

    // Must have collisionPadding for viewport edge avoidance
    expect(mockSubContent).toHaveBeenCalledWith(
      expect.objectContaining({ collisionPadding: 8 })
    );
  });
});
