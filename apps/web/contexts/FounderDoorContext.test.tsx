import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import type { DashboardData } from '@/app/app/(shell)/dashboard/actions/dashboard-data';
import { DashboardDataContext } from '@/app/app/(shell)/dashboard/DashboardDataContext';
import {
  FounderDoorProvider,
  useFounderDoor,
} from '@/contexts/FounderDoorContext';
import { FOUNDER_DOOR_STORAGE_KEY } from '@/lib/ovie/founder-door';

function DoorProbe() {
  const { canUse, door, chatMode } = useFounderDoor();
  return (
    <div
      data-testid='door'
      data-can-use={String(canUse)}
      data-door={door}
      data-chat-mode={chatMode ?? ''}
    />
  );
}

function DoorToggle() {
  const { toggle } = useFounderDoor();
  return (
    <button type='button' onClick={toggle}>
      toggle-door
    </button>
  );
}

function renderDoor(isAdmin: boolean) {
  return render(
    <DashboardDataContext.Provider value={{ isAdmin } as DashboardData}>
      <FounderDoorProvider>
        <DoorProbe />
        <DoorToggle />
      </FounderDoorProvider>
    </DashboardDataContext.Provider>
  );
}

describe('FounderDoorProvider (JOV-5239)', () => {
  afterEach(() => {
    globalThis.sessionStorage.clear();
  });

  it('keeps public chat on Jovie until an entitled user toggles', () => {
    renderDoor(true);
    expect(screen.getByTestId('door')).toHaveAttribute('data-door', 'jovie');
    expect(screen.getByTestId('door')).toHaveAttribute('data-chat-mode', '');
    fireEvent.click(screen.getByRole('button', { name: 'toggle-door' }));
    expect(screen.getByTestId('door')).toHaveAttribute('data-door', 'ovie');
    expect(screen.getByTestId('door')).toHaveAttribute('data-chat-mode', 'ov');
    fireEvent.click(screen.getByRole('button', { name: 'toggle-door' }));
    expect(screen.getByTestId('door')).toHaveAttribute('data-door', 'jovie');
  });

  it('ignores stored Ovie and toggle when not entitled', () => {
    globalThis.sessionStorage.setItem(FOUNDER_DOOR_STORAGE_KEY, 'ovie');
    renderDoor(false);
    expect(screen.getByTestId('door')).toHaveAttribute('data-can-use', 'false');
    expect(screen.getByTestId('door')).toHaveAttribute('data-door', 'jovie');
    expect(screen.getByTestId('door')).toHaveAttribute('data-chat-mode', '');
    fireEvent.click(screen.getByRole('button', { name: 'toggle-door' }));
    expect(screen.getByTestId('door')).toHaveAttribute('data-door', 'jovie');
    expect(globalThis.sessionStorage.getItem(FOUNDER_DOOR_STORAGE_KEY)).toBe(
      'ovie'
    );
  });

  it('restores an explicit entitled Ovie toggle from session storage', async () => {
    globalThis.sessionStorage.setItem(FOUNDER_DOOR_STORAGE_KEY, 'ovie');
    renderDoor(true);
    await waitFor(() => {
      expect(screen.getByTestId('door')).toHaveAttribute('data-door', 'ovie');
    });
    expect(screen.getByTestId('door')).toHaveAttribute('data-chat-mode', 'ov');
  });
});
