import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ReleasePlanWizard } from '@/components/features/dashboard/organisms/release-provider-matrix/ReleasePlanWizard';

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
  }),
}));

const baseProps = {
  open: true,
  releaseTitle: 'The Deep End',
  isGateLoading: false,
  canGenerateReleasePlans: true,
  isGeneratingReleasePlan: false,
  onClose: vi.fn(),
  onSubmit: vi.fn(),
};

describe('ReleasePlanWizard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders step 1 (release format) by default', () => {
    render(<ReleasePlanWizard {...baseProps} />);
    expect(screen.getByText('Step 1 of 6')).toBeInTheDocument();
    expect(screen.getByTestId('choice-single')).toBeInTheDocument();
    expect(screen.getByTestId('choice-ep')).toBeInTheDocument();
    expect(screen.getByTestId('choice-album')).toBeInTheDocument();
  });

  it('Next is disabled until a choice is selected', () => {
    render(<ReleasePlanWizard {...baseProps} />);
    expect(screen.getByTestId('wizard-next')).toBeDisabled();
    fireEvent.click(screen.getByTestId('choice-single'));
    expect(screen.getByTestId('wizard-next')).toBeEnabled();
  });

  it('Back is disabled on step 1, enabled after advancing', () => {
    render(<ReleasePlanWizard {...baseProps} />);
    const back = screen.getByRole('button', { name: 'Back' });
    expect(back).toBeDisabled();
    fireEvent.click(screen.getByTestId('choice-single'));
    fireEvent.click(screen.getByTestId('wizard-next'));
    expect(screen.getByText('Step 2 of 6')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Back' })).toBeEnabled();
  });

  it('submit fires with the full ReleaseContext (DIY = hasPublisher false)', () => {
    const onSubmit = vi.fn();
    render(<ReleasePlanWizard {...baseProps} onSubmit={onSubmit} />);

    fireEvent.click(screen.getByTestId('choice-single'));
    fireEvent.click(screen.getByTestId('wizard-next'));
    fireEvent.click(screen.getByTestId('choice-diy'));
    fireEvent.click(screen.getByTestId('wizard-next'));
    fireEvent.click(screen.getByTestId('choice-no'));
    fireEvent.click(screen.getByTestId('wizard-next'));
    fireEvent.click(screen.getByTestId('choice-electronic'));
    fireEvent.click(screen.getByTestId('wizard-next'));
    fireEvent.click(screen.getByTestId('choice-streams'));
    fireEvent.click(screen.getByTestId('wizard-next'));
    fireEvent.click(screen.getByTestId('choice-GLOBAL'));
    fireEvent.click(screen.getByTestId('wizard-submit'));

    expect(onSubmit).toHaveBeenCalledWith({
      releaseFormat: 'single',
      distribution: 'diy',
      genre: 'electronic',
      primaryGoal: 'streams',
      territory: ['GLOBAL'],
      hasPublisher: false,
    });
  });

  it('submit fires with hasPublisher=true when distribution is a label', () => {
    const onSubmit = vi.fn();
    render(<ReleasePlanWizard {...baseProps} onSubmit={onSubmit} />);

    fireEvent.click(screen.getByTestId('choice-album'));
    fireEvent.click(screen.getByTestId('wizard-next'));
    fireEvent.click(screen.getByTestId('choice-major_label'));
    fireEvent.click(screen.getByTestId('wizard-next'));
    fireEvent.click(screen.getByTestId('choice-yes'));
    fireEvent.click(screen.getByTestId('wizard-next'));
    fireEvent.click(screen.getByTestId('choice-country'));
    fireEvent.click(screen.getByTestId('wizard-next'));
    fireEvent.click(screen.getByTestId('choice-radio'));
    fireEvent.click(screen.getByTestId('wizard-next'));
    fireEvent.click(screen.getByTestId('choice-US'));
    fireEvent.click(screen.getByTestId('wizard-submit'));

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        distribution: 'major_label',
        hasPublisher: true,
        territory: ['US'],
      })
    );
  });

  it('shows the Pro gate when canGenerateReleasePlans is false', () => {
    render(
      <ReleasePlanWizard {...baseProps} canGenerateReleasePlans={false} />
    );
    expect(screen.getByText(/Pro feature/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Upgrade' })).toBeInTheDocument();
  });

  it('uses Title Case for the dialog title and choice labels', () => {
    render(<ReleasePlanWizard {...baseProps} />);
    expect(
      screen.getByRole('heading', { name: 'Plan For The Deep End' })
    ).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('choice-single'));
    fireEvent.click(screen.getByTestId('wizard-next'));
    expect(screen.getByTestId('choice-indie_label')).toHaveTextContent(
      'Indie Label'
    );
    expect(screen.getByTestId('choice-major_label')).toHaveTextContent(
      'Major Label'
    );
  });

  it('falls back to a Title Case title when the release is untitled', () => {
    render(<ReleasePlanWizard {...baseProps} releaseTitle={null} />);
    expect(
      screen.getByRole('heading', { name: 'Plan For This Release' })
    ).toBeInTheDocument();
  });

  it('marks the selected choice with the base-surface text token', () => {
    render(<ReleasePlanWizard {...baseProps} />);
    const choice = screen.getByTestId('choice-single');
    expect(choice).toHaveAttribute('aria-pressed', 'false');
    expect(choice.className).not.toContain('text-(--color-bg-base)');
    fireEvent.click(choice);
    expect(choice).toHaveAttribute('aria-pressed', 'true');
    expect(choice.className).toContain('text-(--color-bg-base)');
    expect(choice.className).not.toContain('text-background');
  });

  it('offers a Title Case dismiss action on the Pro gate', () => {
    const onClose = vi.fn();
    render(
      <ReleasePlanWizard
        {...baseProps}
        canGenerateReleasePlans={false}
        onClose={onClose}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: 'Maybe Later' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('shows a loading state while the gate is resolving', () => {
    render(<ReleasePlanWizard {...baseProps} isGateLoading={true} />);
    expect(screen.getByRole('button', { name: 'Loading...' })).toBeDisabled();
  });

  it('Generate button disables and relabels while submitting', () => {
    render(<ReleasePlanWizard {...baseProps} isGeneratingReleasePlan={true} />);
    // advance to the last step first
    fireEvent.click(screen.getByTestId('choice-single'));
    fireEvent.click(screen.getByTestId('wizard-next'));
    fireEvent.click(screen.getByTestId('choice-diy'));
    fireEvent.click(screen.getByTestId('wizard-next'));
    fireEvent.click(screen.getByTestId('choice-no'));
    fireEvent.click(screen.getByTestId('wizard-next'));
    fireEvent.click(screen.getByTestId('choice-pop'));
    fireEvent.click(screen.getByTestId('wizard-next'));
    fireEvent.click(screen.getByTestId('choice-press'));
    fireEvent.click(screen.getByTestId('wizard-next'));
    fireEvent.click(screen.getByTestId('choice-EU'));
    expect(screen.getByTestId('wizard-submit')).toBeDisabled();
    expect(screen.getByTestId('wizard-submit').textContent).toMatch(
      /Generating/i
    );
  });
});
