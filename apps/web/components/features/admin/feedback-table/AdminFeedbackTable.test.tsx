import { TooltipProvider } from '@jovie/ui';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  RightPanelProvider,
  useRightPanel,
} from '@/contexts/RightPanelContext';
import { AdminPeopleRightPanelProvider } from '@/features/admin/AdminPeopleRightPanelProvider';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { AdminFeedbackTable } from './AdminFeedbackTable';

const { mockToastSuccess } = vi.hoisted(() => ({
  mockToastSuccess: vi.fn(),
}));

vi.mock('@/components/feedback', () => ({
  toast: { success: mockToastSuccess, error: vi.fn() },
}));

vi.mock('@/lib/queries', () => ({
  useDismissFeedbackMutation: () => ({ mutateAsync: vi.fn() }),
}));

type Items = React.ComponentProps<typeof AdminFeedbackTable>['items'];

const items: Items = [
  {
    id: 'fb_1',
    message: 'The release table pagination jumps when I open the drawer.',
    source: 'in_app',
    status: 'pending',
    classification: 'bug_verifiable',
    disposition: 'auto_remediation',
    createdAtIso: '2026-09-10T14:00:00.000Z',
    dismissedAtIso: null,
    user: {
      id: 'user_1',
      name: 'Ari Lane',
      email: 'ari@example.com',
      clerkId: 'clerk_1',
    },
    context: { pathname: '/app/releases' },
  },
  {
    id: 'fb_2',
    message: 'Testing the feedback form.',
    source: 'dashboard',
    status: 'dismissed',
    classification: 'noise',
    disposition: 'never',
    createdAtIso: '2026-09-10T16:00:00.000Z',
    dismissedAtIso: '2026-09-10T16:01:00.000Z',
    user: { id: null, name: null, email: null, clerkId: null },
    context: {},
  },
];

function RightPanelOutlet() {
  return <aside data-testid='right-panel'>{useRightPanel()}</aside>;
}

function Providers({ children }: { readonly children: ReactNode }) {
  return (
    <TooltipProvider>
      <RightPanelProvider>
        <AdminPeopleRightPanelProvider>
          {children}
          <RightPanelOutlet />
        </AdminPeopleRightPanelProvider>
      </RightPanelProvider>
    </TooltipProvider>
  );
}

describe('AdminFeedbackTable', () => {
  beforeEach(() => {
    mockToastSuccess.mockClear();
  });

  it('renders every feedback row with named column headers', async () => {
    const { container } = render(
      <Providers>
        <AdminFeedbackTable items={items} />
      </Providers>
    );

    expect(
      screen.getByText(/pagination jumps when I open the drawer/)
    ).toBeInTheDocument();
    expect(screen.getByText('Testing the feedback form.')).toBeInTheDocument();
    for (const header of screen.getAllByRole('columnheader')) {
      expect(header.textContent?.trim().length).toBeGreaterThan(0);
    }
    await expectNoA11yViolations(container);
  });

  it('opens the detail rail when a row is clicked', async () => {
    const user = userEvent.setup();
    render(
      <Providers>
        <AdminFeedbackTable items={items} />
      </Providers>
    );

    await user.click(screen.getByText(/pagination jumps when I open/));
    await waitFor(() =>
      expect(
        within(screen.getByTestId('right-panel')).getByText(
          /pagination jumps when I open the drawer/
        )
      ).toBeInTheDocument()
    );
  });

  it('copies the feedback as Markdown from the toolbar button', async () => {
    const user = userEvent.setup();
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText },
      configurable: true,
    });
    render(
      <Providers>
        <AdminFeedbackTable items={items} />
      </Providers>
    );

    await user.click(
      screen.getByRole('button', { name: 'Copy all feedback as Markdown' })
    );
    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1));
    expect(writeText.mock.calls[0][0]).toContain('Ari Lane');
    expect(mockToastSuccess).toHaveBeenCalled();
  });

  it('explains an empty table and a load failure differently', async () => {
    const { container, rerender } = render(
      <Providers>
        <AdminFeedbackTable items={[]} />
      </Providers>
    );
    expect(screen.getByText('No feedback found')).toBeInTheDocument();
    await expectNoA11yViolations(container);

    rerender(
      <Providers>
        <AdminFeedbackTable items={[]} loadError='Failed to load feedback' />
      </Providers>
    );
    expect(screen.getByText('Feedback unavailable')).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });
});
