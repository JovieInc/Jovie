import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { ReleasePlanWizard } from './ReleasePlanWizard';

function setup(
  overrides: Partial<React.ComponentProps<typeof ReleasePlanWizard>> = {}
) {
  const onClose = vi.fn();
  const onSubmit = vi.fn();
  const view = render(
    <ReleasePlanWizard
      open
      releaseTitle='The Deep End'
      isGateLoading={false}
      canGenerateReleasePlans
      isGeneratingReleasePlan={false}
      onClose={onClose}
      onSubmit={onSubmit}
      {...overrides}
    />
  );
  return { ...view, onClose, onSubmit };
}

describe('ReleasePlanWizard', () => {
  it('walks the six steps and submits the release context', async () => {
    const user = userEvent.setup();
    const { onSubmit } = setup();

    expect(await screen.findByText('Step 1 of 6')).toBeInTheDocument();
    expect(screen.getByTestId('wizard-next')).toBeDisabled();

    const picks = ['single', 'diy', 'no', 'pop', 'streams', 'US'];
    for (const [index, pick] of picks.entries()) {
      const choice = screen.getByTestId(`choice-${pick}`);
      await user.click(choice);
      expect(choice).toHaveAttribute('aria-pressed', 'true');
      if (index < picks.length - 1) {
        await user.click(screen.getByTestId('wizard-next'));
      }
    }

    await user.click(screen.getByTestId('wizard-submit'));
    expect(onSubmit).toHaveBeenCalledWith({
      releaseFormat: 'single',
      distribution: 'diy',
      genre: 'pop',
      primaryGoal: 'streams',
      territory: ['US'],
      hasPublisher: false,
    });
  });

  it('goes back and keeps the answer, then closes', async () => {
    const user = userEvent.setup();
    const { onClose } = setup();

    await screen.findByText('Step 1 of 6');
    expect(screen.getByRole('button', { name: 'Back' })).toBeDisabled();
    await user.click(screen.getByTestId('choice-ep'));
    await user.click(screen.getByTestId('wizard-next'));
    await user.click(screen.getByRole('button', { name: 'Back' }));
    expect(screen.getByTestId('choice-ep')).toHaveAttribute(
      'aria-pressed',
      'true'
    );
    await expectNoA11yViolations(document.body);
    await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalled();
  });

  it('locks navigation while a plan is generating', async () => {
    setup({ isGeneratingReleasePlan: true });
    await screen.findByText('Step 1 of 6');
    expect(screen.getByRole('button', { name: 'Back' })).toBeDisabled();
  });

  it('shows the loading gate and the not-included gate', async () => {
    const user = userEvent.setup();
    const loading = setup({ isGateLoading: true });
    expect(
      await screen.findByText(/Checking whether this workspace/)
    ).toBeInTheDocument();
    await expectNoA11yViolations(document.body);
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(loading.onClose).toHaveBeenCalled();
    loading.unmount();

    const gated = setup({ canGenerateReleasePlans: false });
    expect(await screen.findByText(/aren't included in/)).toBeInTheDocument();
    await expectNoA11yViolations(document.body);
    await user.click(screen.getByRole('button', { name: 'Got It' }));
    expect(gated.onClose).toHaveBeenCalled();
  });
});
