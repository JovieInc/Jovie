import { TooltipProvider } from '@jovie/ui';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { OutboundRail, type OutboundRailProps } from './OutboundRail';
import { outboundFixtureRow } from './outbound-fixtures';

function props(overrides: Partial<OutboundRailProps> = {}): OutboundRailProps {
  return {
    row: outboundFixtureRow(),
    certification: null,
    certificationLoading: false,
    activeFactKey: null,
    pending: null,
    error: null,
    onClose: vi.fn(),
    onFact: vi.fn(async () => {}),
    onCertify: vi.fn(),
    onRefreshEvidence: vi.fn(),
    onApprove: vi.fn(),
    onSaveCopy: vi.fn(),
    onHold: vi.fn(),
    onReject: vi.fn(),
    ...overrides,
  };
}

function view(p: OutboundRailProps) {
  return (
    <TooltipProvider>
      <OutboundRail {...p} />
    </TooltipProvider>
  );
}

describe('OutboundRail certificate', () => {
  it('keeps the typed subject and focus across a parent rerender and blur', async () => {
    const user = userEvent.setup();
    const p = props();
    const { rerender, container } = render(view(p));
    const subject = screen.getByRole('textbox', { name: 'Subject' });
    await user.clear(subject);
    await user.type(subject, 'A new subject');
    rerender(view({ ...p, error: null }));
    expect(screen.getByRole('textbox', { name: 'Subject' })).toHaveValue(
      'A new subject'
    );
    expect(screen.getByRole('textbox', { name: 'Subject' })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole('textbox', { name: 'Subject' })).toHaveValue(
      'A new subject'
    );
    await expectNoA11yViolations(container);
  });

  it('renders the Input atom for the subject and stays axe-clean with an error', async () => {
    const { container } = render(
      view(props({ error: 'You are offline. Your draft was not saved.' }))
    );
    expect(screen.getByRole('textbox', { name: 'Subject' })).toHaveClass(
      'bg-surface-1'
    );
    expect(screen.getByText(/You are offline/)).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('stays axe-clean for a right-to-left draft and an empty rail', async () => {
    const rtl = render(
      view(
        props({
          row: outboundFixtureRow({
            message: {
              channel: 'email',
              subject: 'صفحتك جاهزة',
              body: 'مرحبا عدا',
              revision: null,
            },
          }),
        })
      )
    );
    expect(screen.getByRole('textbox', { name: 'Subject' })).toHaveValue(
      'صفحتك جاهزة'
    );
    await expectNoA11yViolations(rtl.container);
    rtl.unmount();
    const empty = render(view(props({ row: null })));
    await expectNoA11yViolations(empty.container);
  });
});
