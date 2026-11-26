// Drift T2.1: IconButton alias retirement — callsite migration coverage.
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { ExpandButton } from './ExpandButton';

describe('ExpandButton certificate', () => {
  it('asks to expand a collapsed multi-track release', async () => {
    const onClick = vi.fn();
    const user = userEvent.setup();
    const { container } = render(
      <ExpandButton
        isExpanded={false}
        isLoading={false}
        totalTracks={12}
        onClick={onClick}
      />
    );

    const button = screen.getByRole('button', { name: 'Expand tracks' });
    expect(button).toHaveAttribute('aria-expanded', 'false');
    // size=xs (h-6) matches the single-track spacer — no className restyle.
    expect(button.className).toMatch(/\bh-6\b/);
    expect(button.className).toMatch(/\bw-6\b/);
    await expectNoA11yViolations(container);

    await user.click(button);
    expect(onClick).toHaveBeenCalledTimes(1);
    expect(onClick.mock.calls[0][0].type).toBe('click');
  });

  it('asks to collapse an expanded release', async () => {
    const onClick = vi.fn();
    const user = userEvent.setup();
    const { container } = render(
      <ExpandButton
        isExpanded
        isLoading={false}
        totalTracks={2}
        onClick={onClick}
      />
    );

    const button = screen.getByRole('button', { name: 'Collapse tracks' });
    expect(button).toHaveAttribute('aria-expanded', 'true');
    await expectNoA11yViolations(container);

    await user.click(button);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('is disabled and ignores presses while tracks load', async () => {
    const onClick = vi.fn();
    const user = userEvent.setup();
    const { container } = render(
      <ExpandButton
        isExpanded={false}
        isLoading
        totalTracks={12}
        onClick={onClick}
      />
    );

    const button = screen.getByRole('button', { name: 'Expand tracks' });
    expect(button).toBeDisabled();
    await user.click(button);
    expect(onClick).not.toHaveBeenCalled();
    await expectNoA11yViolations(container);
  });

  it.each([0, 1])(
    'renders a hidden spacer for a %s-track release',
    async tracks => {
      const { container } = render(
        <ExpandButton
          isExpanded={false}
          isLoading={false}
          totalTracks={tracks}
          onClick={vi.fn()}
        />
      );

      expect(screen.queryByRole('button')).toBeNull();
      const spacer = container.firstElementChild;
      expect(spacer).toHaveAttribute('aria-hidden', 'true');
      expect(spacer?.className).toMatch(/\bh-6\b/);
      expect(spacer?.className).toMatch(/\bw-6\b/);
      await expectNoA11yViolations(container);
    }
  );
});
