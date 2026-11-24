import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { TeleprompterShowcaseInterstitial } from './TeleprompterShowcaseInterstitial';

vi.mock('@/lib/teleprompter/analytics', () => ({
  trackTeleprompterFunnel: vi.fn(),
}));

vi.mock('@/components/jovie/components/TeleprompterNotchVisual', () => ({
  TeleprompterNotchVisual: () => (
    <div data-testid='teleprompter-notch-visual' />
  ),
}));

function renderInterstitial(
  overrides: Partial<
    React.ComponentProps<typeof TeleprompterShowcaseInterstitial>
  > = {}
) {
  return render(
    <TeleprompterShowcaseInterstitial
      open
      onOpenChange={vi.fn()}
      profileId='profile-1'
      kind='promo'
      title='Release Promo'
      script='Scroll this script while recording.'
      showcaseVariant='interstitial'
      onStartRecording={vi.fn()}
      {...overrides}
    />
  );
}

describe('TeleprompterShowcaseInterstitial', () => {
  it.each([
    { state: 'closed', open: false },
    { state: 'open', open: true },
  ])('has no axe violations when $state', async ({ open }) => {
    const { container } = renderInterstitial({ open });
    await expectNoA11yViolations(container);
  });

  it('has no axe violations with long content', async () => {
    const { container } = renderInterstitial({
      title:
        'Release Promo — Extended Single Drop With Pre-Save Campaign And Fan Capture Follow-Up',
      script:
        'Hey, it is me. My new single drops Friday — tap the link in my bio to pre-save it now. Tell a friend, share the story, and come back Friday night for the premiere livestream.',
    });
    await expectNoA11yViolations(container);
  });

  it('has no axe violations in an RTL overflow frame', async () => {
    const { container } = render(
      <div dir='rtl'>
        <TeleprompterShowcaseInterstitial
          open
          onOpenChange={vi.fn()}
          profileId='profile-1'
          kind='promo'
          title='إصدار ترويجي'
          script='مرحباً، أنا هنا. أغنيتي الجديدة تصدر يوم الجمعة.'
          showcaseVariant='interstitial'
          onStartRecording={vi.fn()}
        />
      </div>
    );
    await expectNoA11yViolations(container);
  });

  it('uses PlainButton for the backdrop dismiss control', () => {
    renderInterstitial();
    const dismissControls = screen.getAllByRole('button', {
      name: 'Dismiss Teleprompter Preview',
    });
    const backdrop = dismissControls.find(
      el => el.getAttribute('data-slot') === 'plain-button'
    );
    expect(backdrop).toBeTruthy();
    expect(backdrop?.className).toContain('bg-ink-on-media/55');
  });

  it('renders nothing while closed', () => {
    const { container } = renderInterstitial({ open: false });
    expect(container).toBeEmptyDOMElement();
  });

  it('renders the dialog with canonical controls when open', () => {
    renderInterstitial();

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Start Recording' })
    ).toBeInTheDocument();
    expect(
      screen.getAllByRole('button', { name: 'Dismiss Teleprompter Preview' })
        .length
    ).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: 'Not Now' })).toBeInTheDocument();
  });

  it('invokes onOpenChange(false) when dismissed', async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    renderInterstitial({ onOpenChange });

    await user.click(screen.getByRole('button', { name: 'Not Now' }));

    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('starts recording and closes when the primary action is clicked', async () => {
    const user = userEvent.setup();
    const onStartRecording = vi.fn();
    const onOpenChange = vi.fn();
    renderInterstitial({ onStartRecording, onOpenChange });

    await user.click(screen.getByRole('button', { name: 'Start Recording' }));

    expect(onStartRecording).toHaveBeenCalledTimes(1);
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
