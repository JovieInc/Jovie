import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { DspConnectionPill } from './DspConnectionPill';

describe('DspConnectionPill', () => {
  it('offers to connect when disconnected', async () => {
    const onClick = vi.fn();
    const { container } = render(
      <DspConnectionPill
        provider='spotify'
        connected={false}
        onClick={onClick}
      />
    );
    await userEvent.click(screen.getByRole('button', { name: /Connect/ }));
    expect(onClick).toHaveBeenCalledOnce();
    await expectNoA11yViolations(container);
  });

  it('disables the connect button when disabled', async () => {
    const { container } = render(
      <DspConnectionPill provider='spotify' connected={false} disabled />
    );
    expect(screen.getByRole('button')).toBeDisabled();
    await expectNoA11yViolations(container);
  });

  it('shows a read-only pill when connected without actions', async () => {
    const { container } = render(
      <DspConnectionPill provider='spotify' connected artistName='Ari Lane' />
    );
    expect(screen.getByText('Ari Lane')).toBeVisible();
    expect(screen.queryByRole('button')).toBeNull();
    await expectNoA11yViolations(container);
  });

  it('falls back to Connected without an artist name', () => {
    render(<DspConnectionPill provider='spotify' connected />);
    expect(screen.getByText('Connected')).toBeVisible();
  });

  it('opens the action menu and runs sync and disconnect', async () => {
    const user = userEvent.setup();
    const onSyncNow = vi.fn();
    const onDisconnect = vi.fn();
    const { container } = render(
      <DspConnectionPill
        provider='spotify'
        connected
        artistName='Ari Lane'
        onSyncNow={onSyncNow}
        onDisconnect={onDisconnect}
      />
    );
    const trigger = screen.getByRole('button', {
      name: /connection: Ari Lane/,
    });
    await user.click(trigger);
    await user.click(await screen.findByRole('menuitem', { name: 'Sync' }));
    expect(onSyncNow).toHaveBeenCalledOnce();

    await user.click(trigger);
    await user.click(
      await screen.findByRole('menuitem', { name: 'Disconnect' })
    );
    expect(onDisconnect).toHaveBeenCalledOnce();
    await expectNoA11yViolations(container);
  });
});
