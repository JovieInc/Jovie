import { TooltipProvider } from '@jovie/ui';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SidebarProvider } from '@/components/organisms/sidebar';
import { expectNoA11yViolations } from '@/tests/utils/a11y';

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  create: vi.fn(),
  data: undefined as unknown,
}));

vi.mock('@/hooks/useBreakpoint', () => ({
  useBreakpointDown: () => false,
}));
vi.mock('next/navigation', () => ({
  usePathname: () => '/app/ov/hud',
  useRouter: () => ({ push: mocks.push }),
}));
vi.mock('@/lib/queries/useOvieListsQuery', () => ({
  getListErrorMessage: () => 'failed',
  useOvieSidebarListsQuery: () => ({ data: mocks.data }),
  useCreateOvieListMutation: () => ({
    mutate: mocks.create,
    isPending: false,
  }),
}));

import { OperatorListsNav } from './OperatorListsNav';

function Nav({ pathname = '/app/ov/hud' }: { pathname?: string }) {
  return (
    <TooltipProvider>
      <SidebarProvider>
        <OperatorListsNav pathname={pathname} />
      </SidebarProvider>
    </TooltipProvider>
  );
}

describe('OperatorListsNav certificate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.data = {
      lists: [
        { id: 'l1', name: 'Collab list', count: 12, pendingSuggestions: 3 },
      ],
      smartViews: [],
    };
  });

  it('focuses the new list input, keeps typed text through a rerender and blur, and has no axe violations', async () => {
    const user = userEvent.setup();
    const { container, rerender } = render(<Nav />);

    await user.click(screen.getByRole('button', { name: 'New List' }));
    const input = screen.getByRole('textbox', { name: 'New List Name' });
    expect(input).toHaveFocus();
    await user.type(input, 'Press kit');
    rerender(<Nav pathname='/app/ov/lists/l1' />);
    expect(input).toHaveValue('Press kit');
    expect(input).toHaveFocus();
    await user.tab();
    expect(input).toHaveValue('Press kit');
    await expectNoA11yViolations(container);
  });

  it('creates the list on Enter and has no axe violations when empty', async () => {
    const user = userEvent.setup();
    mocks.data = { lists: [], smartViews: [] };
    const { container } = render(<Nav />);

    await expectNoA11yViolations(container);
    await user.click(screen.getByRole('button', { name: 'New List' }));
    await user.type(
      screen.getByRole('textbox', { name: 'New List Name' }),
      'Press{Enter}'
    );
    expect(mocks.create).toHaveBeenCalledWith('Press', expect.any(Object));
  });
});
