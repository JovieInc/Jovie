import { render, screen } from '@testing-library/react';
import type { ComponentProps, ReactNode } from 'react';
import { forwardRef } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { TabBar } from '@/components/molecules/tab-bar/TabBar';

vi.mock('@jovie/ui', () => ({
  DropdownMenu: ({ children }: { readonly children: ReactNode }) => (
    <>{children}</>
  ),
  DropdownMenuContent: ({ children }: { readonly children: ReactNode }) => (
    <div>{children}</div>
  ),
  DropdownMenuRadioGroup: ({ children }: { readonly children: ReactNode }) => (
    <div>{children}</div>
  ),
  DropdownMenuRadioItem: ({ children, ...props }: ComponentProps<'button'>) => (
    <button type='button' {...props}>
      {children}
    </button>
  ),
  DropdownMenuTrigger: ({ children }: { readonly children: ReactNode }) => (
    <>{children}</>
  ),
  OverflowMenuTrigger: Object.assign(
    forwardRef<HTMLButtonElement, ComponentProps<'button'>>(
      function OverflowMenuTrigger({ children = 'More', ...props }, ref) {
        const {
          hasActiveOverflow: _hasActiveOverflow,
          variant: _variant,
          ...buttonProps
        } = props as ComponentProps<'button'> & {
          hasActiveOverflow?: boolean;
          variant?: string;
        };

        return (
          <button ref={ref} type='button' {...buttonProps}>
            {children}
          </button>
        );
      }
    ),
    { displayName: 'OverflowMenuTrigger' }
  ),
  Tooltip: ({ children }: { readonly children: ReactNode }) => <>{children}</>,
  TooltipContent: ({ children }: { readonly children: ReactNode }) => (
    <div>{children}</div>
  ),
  TooltipTrigger: ({ children }: { readonly children: ReactNode }) => (
    <>{children}</>
  ),
  useTabOverflow: ({
    options,
  }: {
    readonly options: readonly Array<{ value: string; label: ReactNode }>;
  }) => ({
    containerRef: { current: null },
    moreButtonRef: { current: null },
    setTabRef: () => undefined,
    visibleOptions: options,
    overflowOptions: [],
    hasOverflow: false,
    hasMeasured: true,
  }),
}));

const OPTIONS = [
  { value: 'overview', label: 'Overview' },
  { value: 'activity', label: 'Activity' },
  { value: 'settings', label: 'Settings' },
] as const;

describe('TabBar distribution', () => {
  it.each([
    'collapse',
    'scroll',
    'wrap',
  ] as const)('adds equal-width tab classes in %s mode when distribution is fill', overflowMode => {
    render(
      <TabBar
        value='overview'
        onValueChange={() => undefined}
        options={OPTIONS}
        ariaLabel='Workspace tabs'
        overflowMode={overflowMode}
        distribution='fill'
        actions={<button type='button'>Pinned action</button>}
      />
    );

    expect(
      screen.getByRole('button', { name: 'Pinned action' })
    ).toBeInTheDocument();

    for (const tab of screen.getAllByRole('tab')) {
      expect(tab.className).toContain('flex-1');
      expect(tab.className).toContain('min-w-[72px]');
    }
  });

  it('keeps intrinsic tabs content-sized by default', () => {
    render(
      <TabBar
        value='overview'
        onValueChange={() => undefined}
        options={OPTIONS}
        ariaLabel='Intrinsic tabs'
      />
    );

    for (const tab of screen.getAllByRole('tab')) {
      expect(tab.className).not.toContain('flex-1');
    }
  });
});
