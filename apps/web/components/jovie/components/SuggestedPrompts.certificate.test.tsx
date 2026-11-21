import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';

const track = vi.hoisted(() => vi.fn());
vi.mock('@/lib/analytics', () => ({ track }));

import { SuggestedPrompts } from './SuggestedPrompts';

describe('SuggestedPrompts certificate', () => {
  beforeEach(() => track.mockClear());

  it('selects a prompt from the rail and is axe-clean', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    const { container } = render(<SuggestedPrompts onSelect={onSelect} />);

    const buttons = screen.getAllByRole('button');
    await user.click(buttons[0]);

    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(typeof onSelect.mock.calls[0][0]).toBe('string');
    await expectNoA11yViolations(container);
  });

  it('renders the grid layout and selects from it', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    const { container } = render(
      <SuggestedPrompts onSelect={onSelect} layout='grid' />
    );

    const grid = screen.getByTestId('suggested-prompts-grid');
    await user.click(within(grid).getAllByRole('button')[0]);

    expect(onSelect).toHaveBeenCalledTimes(1);
    await expectNoA11yViolations(container);
  });

  it('disables the album art pill while its availability is unknown', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    const { container } = render(
      <SuggestedPrompts
        onSelect={onSelect}
        albumArtCapability={{
          availability: 'unavailable',
          reason: 'Album art needs a Pro plan.',
          reasonCode: 'PLAN_UNAVAILABLE',
        }}
      />
    );

    const disabled = screen
      .getAllByRole('button')
      .filter(button => (button as HTMLButtonElement).disabled);
    expect(disabled.length).toBeGreaterThan(0);
    expect(disabled[0]).toHaveAttribute('title', 'Album art needs a Pro plan.');
    await user.click(disabled[0]);
    expect(onSelect).not.toHaveBeenCalled();
    await expectNoA11yViolations(container);
  });

  it('makes dimmed prompts inert and hidden from assistive tech', async () => {
    const { container } = render(<SuggestedPrompts onSelect={vi.fn()} dimmed />);

    expect(container.firstElementChild).toHaveAttribute('aria-hidden', 'true');
    await expectNoA11yViolations(container);
  });

  it('personalizes the pitch pill with the latest release title', () => {
    render(
      <SuggestedPrompts
        onSelect={vi.fn()}
        canUseAdvancedTools
        latestReleaseTitle='Sober'
      />
    );

    expect(
      screen.getByRole('button', { name: 'Pitch for “Sober”' })
    ).toBeInTheDocument();
  });
});
