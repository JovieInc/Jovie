import { TooltipProvider } from '@jovie/ui';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { describe, expect, it } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { PresenceSignalList, PresenceStatusBadge } from './PresenceStatusParts';
import type { ConnectionStatus, PresenceSignal } from './types';

function wrap(node: ReactNode) {
  return render(<TooltipProvider delayDuration={0}>{node}</TooltipProvider>);
}

const ERROR_STATUS: ConnectionStatus = {
  label: 'Disconnected',
  tone: 'error',
  needsAttention: true,
  nextAction: 'Reconnect the account to resume checks.',
  sortPriority: 0,
};

const SIGNALS: PresenceSignal[] = [
  {
    kind: 'blocker',
    tone: 'error',
    label: 'Indexing failed',
    detail: 'Reconnect the indexing source.',
    sortOrder: 0,
  },
  {
    kind: 'recommendation',
    tone: 'warning',
    label: 'Refresh the bio',
    detail: 'Two platforms show the old bio.',
    sortOrder: 1,
  },
  {
    kind: 'state',
    tone: 'neutral',
    label: 'Not measured',
    detail: 'An unconfigured check is not healthy.',
    sortOrder: 2,
  },
];

describe('PresenceStatusParts certificate', () => {
  it('shows the next action for a failed connection on hover', async () => {
    const user = userEvent.setup();
    const { container } = wrap(<PresenceStatusBadge status={ERROR_STATUS} />);

    const label = screen.getByText('Disconnected');
    expect(label.parentElement).toHaveClass('text-error-text');
    await expectNoA11yViolations(container);
    await user.hover(label);
    expect(
      (await screen.findAllByText('Reconnect the account to resume checks.'))
        .length
    ).toBeGreaterThan(0);
  });

  it('gives each signal its kind for screen readers', async () => {
    const { container } = wrap(<PresenceSignalList signals={SIGNALS} />);

    const items = within(
      screen.getByTestId('presence-signal-list')
    ).getAllByRole('listitem');
    expect(items).toHaveLength(3);
    expect(items[0]).toHaveTextContent('Blocker:Indexing failed');
    expect(
      screen.getByTestId('presence-signal-recommendation')
    ).toHaveTextContent('Two platforms show the old bio.');
    expect(screen.getByText('Refresh the bio').className).toContain(
      'text-warning-text'
    );
    await expectNoA11yViolations(container);
  });

  it('renders an empty signal list', async () => {
    const { container } = wrap(<PresenceSignalList signals={[]} />);

    expect(screen.getByTestId('presence-signal-list')).toBeEmptyDOMElement();
    await expectNoA11yViolations(container);
  });

  it('keeps long and Arabic copy axe-clean', async () => {
    const longLabel =
      'Needs review across every connected profile and link source';
    const { container } = wrap(
      <div dir='rtl' lang='ar'>
        <PresenceStatusBadge
          status={{ ...ERROR_STATUS, tone: 'warning', label: longLabel }}
        />
        <PresenceSignalList
          signals={[
            {
              kind: 'finding',
              tone: 'success',
              label: 'تم الفحص',
              detail: 'كل الروابط تعمل.',
              sortOrder: 0,
            },
          ]}
        />
      </div>
    );

    expect(screen.getByText(longLabel)).toHaveClass('whitespace-normal');
    expect(screen.getByText('كل الروابط تعمل.')).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });
});
