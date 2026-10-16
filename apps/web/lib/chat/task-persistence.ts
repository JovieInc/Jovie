/** Presentation only. Domain adapters supply receipts from their existing authority. */
export type TaskState =
  | 'draft'
  | 'submitting'
  | 'acknowledgement-unknown'
  | 'persisted-locally'
  | 'persisted-remotely'
  | 'succeeded'
  | 'failed'
  | 'canceled';

export interface TaskRequest {
  readonly scopeId: string;
  readonly requestId: string;
}

export interface TaskPersistenceReceipt extends TaskRequest {
  readonly objectId: string;
  readonly revision: number;
  readonly durability: 'local' | 'remote';
}

/** Tool success, a preview and an HTTP 200 are not persistence receipts. */
export function resolveTaskPersistence(
  request: TaskRequest,
  receipt?: TaskPersistenceReceipt
): TaskState {
  if (
    !request.scopeId.trim() ||
    !request.requestId.trim() ||
    receipt?.scopeId !== request.scopeId ||
    receipt.requestId !== request.requestId ||
    !receipt.objectId.trim() ||
    !Number.isSafeInteger(receipt.revision) ||
    receipt.revision < 1
  ) {
    return 'acknowledgement-unknown';
  }
  if (receipt.durability === 'remote') return 'persisted-remotely';
  if (receipt.durability === 'local') return 'persisted-locally';
  return 'acknowledgement-unknown';
}
