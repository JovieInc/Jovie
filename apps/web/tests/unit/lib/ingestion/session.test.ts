import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockExecute, mockRunLegacyDbTransaction, mockValidateClerkUserId } =
  vi.hoisted(() => ({
    mockExecute: vi.fn(),
    mockRunLegacyDbTransaction: vi.fn(
      async (fn: (tx: { execute: typeof mockExecute }) => Promise<unknown>) => {
        const tx = { execute: mockExecute } as const;
        return fn(tx as never);
      }
    ),
    mockValidateClerkUserId: vi.fn(),
  }));

vi.mock('@/lib/auth/session', () => ({
  validateClerkUserId: mockValidateClerkUserId,
}));

vi.mock('@/lib/db/legacy-transaction', () => ({
  runLegacyDbTransaction: mockRunLegacyDbTransaction,
}));

describe('@critical withSystemIngestionSession', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockExecute.mockResolvedValue(undefined);
    mockValidateClerkUserId.mockImplementation(() => undefined);
  });

  it('sets the ingestion user session with set_config and runs the operation', async () => {
    const { SYSTEM_INGESTION_USER, withSystemIngestionSession } = await import(
      '@/lib/ingestion/session'
    );

    const operation = vi.fn().mockResolvedValue('ok');

    const result = await withSystemIngestionSession(operation);

    expect(result).toBe('ok');
    expect(mockValidateClerkUserId).toHaveBeenCalledWith(SYSTEM_INGESTION_USER);
    expect(mockExecute).toHaveBeenCalledTimes(1);

    const queryText = JSON.stringify(mockExecute.mock.calls[0]?.[0]);
    expect(queryText).toContain("set_config('app.clerk_user_id'");
    expect(queryText).not.toContain('SET LOCAL');
    expect(operation).toHaveBeenCalledTimes(1);
  });

  it('fails closed when set_config cannot be applied', async () => {
    const { withSystemIngestionSession } = await import(
      '@/lib/ingestion/session'
    );

    mockExecute.mockRejectedValueOnce(new Error('set_config unavailable'));
    const operation = vi.fn();

    await expect(withSystemIngestionSession(operation)).rejects.toThrow(
      'set_config unavailable'
    );

    expect(mockExecute).toHaveBeenCalledTimes(1);
    expect(operation).not.toHaveBeenCalled();
  });
});
