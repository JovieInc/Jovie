import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { ArtistProfileAdaptiveSequence } from './ArtistProfileAdaptiveSequence';
import storyMeta from './ArtistProfileAdaptiveSequence.stories';

const args = storyMeta.args;

describe('ArtistProfileAdaptiveSequence', () => {
  it('wraps the mode switcher in the overlapping sequence shell', async () => {
    const { container } = render(<ArtistProfileAdaptiveSequence {...args} />);
    const sequence = screen.getByTestId('artist-profile-adaptive-sequence');
    expect(sequence.closest('.ap-adaptive-sequence')).not.toBeNull();
    expect(
      screen.getByRole('tablist', { name: 'Profile Modes' })
    ).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('moves selection with the keyboard across profile modes', async () => {
    const user = userEvent.setup();
    const { container } = render(<ArtistProfileAdaptiveSequence {...args} />);
    const [first, second] = args.adaptive.modes;
    const firstTab = screen.getByRole('tab', { name: first.label });
    expect(firstTab).toHaveAttribute('aria-selected', 'true');
    await user.click(firstTab);
    await user.keyboard('{ArrowRight}');
    const secondTab = screen.getByRole('tab', { name: second.label });
    expect(secondTab).toHaveFocus();
    expect(secondTab).toHaveAttribute('aria-selected', 'true');
    expect(
      screen.getByRole('img', { name: second.screenshotAlt })
    ).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });
});
