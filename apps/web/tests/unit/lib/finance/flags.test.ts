import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockGetAppFlagValue = vi.hoisted(() => vi.fn());

vi.mock('@/lib/flags/server', () => ({
  getAppFlagValue: mockGetAppFlagValue,
}));

const OWNER_ID = '11111111-2222-3333-4444-555555555555';

describe('creator finance release gate (JOV-4621)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.FINANCE_DISABLE;
  });

  afterEach(() => {
    delete process.env.FINANCE_DISABLE;
  });

  it('is disabled by default for everyone, including admins', async () => {
    const { APP_FLAG_DEFAULTS } = await import('@/lib/flags/contracts');
    expect(APP_FLAG_DEFAULTS.CREATOR_FINANCE).toBe(false);
  });

  it('resolves the CREATOR_FINANCE flag when the kill switch is unset', async () => {
    mockGetAppFlagValue.mockResolvedValue(true);
    const { isCreatorFinanceEnabled } = await import('@/lib/finance/flags');
    await expect(isCreatorFinanceEnabled(OWNER_ID)).resolves.toBe(true);
    expect(mockGetAppFlagValue).toHaveBeenCalledWith('CREATOR_FINANCE', {
      userId: OWNER_ID,
    });
  });

  it.each(['true', '1'])(
    'FINANCE_DISABLE=%s forces the feature off even when the flag is on',
    async value => {
      process.env.FINANCE_DISABLE = value;
      mockGetAppFlagValue.mockResolvedValue(true);
      const { isCreatorFinanceEnabled, isFinanceKillSwitchEngaged } =
        await import('@/lib/finance/flags');
      expect(isFinanceKillSwitchEngaged()).toBe(true);
      await expect(isCreatorFinanceEnabled(OWNER_ID)).resolves.toBe(false);
      expect(mockGetAppFlagValue).not.toHaveBeenCalled();
    }
  );

  it.each(['false', '0', '', 'yes'])(
    'FINANCE_DISABLE=%s does not engage the kill switch',
    async value => {
      process.env.FINANCE_DISABLE = value;
      mockGetAppFlagValue.mockResolvedValue(false);
      const { isFinanceKillSwitchEngaged } = await import(
        '@/lib/finance/flags'
      );
      expect(isFinanceKillSwitchEngaged()).toBe(false);
    }
  );

  it('fails closed when flag evaluation throws', async () => {
    mockGetAppFlagValue.mockRejectedValue(new Error('flag backend down'));
    const { isCreatorFinanceEnabled } = await import('@/lib/finance/flags');
    await expect(isCreatorFinanceEnabled(OWNER_ID)).resolves.toBe(false);
  });

  it('assertCreatorFinanceEnabled throws FinanceFeatureDisabledError when off', async () => {
    mockGetAppFlagValue.mockResolvedValue(false);
    const { assertCreatorFinanceEnabled, FinanceFeatureDisabledError } =
      await import('@/lib/finance/flags');
    await expect(assertCreatorFinanceEnabled(OWNER_ID)).rejects.toBeInstanceOf(
      FinanceFeatureDisabledError
    );
  });

  it('assertCreatorFinanceEnabled resolves when on', async () => {
    mockGetAppFlagValue.mockResolvedValue(true);
    const { assertCreatorFinanceEnabled } = await import('@/lib/finance/flags');
    await expect(
      assertCreatorFinanceEnabled(OWNER_ID)
    ).resolves.toBeUndefined();
  });
});
