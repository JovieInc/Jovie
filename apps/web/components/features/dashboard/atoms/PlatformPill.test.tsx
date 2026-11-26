import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { PlatformPill } from './PlatformPill';

describe('PlatformPill accessible naming (label-content-name-mismatch)', () => {
  it('names an expanded interactive pill from its visible text', () => {
    render(
      <PlatformPill
        platformIcon='spotify'
        platformName='Spotify'
        primaryText='my-artist'
        onClick={vi.fn()}
      />
    );

    const button = screen.getByRole('button');
    expect(button).toHaveAccessibleName('Select Spotify: my-artist');
    expect(button).toHaveTextContent('my-artist');
  });

  it('keeps the collapsed pill label containing the visible text', () => {
    render(
      <PlatformPill
        platformIcon='spotify'
        platformName='Spotify'
        primaryText='my-artist'
        collapsed
        onClick={vi.fn()}
      />
    );

    expect(screen.getByRole('button')).toHaveAccessibleName(
      'Spotify: my-artist'
    );
  });
});

describe('PlatformPill behaviour', () => {
  it('fires onClick from a real button and is axe-clean', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    const { container } = render(
      <PlatformPill
        platformIcon='spotify'
        platformName='Spotify'
        primaryText='my-artist'
        onClick={onClick}
        testId='pill'
      />
    );

    const pill = screen.getByTestId('pill');
    expect(pill.tagName).toBe('BUTTON');
    expect(pill).toHaveAttribute('type', 'button');
    await user.click(pill);
    await user.tab();

    expect(onClick).toHaveBeenCalledTimes(1);
    await expectNoA11yViolations(container);
  });

  it('renders a non-interactive pill as a plain element', async () => {
    const { container } = render(
      <PlatformPill
        platformIcon='spotify'
        platformName='Spotify'
        primaryText='my-artist'
        state='loading'
        testId='pill'
      />
    );

    expect(screen.getByTestId('pill').tagName).toBe('DIV');
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('falls back to a neutral brand colour for an unknown platform', () => {
    render(
      <PlatformPill
        platformIcon='not-a-real-platform'
        platformName='Mystery'
        primaryText='mystery'
        testId='pill'
      />
    );

    expect(screen.getByTestId('pill').getAttribute('style') ?? '').toContain(
      '107, 114, 128'
    );
  });
});
