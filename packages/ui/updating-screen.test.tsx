import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Button } from './atoms/button';
import { expectNoA11yViolations } from './test-utils/a11y';
import { UpdatingScreen } from './updating-screen';

const copy = {
  title: 'Updating Jovie',
  description: 'Keep working. Jovie tells you when it is ready.',
  progressLabel: 'Download progress',
};

describe('UpdatingScreen', () => {
  it('shows real progress alongside the canonical brand mark', () => {
    const { container } = render(<UpdatingScreen {...copy} progress={35} />);
    expect(
      screen.getByRole('heading', { name: copy.title })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('progressbar', { name: copy.progressLabel })
    ).toHaveAttribute('aria-valuenow', '35');
    expect(screen.getByText('35%')).toBeInTheDocument();
    expect(container.querySelector('[data-jo-state="loading"]')).not.toBeNull();
  });

  it.each([undefined, Number.NaN, Number.POSITIVE_INFINITY])(
    'does not invent a percentage for unknown progress %s',
    progress => {
      render(<UpdatingScreen {...copy} progress={progress} />);
      expect(screen.getByRole('progressbar')).not.toHaveAttribute(
        'aria-valuenow'
      );
      expect(screen.queryByText(/%/)).not.toBeInTheDocument();
    }
  );

  it.each([
    [-20, 0],
    [150, 100],
  ])('clamps progress %i consistently to %i', (progress, expected) => {
    render(<UpdatingScreen {...copy} progress={progress} />);
    expect(screen.getByText(`${expected}%`)).toBeInTheDocument();
    expect(screen.getByRole('progressbar')).toHaveAttribute(
      'aria-valuenow',
      String(expected)
    );
  });

  it('preserves the action and its keyboard focus through progress updates', async () => {
    const onHide = vi.fn();
    const props = { ...copy, actions: <Button onClick={onHide}>Hide</Button> };
    const { rerender } = render(<UpdatingScreen {...props} progress={12} />);
    await userEvent.tab();
    expect(screen.getByRole('button', { name: 'Hide' })).toHaveFocus();
    rerender(<UpdatingScreen {...props} progress={65} />);
    expect(screen.getByRole('button', { name: 'Hide' })).toHaveFocus();
    await userEvent.keyboard('{Enter}');
    expect(onHide).toHaveBeenCalledTimes(1);
  });

  it.each(['ready', 'error'] as const)(
    'removes the loading indicator for %s while retaining recovery actions',
    async state => {
      const onAction = vi.fn();
      render(
        <UpdatingScreen
          {...copy}
          state={state}
          progress={35}
          actions={<Button onClick={onAction}>Continue</Button>}
        />
      );
      expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
      expect(screen.queryByText('35%')).not.toBeInTheDocument();
      await userEvent.click(screen.getByRole('button', { name: 'Continue' }));
      expect(onAction).toHaveBeenCalledTimes(1);
    }
  );

  it('has no automated accessibility violations', async () => {
    const { container } = render(<UpdatingScreen {...copy} progress={35} />);
    await expectNoA11yViolations(container);
  });
});

describe('updating-screen scale tokens', () => {
  it('uses the 16px text-base step instead of the text-lg alias', async () => {
    const { readFileSync } = await import('node:fs');
    const { join } = await import('node:path');
    const source = readFileSync(
      join(import.meta.dirname, 'updating-screen.tsx'),
      'utf8'
    );

    expect(source).not.toMatch(/(?<![\w-])text-lg\b/);
    expect(source).toContain('text-base');
  });
});
