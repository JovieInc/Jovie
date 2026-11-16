import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { ARTIST_PROFILE_COPY } from '@/data/artistProfileCopy';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { CompactGlassCaptureDemo } from './CompactGlassCaptureDemo';

const CAPTURE = ARTIST_PROFILE_COPY.capture;

describe('CompactGlassCaptureDemo certificate', () => {
  it('starts idle and plays the demo from the Play control', async () => {
    const user = userEvent.setup();
    const { container } = render(
      <CompactGlassCaptureDemo label='Fan updates' />
    );

    expect(screen.getByText('Fan updates')).toBeInTheDocument();
    expect(
      screen.getByText('Demo only — nothing is sent or stored.')
    ).toBeInTheDocument();
    await expectNoA11yViolations(container);

    await user.click(screen.getByRole('button', { name: 'Play demo' }));

    expect(
      screen.getByText('Demo running — nothing is sent or stored.')
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Replay' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reset' })).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('replays from the confirmed state and resets back to idle', async () => {
    const user = userEvent.setup();
    const { container } = render(
      <CompactGlassCaptureDemo initialPhase='done' />
    );

    expect(
      screen.getByText(
        `${CAPTURE.action.confirmedLabel}. Demo only — nothing was sent or stored.`
      )
    ).toBeInTheDocument();
    await expectNoA11yViolations(container);

    await user.click(screen.getByRole('button', { name: 'Replay' }));
    expect(
      screen.getByText('Demo running — nothing is sent or stored.')
    ).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Reset' }));
    expect(
      screen.getByRole('button', { name: 'Play demo' })
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Reset' })
    ).not.toBeInTheDocument();
  });

  it('holds the submitting phase axe-clean', async () => {
    const { container } = render(
      <CompactGlassCaptureDemo initialPhase='submitting' />
    );

    expect(container.querySelector('[data-phase="submitting"]')).not.toBeNull();
    await expectNoA11yViolations(container);
  });

  it('renders Arabic capture copy right to left', async () => {
    const { container } = render(
      <div dir='rtl' lang='ar'>
        <CompactGlassCaptureDemo
          label='تحديثات المعجبين'
          capture={{
            ...CAPTURE,
            action: { ...CAPTURE.action, ctaLabel: 'اشترك' },
          }}
        />
      </div>
    );

    expect(screen.getByText('اشترك')).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });
});
