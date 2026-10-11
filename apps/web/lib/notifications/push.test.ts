import { beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  decryptPIIMock: vi.fn(),
  providerMock: vi.fn(),
  providerSendMock: vi.fn(),
  providerShutdownMock: vi.fn(),
  selectMock: vi.fn(),
  updateMock: vi.fn(),
}));

vi.mock('@parse/node-apn', () => ({
  Notification: class {},
  Provider: hoisted.providerMock,
}));

vi.mock('@/lib/db', () => ({
  db: {
    select: hoisted.selectMock,
    update: hoisted.updateMock,
  },
}));

vi.mock('@/lib/env-server', () => ({
  env: {
    JOVIE_IOS_APNS_KEY_ID: 'key-id',
    JOVIE_IOS_APNS_PRIVATE_KEY: 'private-key',
    JOVIE_IOS_APNS_TEAM_ID: 'team-id',
    JOVIE_IOS_APNS_TOPIC: 'ie.jov.Jovie',
  },
}));

vi.mock('@/lib/error-tracking', () => ({ captureError: vi.fn() }));
vi.mock('@/lib/utils/pii-encryption', () => ({
  decryptPII: hoisted.decryptPIIMock,
}));

import { sendPushNotification } from './push';

function selectWithLimit(rows: unknown[]) {
  return {
    from: vi.fn(() => ({
      where: vi.fn(() => ({
        limit: vi.fn().mockResolvedValue(rows),
      })),
    })),
  };
}

function selectRows(rows: unknown[]) {
  return {
    from: vi.fn(() => ({
      where: vi.fn().mockResolvedValue(rows),
    })),
  };
}

describe('APNs notification delivery', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hoisted.decryptPIIMock.mockReturnValue('device-token');
    hoisted.providerSendMock.mockResolvedValue({
      sent: [{ device: 'device-token' }],
      failed: [],
    });
    hoisted.providerShutdownMock.mockResolvedValue(undefined);
    hoisted.providerMock.mockImplementation(function (this: {
      send: typeof hoisted.providerSendMock;
      shutdown: typeof hoisted.providerShutdownMock;
    }) {
      this.send = hoisted.providerSendMock;
      this.shutdown = hoisted.providerShutdownMock;
    });
    hoisted.updateMock.mockReturnValue({
      set: vi.fn(() => ({ where: vi.fn().mockResolvedValue(undefined) })),
    });
  });

  it('respects the canonical push preference opt-out before contacting APNs', async () => {
    hoisted.selectMock
      .mockReturnValueOnce(
        selectWithLimit([
          { userId: 'app-user-id', betterAuthUserId: 'better-auth-user-id' },
        ])
      )
      .mockReturnValueOnce(selectWithLimit([{ enabled: false }]));

    const result = await sendPushNotification(
      {
        id: 'waitlist-welcome',
        category: 'transactional',
        subject: "You're off the waitlist!",
        text: 'Your access is ready.',
      },
      { email: 'creator@example.com' }
    );

    expect(result).toEqual({
      channel: 'push',
      status: 'skipped',
      detail: 'Channel disabled by preferences',
    });
    expect(hoisted.providerMock).not.toHaveBeenCalled();
    expect(hoisted.selectMock).toHaveBeenCalledTimes(2);
  });

  it('sends an alert to an enabled registered device', async () => {
    hoisted.selectMock
      .mockReturnValueOnce(
        selectWithLimit([
          { userId: 'app-user-id', betterAuthUserId: 'better-auth-user-id' },
        ])
      )
      .mockReturnValueOnce(selectWithLimit([{ enabled: true }]))
      .mockReturnValueOnce(
        selectRows([
          {
            tokenHash: 'token-hash',
            encryptedToken: 'encrypted-token',
            environment: 'sandbox',
          },
        ])
      );

    const result = await sendPushNotification(
      {
        id: 'waitlist-welcome',
        category: 'transactional',
        subject: "You're off the waitlist!",
        text: 'Your access is ready.',
        pushBody: 'Open Jovie to get started.',
      },
      { email: 'creator@example.com' }
    );

    expect(result).toEqual({
      channel: 'push',
      status: 'sent',
      provider: 'apns',
      detail: '1 device',
    });
    expect(hoisted.providerMock).toHaveBeenCalledWith(
      expect.objectContaining({ production: false })
    );
    expect(hoisted.providerSendMock).toHaveBeenCalledWith(
      expect.objectContaining({
        alert: {
          title: "You're off the waitlist!",
          body: 'Open Jovie to get started.',
        },
        pushType: 'alert',
        topic: 'ie.jov.Jovie',
      }),
      ['device-token']
    );
    expect(hoisted.updateMock).toHaveBeenCalledTimes(1);
    expect(hoisted.providerShutdownMock).toHaveBeenCalledTimes(1);
  });
});
