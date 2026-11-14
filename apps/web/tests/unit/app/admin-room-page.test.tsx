import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  requireAccess: vi.fn().mockResolvedValue('user_admin'),
  flag: vi.fn(),
  read: vi.fn(),
  canSend: vi.fn().mockReturnValue(false),
  notFound: vi.fn(() => {
    throw new Error('NEXT_NOT_FOUND');
  }),
}));

vi.mock('next/navigation', () => ({ notFound: mocks.notFound }));
vi.mock('@/components/features/admin/layout/AdminPage', () => ({
  AdminPage: ({
    children,
    testId,
  }: {
    children: ReactNode;
    testId: string;
  }) => <section data-testid={testId}>{children}</section>,
}));
vi.mock('@/components/features/agent-room/AgentRoom', () => ({
  AgentRoom: ({
    unavailableReason,
    composer,
  }: {
    unavailableReason: string | null;
    composer?: ReactNode;
  }) => (
    <div data-testid='room-probe'>
      {unavailableReason ?? 'ok'}
      {composer}
    </div>
  ),
}));
vi.mock('@/components/features/agent-room/AgentRoomComposer', () => ({
  AgentRoomComposer: ({ agents }: { agents: readonly { id: string }[] }) => (
    <form data-testid='composer-probe'>{agents.length}</form>
  ),
}));
vi.mock('@/lib/ovie/fleet-room-send.server', () => ({
  FLEET_ROOM_MESSAGE_MAX_CHARS: 2000,
  fleetRoomCanSend: mocks.canSend,
}));
vi.mock('@/app/app/(shell)/admin/room/actions', () => ({
  sendFleetRoomMessageAction: vi.fn(),
}));
vi.mock('@/lib/admin/page-access', () => ({
  requireCurrentAdminPageAccess: mocks.requireAccess,
}));
vi.mock('@/lib/flags/server', () => ({ getAppFlagValue: mocks.flag }));
vi.mock('@/lib/ovie/fleet-room.server', () => ({
  readOvieFleetRoom: mocks.read,
}));
vi.mock('@/lib/seo/noindex-metadata', () => ({
  NOINDEX_ROBOTS: { index: false, follow: false },
}));

const { default: AdminRoomPage } = await import(
  '@/app/app/(shell)/admin/room/page'
);

describe('AdminRoomPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.canSend.mockReturnValue(false);
  });

  it('is not found when OVIE_FLEET_ROOM is off', async () => {
    mocks.flag.mockResolvedValueOnce(false);
    await expect(AdminRoomPage()).rejects.toThrow('NEXT_NOT_FOUND');
    expect(mocks.flag).toHaveBeenCalledWith('OVIE_FLEET_ROOM', {
      userId: 'user_admin',
    });
    expect(mocks.read).not.toHaveBeenCalled();
  });

  it('renders the room, and says so only when a read failed', async () => {
    mocks.flag.mockResolvedValue(true);
    mocks.read.mockResolvedValueOnce({ status: 'ok', view: {} });
    const { unmount } = render(await AdminRoomPage());
    expect(screen.getByTestId('room-probe')).toHaveTextContent('ok');
    unmount();
    mocks.read.mockResolvedValueOnce({
      status: 'unavailable',
      reason: 'redis-unavailable',
      view: {},
    });
    const second = render(await AdminRoomPage());
    // No store: an empty feed, never an explanation of the missing store.
    expect(screen.getByTestId('room-probe')).toHaveTextContent('ok');
    second.unmount();
    mocks.read.mockResolvedValueOnce({
      status: 'unavailable',
      reason: 'store-read-failed',
      view: {},
    });
    render(await AdminRoomPage());
    expect(screen.getByTestId('room-probe')).toHaveTextContent(
      'could not be read just now'
    );
  });

  it('shows the composer only where Linear is configured', async () => {
    mocks.flag.mockResolvedValue(true);
    mocks.read.mockResolvedValue({ status: 'ok', view: {} });
    const { unmount } = render(await AdminRoomPage());
    expect(screen.queryByTestId('composer-probe')).toBeNull();
    unmount();
    mocks.canSend.mockReturnValue(true);
    render(await AdminRoomPage());
    expect(screen.getByTestId('composer-probe')).toBeInTheDocument();
  });
});
