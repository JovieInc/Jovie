import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { HudNoiseDisclosure } from './HudNoiseDisclosure';

describe('HudNoiseDisclosure', () => {
  it('starts collapsed with its label as the summary', async () => {
    const { container } = render(
      <HudNoiseDisclosure id='velocity' label='Velocity detail'>
        <p>Merged 12 in the last 7 days</p>
      </HudNoiseDisclosure>
    );

    const details = screen.getByTestId('hud-disclosure-velocity');
    expect(details.tagName).toBe('DETAILS');
    expect(details).not.toHaveAttribute('open');
    expect(screen.getByText('Velocity detail').tagName).toBe('SUMMARY');
    await expectNoA11yViolations(container);
  });

  it('opens and closes when the summary is clicked', async () => {
    const user = userEvent.setup();
    const { container } = render(
      <HudNoiseDisclosure id='velocity' label='Velocity detail'>
        <p>Merged 12 in the last 7 days</p>
      </HudNoiseDisclosure>
    );
    const details = screen.getByTestId('hud-disclosure-velocity');

    await user.click(screen.getByText('Velocity detail'));
    expect(details).toHaveAttribute('open');
    expect(screen.getByText('Merged 12 in the last 7 days')).toBeVisible();
    await expectNoA11yViolations(container);

    await user.click(screen.getByText('Velocity detail'));
    expect(details).not.toHaveAttribute('open');
  });

  it('keeps open state across a re-render with new children', async () => {
    const user = userEvent.setup();
    const { rerender } = render(
      <HudNoiseDisclosure id='velocity' label='Velocity detail'>
        <p>Merged 12</p>
      </HudNoiseDisclosure>
    );
    await user.click(screen.getByText('Velocity detail'));

    rerender(
      <HudNoiseDisclosure id='velocity' label='Velocity detail'>
        <p>Merged 13</p>
      </HudNoiseDisclosure>
    );

    expect(screen.getByTestId('hud-disclosure-velocity')).toHaveAttribute(
      'open'
    );
    expect(screen.getByText('Merged 13')).toBeVisible();
  });
});
