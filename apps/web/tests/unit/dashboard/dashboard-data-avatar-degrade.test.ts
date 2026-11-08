import { beforeEach, describe, expect, it, vi } from 'vitest';

const { captureExceptionMock, loggerWarnMock } = vi.hoisted(() => ({
  captureExceptionMock: vi.fn(),
  loggerWarnMock: vi.fn(),
}));

vi.mock('@sentry/nextjs', () => ({
  captureException: captureExceptionMock,
  logger: { warn: loggerWarnMock },
}));

import {
  degradeAvatarQualityRead,
  isIdleTransactionTermination,
} from '@/app/app/(shell)/dashboard/actions/avatar-quality-degrade';
import { UNKNOWN_AVATAR_QUALITY } from '@/lib/profile/avatar-quality';

const IDLE_TEXT = 'terminating connection due to idle-in-transaction timeout';
const selectError = (cause: Error) =>
  new Error('Failed query: select "width", "height" from "profile_photos"', {
    cause,
  });

describe('degradeAvatarQualityRead (JOV-8900)', () => {
  beforeEach(() => {
    captureExceptionMock.mockReset();
    loggerWarnMock.mockReset();
  });

  it('degrades statement timeouts log-only with the JOV-8864 message', () => {
    const error = selectError(
      new Error('canceling statement due to statement timeout')
    );

    expect(degradeAvatarQualityRead(error, 'profile_1')).toBe(
      UNKNOWN_AVATAR_QUALITY
    );
    expect(captureExceptionMock).not.toHaveBeenCalled();
    expect(loggerWarnMock).toHaveBeenCalledWith(
      '[avatar-quality] avatar read timed out; degrading to unknown quality',
      expect.objectContaining({
        profileId: 'profile_1',
        error: expect.stringContaining('statement timeout'),
      })
    );
  });

  it('degrades idle-in-transaction terminations on the select log-only', () => {
    const cause = Object.assign(new Error(IDLE_TEXT), { code: '25P03' });

    expect(degradeAvatarQualityRead(selectError(cause), 'profile_1')).toBe(
      UNKNOWN_AVATAR_QUALITY
    );
    expect(captureExceptionMock).not.toHaveBeenCalled();
    expect(loggerWarnMock).toHaveBeenCalledWith(
      expect.stringContaining('[avatar-quality]'),
      expect.objectContaining({ profileId: 'profile_1' })
    );
  });

  it('degrades connection-class failures log-only', () => {
    const result = degradeAvatarQualityRead(
      selectError(new Error('read ECONNRESET')),
      'profile_1'
    );

    expect(result).toBe(UNKNOWN_AVATAR_QUALITY);
    expect(captureExceptionMock).not.toHaveBeenCalled();
    expect(loggerWarnMock).toHaveBeenCalledWith(
      '[avatar-quality] transient DB condition after retry; degrading to unknown quality',
      expect.objectContaining({ profileId: 'profile_1' })
    );
  });

  it('still reports unexpected failures to Sentry', () => {
    const error = new Error('column "width" does not exist');

    expect(degradeAvatarQualityRead(error, 'profile_1')).toBe(
      UNKNOWN_AVATAR_QUALITY
    );
    expect(loggerWarnMock).not.toHaveBeenCalled();
    expect(captureExceptionMock).toHaveBeenCalledWith(
      error,
      expect.objectContaining({
        level: 'warning',
        tags: expect.objectContaining({ query: 'avatar_quality' }),
      })
    );
  });
});

describe('isIdleTransactionTermination', () => {
  it('matches the 25P03 code and the code-less message', () => {
    expect(
      isIdleTransactionTermination(
        Object.assign(new Error('x'), { code: '25P03' })
      )
    ).toBe(true);
    expect(isIdleTransactionTermination(new Error(IDLE_TEXT))).toBe(true);
    expect(isIdleTransactionTermination(new Error('other'))).toBe(false);
  });
});
