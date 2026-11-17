import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { AvailableDSP } from '@/lib/dsp';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { DSPButtonGroup } from './DSPButtonGroup';

const DOT_LOGO =
  '<svg viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="12" r="10"/></svg>';

const dsp = (key: string, name: string, logoSvg = DOT_LOGO): AvailableDSP => ({
  key,
  name,
  url: `https://example.com/${key}/artist`,
  config: { name, color: '#1DB954', textColor: 'white', logoSvg },
});

describe('DSPButtonGroup certificate', () => {
  it('passes the picked service key and url to onDSPClick', async () => {
    const user = userEvent.setup();
    const onDSPClick = vi.fn();
    const { container } = render(
      <DSPButtonGroup
        dsps={[dsp('spotify', 'Spotify'), dsp('apple_music', 'Apple Music')]}
        onDSPClick={onDSPClick}
      />
    );

    expect(screen.getAllByRole('button')).toHaveLength(2);
    await user.click(
      screen.getByRole('button', {
        name: 'Open in Apple Music (opens in new window)',
      })
    );
    expect(onDSPClick).toHaveBeenCalledWith(
      'apple_music',
      'https://example.com/apple_music/artist'
    );
    expect(
      screen.getByText('Your preference will be saved for next time')
    ).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('keeps every button inert while disabled', async () => {
    const user = userEvent.setup();
    const onDSPClick = vi.fn();
    render(
      <DSPButtonGroup
        dsps={[dsp('spotify', 'Spotify')]}
        onDSPClick={onDSPClick}
        disabled
      />
    );

    const button = screen.getByRole('button');
    expect(button).toBeDisabled();
    await user.click(button);
    expect(onDSPClick).not.toHaveBeenCalled();
  });

  it('shows the empty message when no service is available', async () => {
    const { container } = render(<DSPButtonGroup dsps={[]} className='mt-4' />);

    expect(
      screen.getByText('No streaming platforms available')
    ).toBeInTheDocument();
    expect(screen.queryByRole('button')).toBeNull();
    expect(container.firstElementChild).toHaveClass('mt-4');
    await expectNoA11yViolations(container);
  });

  it('renders a partial list without a notice and an RTL list with a custom notice', async () => {
    const { container } = render(
      <div>
        <DSPButtonGroup
          dsps={[dsp('bandcamp', 'Bandcamp', '')]}
          showPreferenceNotice={false}
          size='sm'
        />
        <div dir='rtl' lang='ar'>
          <DSPButtonGroup
            dsps={[dsp('anghami', 'أنغامي')]}
            preferenceNoticeText='سيتم حفظ اختيارك للمرة القادمة'
            size='lg'
          />
        </div>
      </div>
    );

    expect(
      screen.queryByText('Your preference will be saved for next time')
    ).toBeNull();
    expect(
      screen.getByText('سيتم حفظ اختيارك للمرة القادمة')
    ).toBeInTheDocument();
    expect(screen.getByText('Open in أنغامي')).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });
});
