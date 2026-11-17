// Mock for app/app/(shell)/admin/actions — the real 'use server' module
// imports the database and auth stack, which cannot run in the Storybook
// browser build. Stories exercise the receipt rendering path, not the
// server mutation, so the action resolves with a deterministic receipt.

export type CustomerIngestionRecoveryState =
  | 'requested'
  | 'already-running'
  | 'missing-source'
  | 'not-found';

export interface CustomerIngestionRecoveryReceipt {
  readonly state: CustomerIngestionRecoveryState;
  readonly queuedCount: number;
  readonly checkedAt: string;
}

/**
 * A story may answer the action itself (a pending or rejected request) by
 * setting this hook; it must remove the hook when the story unmounts.
 */
export type RerunCustomerIngestionStoryMock = (
  formData: FormData
) => Promise<CustomerIngestionRecoveryReceipt>;

export async function rerunCustomerIngestionAction(
  formData: FormData
): Promise<CustomerIngestionRecoveryReceipt> {
  const storyMock = (
    globalThis as {
      __jovieRerunIngestionMock?: RerunCustomerIngestionStoryMock;
    }
  ).__jovieRerunIngestionMock;
  if (storyMock) return storyMock(formData);
  return {
    state: 'requested',
    queuedCount: 2,
    checkedAt: '2026-10-02T12:00:00.000Z',
  };
}
