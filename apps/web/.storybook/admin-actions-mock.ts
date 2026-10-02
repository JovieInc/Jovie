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

export async function rerunCustomerIngestionAction(
  _formData: FormData
): Promise<CustomerIngestionRecoveryReceipt> {
  return {
    state: 'requested',
    queuedCount: 2,
    checkedAt: '2026-10-02T12:00:00.000Z',
  };
}
