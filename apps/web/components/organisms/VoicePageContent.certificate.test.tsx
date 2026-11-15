import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { APP_ROUTES } from '@/constants/routes';
import { track } from '@/lib/analytics';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { VOICE_PAGE_STEPS, VoicePageContent } from './VoicePageContent';

vi.mock('@/lib/analytics', () => ({ track: vi.fn(), page: vi.fn() }));
vi.mock('@/components/features/landing/VoiceDemoVisual', () => ({
  VoiceDemoVisual: () => <div data-testid='voice-demo-visual' />,
}));

describe('VoicePageContent certificate', () => {
  beforeEach(() => {
    vi.mocked(track).mockClear();
  });

  it('renders the voice body axe-clean', async () => {
    const { container } = render(<VoicePageContent />);

    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(screen.getAllByRole('article')).toHaveLength(
      VOICE_PAGE_STEPS.length
    );
    await expectNoA11yViolations(container);
  });

  it('tracks the hero call to action with its event and section', async () => {
    const user = userEvent.setup();
    const { container } = render(<VoicePageContent />);
    container.addEventListener('click', event => event.preventDefault());

    const cta = screen.getByTestId('voice-hero-primary-cta');
    expect(cta).toHaveAttribute('href', APP_ROUTES.START);
    await user.click(cta);

    expect(track).toHaveBeenCalledWith('voice_landing_cta_start', {
      section: 'hero',
    });
  });

  it('stays axe-clean inside a right-to-left document', async () => {
    const { container } = render(
      <div dir='rtl'>
        <VoicePageContent />
      </div>
    );

    expect(
      screen.getByRole('link', { name: 'Clone my voice now' })
    ).toHaveAttribute('href', APP_ROUTES.START);
    await expectNoA11yViolations(container);
  });
});
