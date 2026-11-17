import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { RuntimeUpdatePill } from './RuntimeUpdatePill';

describe('RuntimeUpdatePill', () => {
  it('pins the update to the bottom corner, outside page content flow', () => {
    render(
      <RuntimeUpdatePill
        title='Reload Jovie to update'
        description='Reload when ready.'
        busy={false}
        onApply={vi.fn()}
      />
    );
    const region = screen.getByRole('region', { name: 'App Updates' });
    expect(region).toHaveClass('fixed', 'end-4', 'bottom-4', 'z-banner');
    expect(
      screen.getByRole('button', { name: 'Reload Jovie to update' })
    ).toHaveAccessibleDescription('Reload when ready.');
  });

  it('applies only on an explicit press and blocks repeat presses while busy', () => {
    const onApply = vi.fn();
    const { rerender } = render(
      <RuntimeUpdatePill
        title='Restart Jovie to update'
        description='Install when ready.'
        busy={false}
        onApply={onApply}
      />
    );
    expect(onApply).not.toHaveBeenCalled();
    fireEvent.click(
      screen.getByRole('button', { name: 'Restart Jovie to update' })
    );
    expect(onApply).toHaveBeenCalledOnce();
    rerender(
      <RuntimeUpdatePill
        title='Updating Jovie…'
        description='Installing the update and restarting Jovie…'
        busy
        onApply={onApply}
      />
    );
    expect(
      screen.getByRole('button', { name: 'Updating Jovie…' })
    ).toBeDisabled();
  });

  it.each([
    ['ready', false, 'Reload Jovie to update'],
    ['busy', true, 'Updating Jovie…'],
    [
      'long title',
      false,
      'Restart Jovie to install the latest desktop update and keep working',
    ],
  ])('is axe-clean when %s', async (_state, busy, title) => {
    const { container } = render(
      <div dir={title.length > 40 ? 'rtl' : 'ltr'}>
        <RuntimeUpdatePill
          title={title}
          description='Install when ready.'
          busy={busy}
          onApply={vi.fn()}
        />
      </div>
    );
    await expectNoA11yViolations(container);
  });

  it('caps its width so a long title truncates instead of covering the page', () => {
    render(
      <RuntimeUpdatePill
        title='Restart Jovie to install the latest desktop update and keep working'
        description='Install when ready.'
        busy={false}
        onApply={vi.fn()}
      />
    );
    expect(screen.getByRole('button')).toHaveClass('max-w-80');
    expect(
      screen.getByText(
        'Restart Jovie to install the latest desktop update and keep working'
      )
    ).toHaveClass('truncate');
  });
});
