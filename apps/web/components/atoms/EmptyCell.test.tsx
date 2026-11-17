import { TooltipProvider } from '@jovie/ui';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { describe, expect, it } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { EmptyCell } from './EmptyCell';

function Provider({ children }: { readonly children: ReactNode }) {
  return (
    <TooltipProvider delayDuration={0} skipDelayDuration={0}>
      {children}
    </TooltipProvider>
  );
}

describe('EmptyCell', () => {
  it('renders a bare dash for a missing value in a filled row', async () => {
    const { container } = render(
      <table>
        <tbody>
          <tr>
            <td>Midnight Drive</td>
            <td>
              <EmptyCell />
            </td>
          </tr>
        </tbody>
      </table>
    );

    expect(screen.getByRole('cell', { name: '—' })).toBeInTheDocument();
    expect(screen.queryByRole('tooltip')).toBeNull();
    await expectNoA11yViolations(container);
  });

  it('explains a missing value in a tooltip on hover', async () => {
    const user = userEvent.setup();
    const reason =
      'No release date set yet. Add one from the release settings so every service lists the same day.';
    const { container } = render(
      <Provider>
        <EmptyCell tooltip={reason} />
      </Provider>
    );

    await user.hover(screen.getByText('—'));
    expect(await screen.findByRole('tooltip')).toHaveTextContent(reason);
    await expectNoA11yViolations(container);
  });

  it('shows an Arabic tooltip on an RTL page', async () => {
    const user = userEvent.setup();
    const { container } = render(
      <div dir='rtl' lang='ar'>
        <Provider>
          <EmptyCell tooltip='لم يتم تحديد تاريخ الإصدار' />
        </Provider>
      </div>
    );

    await user.hover(screen.getByText('—'));
    expect(await screen.findByRole('tooltip')).toHaveTextContent(
      'لم يتم تحديد تاريخ الإصدار'
    );
    await expectNoA11yViolations(container);
  });
});
