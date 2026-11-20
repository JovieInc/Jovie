import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ComponentProps } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { OnboardingCompleteStep } from './OnboardingCompleteStep';

type Props = ComponentProps<typeof OnboardingCompleteStep>;

function renderStep(overrides: Partial<Props> = {}) {
  const onGoToDashboard = vi.fn();
  const onCopyLink = vi.fn();
  const view = render(
    <main>
      <OnboardingCompleteStep
        title="You're live."
        prompt='Your profile is published and ready to share.'
        displayDomain='jov.ie'
        handle='sashawaves'
        copied={false}
        onGoToDashboard={onGoToDashboard}
        onCopyLink={onCopyLink}
        spotifyImportStatus='idle'
        spotifyImportStage={0}
        spotifyImportMessage=''
        {...overrides}
      />
    </main>
  );
  return { ...view, onGoToDashboard, onCopyLink };
}

describe('OnboardingCompleteStep certificate', () => {
  it('opens the dashboard and copies the link from its two buttons', async () => {
    const user = userEvent.setup();
    const { container, onGoToDashboard, onCopyLink } = renderStep();

    expect(
      screen.getByRole('heading', { level: 1, name: "You're live." })
    ).toBeInTheDocument();
    expect(screen.getByText('jov.ie/sashawaves')).toBeInTheDocument();
    expect(screen.queryByText('Link copied to clipboard!')).toBeNull();
    await expectNoA11yViolations(container);

    await user.click(screen.getByRole('button', { name: 'Go to Dashboard' }));
    expect(onGoToDashboard).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole('button', { name: 'Copy Link' }));
    expect(onCopyLink).toHaveBeenCalledTimes(1);
    expect(onGoToDashboard).toHaveBeenCalledTimes(1);
  });

  it('blocks the dashboard button while the Spotify import runs', async () => {
    const user = userEvent.setup();
    const { container, onGoToDashboard, onCopyLink } = renderStep({
      spotifyImportStatus: 'importing',
      spotifyImportStage: 1,
      spotifyImportMessage: 'Importing your latest releases…',
    });

    const dashboard = screen.getByRole('button', {
      name: 'Finishing setup...',
    });
    expect(dashboard).toBeDisabled();
    expect(dashboard).toHaveAttribute('aria-busy', 'true');
    expect(screen.getByText('2/3')).toBeInTheDocument();
    expect(screen.getByText('Importing your latest releases…')).toBeVisible();
    await expectNoA11yViolations(container);

    await user.click(dashboard);
    expect(onGoToDashboard).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'Copy Link' }));
    expect(onCopyLink).toHaveBeenCalledTimes(1);
  });

  it('shows the failed import message and the copied confirmation without a prompt', async () => {
    const { container } = renderStep({
      prompt: undefined,
      copied: true,
      spotifyImportStatus: 'error',
      spotifyImportStage: 2,
      spotifyImportMessage: 'We could not import your releases.',
    });

    expect(
      screen.queryByText('Your profile is published and ready to share.')
    ).toBeNull();
    expect(
      screen.getByText('We could not import your releases.')
    ).toBeVisible();
    expect(screen.getByText('3/3')).toBeInTheDocument();
    expect(screen.getByText('Link copied to clipboard!')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Go to Dashboard' })
    ).toBeEnabled();
    await expectNoA11yViolations(container);
  });
});
