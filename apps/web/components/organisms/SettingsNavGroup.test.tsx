import { TooltipProvider } from '@jovie/ui';
import { fireEvent, render, screen } from '@testing-library/react';
import {
  type ComponentProps,
  type ComponentPropsWithoutRef,
  forwardRef,
} from 'react';
import { describe, expect, it, vi } from 'vitest';
import { SidebarProvider } from '@/components/organisms/sidebar';
import { userSettingsNavigation } from '@/features/dashboard/dashboard-nav/config';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { SettingsNavGroup } from './SettingsNavGroup';

vi.mock('next/link', () => ({
  default: forwardRef<
    HTMLAnchorElement,
    ComponentPropsWithoutRef<'a'> & { readonly prefetch?: boolean }
  >(function TestLink({ prefetch: _prefetch, ...props }, ref) {
    return <a {...props} ref={ref} />;
  }),
}));

const items = userSettingsNavigation.slice(0, 2);

function renderGroup(
  props: Partial<ComponentProps<typeof SettingsNavGroup>> = {}
) {
  return render(
    <TooltipProvider>
      <SidebarProvider>
        <SettingsNavGroup items={items} pathname={items[0].href} {...props} />
      </SidebarProvider>
    </TooltipProvider>
  );
}

describe('SettingsNavGroup eager navigation contract', () => {
  it.each([
    ['default', {}],
    ['empty', { items: [] }],
    ['descendant', { pathname: `${items[0].href}/sessions` }],
    [
      'long labels',
      {
        items: items.map(item => ({
          ...item,
          name: `${item.name} with a long navigation label`,
        })),
      },
    ],
  ] as const)('keeps the %s state accessible', async (_state, props) => {
    const { container } = renderGroup(props);
    await expectNoA11yViolations(container);
  });

  it('renders existing destinations without Settings data, search or auth providers', () => {
    renderGroup();
    expect(screen.getAllByRole('link')).toHaveLength(items.length);
    for (const item of items) {
      expect(screen.getByRole('link', { name: item.name })).toHaveAttribute(
        'href',
        item.href
      );
    }
    expect(screen.queryByRole('searchbox')).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Sign Out' })
    ).not.toBeInTheDocument();
  });

  it('keeps one active descendant without matching a similarly named sibling', () => {
    const { unmount } = renderGroup({ pathname: `${items[0].href}/sessions` });
    expect(screen.getByRole('link', { name: items[0].name })).toHaveAttribute(
      'aria-current',
      'page'
    );
    expect(
      screen.getByRole('link', { name: items[1].name })
    ).not.toHaveAttribute('aria-current');
    unmount();
    renderGroup({ pathname: `${items[0].href}-other` });
    for (const link of screen.getAllByRole('link'))
      expect(link).not.toHaveAttribute('aria-current');
  });

  it('lets the operator owner choose the active destination', () => {
    renderGroup({ isItemActive: item => item.id === items[1].id });
    expect(
      screen.getByRole('link', { name: items[0].name })
    ).not.toHaveAttribute('aria-current');
    expect(screen.getByRole('link', { name: items[1].name })).toHaveAttribute(
      'aria-current',
      'page'
    );
  });

  it('passes the original destination to both pointer and keyboard prefetch', () => {
    const onPrefetch = vi.fn();
    renderGroup({ onPrefetch });
    const target = screen.getByRole('link', { name: items[1].name });
    fireEvent.mouseEnter(target);
    fireEvent.focus(target);
    expect(onPrefetch).toHaveBeenNthCalledWith(1, items[1]);
    expect(onPrefetch).toHaveBeenNthCalledWith(2, items[1]);
  });

  it('keeps an empty group free of invented actions', () => {
    renderGroup({ items: [] });
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});
