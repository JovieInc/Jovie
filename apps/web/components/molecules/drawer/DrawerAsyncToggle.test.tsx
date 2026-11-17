import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { DrawerAsyncToggle } from './DrawerAsyncToggle';

const { toast } = vi.hoisted(() => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock('@/components/feedback', () => ({ toast }));

function renderToggle(
  props: Partial<Parameters<typeof DrawerAsyncToggle>[0]> = {}
) {
  return render(
    <DrawerAsyncToggle
      label='Show on profile'
      ariaLabel='Show on profile'
      checked={false}
      onToggle={() => Promise.resolve()}
      {...props}
    />
  );
}

describe('DrawerAsyncToggle', () => {
  beforeEach(() => {
    toast.success.mockReset();
    toast.error.mockReset();
  });

  it('saves the new value and confirms it', async () => {
    const onToggle = vi.fn(() => Promise.resolve());
    const { container } = renderToggle({
      onToggle,
      successMessage: enabled => (enabled ? 'Shown' : 'Hidden'),
    });

    fireEvent.click(screen.getByRole('switch', { name: 'Show on profile' }));

    expect(onToggle).toHaveBeenCalledWith(true);
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Shown'));
    expect(screen.getByRole('switch')).toBeEnabled();
    expect(screen.getByRole('switch')).toHaveAttribute('aria-checked', 'true');
    await expectNoA11yViolations(container);
  });

  it('disables the switch while the save is pending', async () => {
    let resolve: () => void = () => undefined;
    const { container } = renderToggle({
      onToggle: () =>
        new Promise<void>(done => {
          resolve = done;
        }),
    });

    fireEvent.click(screen.getByRole('switch'));

    expect(screen.getByRole('switch')).toBeDisabled();
    expect(screen.getByRole('switch')).toHaveAttribute('aria-checked', 'true');
    await expectNoA11yViolations(container);
    resolve();
    await waitFor(() => expect(screen.getByRole('switch')).toBeEnabled());
    expect(toast.success).not.toHaveBeenCalled();
  });

  it('reverts and reports a failed save', async () => {
    const { container } = renderToggle({
      onToggle: () => Promise.reject(new Error('save failed')),
    });

    fireEvent.click(screen.getByRole('switch'));

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith('Failed to update setting')
    );
    expect(screen.getByRole('switch')).toHaveAttribute('aria-checked', 'false');
    expect(screen.getByRole('switch')).toBeEnabled();
    await expectNoA11yViolations(container);
  });

  it('reverts when the network is offline', async () => {
    const { container } = renderToggle({
      checked: true,
      onToggle: () => Promise.reject(new TypeError('Failed to fetch')),
    });

    fireEvent.click(screen.getByRole('switch'));

    await waitFor(() => expect(toast.error).toHaveBeenCalledOnce());
    expect(screen.getByRole('switch')).toHaveAttribute('aria-checked', 'true');
    await expectNoA11yViolations(container);
  });

  it('follows a new checked value from its owner', async () => {
    const { container, rerender } = renderToggle();

    rerender(
      <DrawerAsyncToggle
        label='Show on profile'
        ariaLabel='Show on profile'
        checked
        onToggle={() => Promise.resolve()}
      />
    );

    expect(screen.getByRole('switch')).toHaveAttribute('aria-checked', 'true');
    await expectNoA11yViolations(container);
  });

  it('toggles from a long label', async () => {
    const label =
      'Notify fans by email and SMS when this release goes live on every streaming service';
    const onToggle = vi.fn(() => Promise.resolve());
    const { container } = renderToggle({
      label,
      ariaLabel: 'Notify fans when this release goes live',
      onToggle,
    });

    fireEvent.click(screen.getByText(label));
    expect(onToggle).toHaveBeenCalledWith(true);
    await waitFor(() => expect(screen.getByRole('switch')).toBeEnabled());
    await expectNoA11yViolations(container);
  });

  it('toggles in a right-to-left drawer', async () => {
    const onToggle = vi.fn(() => Promise.resolve());
    const { container } = render(
      <div dir='rtl' lang='ar'>
        <DrawerAsyncToggle
          label='إظهار في الملف الشخصي'
          ariaLabel='إظهار في الملف الشخصي'
          checked={false}
          onToggle={onToggle}
        />
      </div>
    );

    fireEvent.click(
      screen.getByRole('switch', { name: 'إظهار في الملف الشخصي' })
    );
    expect(onToggle).toHaveBeenCalledWith(true);
    await waitFor(() => expect(screen.getByRole('switch')).toBeEnabled());
    await expectNoA11yViolations(container);
  });
});
