import { TooltipProvider } from '@jovie/ui';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fixtureRow } from '@/lib/ovie/certifications/fixtures';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { CertificationDetailRail } from './CertificationDetailRail';

vi.mock('@/hooks/useBreakpoint', () => ({
  useBreakpointDown: () => false,
}));

const row = fixtureRow('signup');
const onDecide = vi.fn();
const onClose = vi.fn();

type RailProps = Parameters<typeof CertificationDetailRail>[0];

function Rail(props: Partial<RailProps>) {
  return (
    <TooltipProvider>
      <CertificationDetailRail
        row={row}
        onClose={onClose}
        onDecide={onDecide}
        pendingDecision={null}
        decisionError={null}
        {...props}
      />
    </TooltipProvider>
  );
}

describe('CertificationDetailRail certificate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    onDecide.mockResolvedValue(undefined);
  });

  it('keeps a typed note and focus through a parent rerender and blur', async () => {
    const user = userEvent.setup();
    const { rerender } = render(<Rail />);

    const note = screen.getByLabelText('Note for the worker');
    await user.type(note, 'Fix the empty state');
    rerender(<Rail decisionError='The evidence changed.' />);

    const after = screen.getByLabelText('Note for the worker');
    expect(after).toHaveValue('Fix the empty state');
    expect(after).toHaveFocus();
    await user.keyboard('{Escape}');
    after.blur();
    expect(after).toHaveValue('Fix the empty state');
  });

  it('sends the trimmed note with Request Changes', async () => {
    const user = userEvent.setup();
    const { container } = render(<Rail />);

    await user.type(
      screen.getByLabelText('Note for the worker'),
      '  Tighten the copy  '
    );
    await user.click(screen.getByRole('button', { name: 'Request Changes' }));

    expect(onDecide).toHaveBeenCalledWith(
      'changes_requested',
      'Tighten the copy',
      { rowId: row.id, evidenceDigest: row.decision.evidenceDigest }
    );
    await expectNoA11yViolations(container);
  });

  it('locks every decision while one is pending', async () => {
    const { container } = render(<Rail pendingDecision='approved' />);

    expect(screen.getByLabelText('Note for the worker')).toBeDisabled();
    expect(screen.getByRole('button', { name: /Reject/ })).toBeDisabled();
    await expectNoA11yViolations(container);
  });

  it('shows an offline failure in the stable status slot', async () => {
    const { container } = render(
      <Rail decisionError='You are offline. The decision was not saved.' />
    );

    expect(screen.getByRole('status')).toHaveTextContent(
      'You are offline. The decision was not saved.'
    );
    await expectNoA11yViolations(container);
  });

  it('renders a row with no owner or links, and the empty rail', async () => {
    const { container, rerender } = render(
      <Rail row={{ ...row, owner: null, links: [] }} />
    );
    expect(screen.getByRole('button', { name: 'Certify' })).toBeEnabled();
    await expectNoA11yViolations(container);

    rerender(<Rail row={null} />);
    expect(
      screen.getByText('Select a certification to review its evidence.')
    ).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });
});
