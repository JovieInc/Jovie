import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { HypotheticalDilutionPreview } from './HypotheticalDilutionPreview';

async function openPreview(ui = <HypotheticalDilutionPreview />) {
  const user = userEvent.setup();
  const rendered = render(ui);
  await user.click(
    screen.getByText(/Hypothetical Dilution/, { selector: 'h2' })
  );
  return { user, ...rendered };
}

describe('HypotheticalDilutionPreview certificate', () => {
  it('opens empty and axe-clean', async () => {
    const { container } = await openPreview();

    expect(container.querySelector('details')).toHaveAttribute('open');
    expect(screen.getByRole('status')).toHaveTextContent(
      'Enter a hypothetical scenario. Nothing is saved.'
    );
    await expectNoA11yViolations(container);
  });

  it('asks for confirmation once part of a scenario is typed', async () => {
    const { user, container } = await openPreview();

    await user.type(screen.getByLabelText('Ownership Before (%)'), '72');

    expect(screen.getByRole('status')).toHaveTextContent(
      'Confirm the assumptions to preview ownership.'
    );
    await expectNoA11yViolations(container);
  });

  it('shows field errors for an invalid confirmed scenario', async () => {
    const { user, container } = await openPreview();

    await user.type(screen.getByLabelText('Ownership Before (%)'), '140');
    await user.type(screen.getByLabelText('Valuation (USD)'), '0');
    await user.click(screen.getByRole('checkbox'));

    expect(screen.getByRole('status')).toHaveTextContent(
      'Check the highlighted inputs.'
    );
    expect(screen.getByText('Enter 0 to 100.')).toBeVisible();
    expect(screen.getByText('Enter a positive amount.')).toBeVisible();
    await expectNoA11yViolations(container);
  });

  it('keeps typed amounts and focus across a re-render and Escape', async () => {
    const { user, rerender } = await openPreview();
    const valuation = screen.getByLabelText('Valuation (USD)');

    await user.type(valuation, '8000000');
    rerender(<HypotheticalDilutionPreview />);
    await user.keyboard('{Escape}');

    expect(screen.getByLabelText('Valuation (USD)')).toHaveValue('8000000');
    expect(screen.getByLabelText('Valuation (USD)')).toHaveFocus();
  });

  it('previews amounts near the limit and stays axe-clean right-to-left', async () => {
    const { user, container } = await openPreview(
      <div dir='rtl' lang='ar'>
        <HypotheticalDilutionPreview />
      </div>
    );

    await user.type(screen.getByLabelText('Ownership Before (%)'), '50');
    await user.type(
      screen.getByLabelText('Valuation (USD)'),
      '999999999999.99'
    );
    await user.type(
      screen.getByLabelText('Committed, Unissued Cash (USD)'),
      '0'
    );
    await user.type(screen.getByLabelText('Proposed Cash (USD)'), '1000');
    await user.click(screen.getByRole('checkbox'));

    expect(screen.getByRole('status')).toHaveTextContent(
      'Hypothetical estimate. Economic ownership only.'
    );
    await expectNoA11yViolations(container);
  });
});
