/** Semantic operation status shared by Jovie and Ovie. No timers or status store. */
export const OPERATION_STATUSES = [
  'cancelled',
  'failed',
  'idle',
  'pending',
  'succeeded',
  'unknown',
  'working',
] as const;

export type OperationStatus = (typeof OPERATION_STATUSES)[number];

export interface OperationReceipt {
  /** Include the attempt/revision in this key when an operation can be retried. */
  readonly operationKey: string;
  readonly state: OperationStatus;
  readonly persisted: boolean;
}

export interface OperationObservation {
  readonly operationKey: string;
  readonly state: OperationStatus | string;
  /** Authoritative live execution, never inferred from an old running record. */
  readonly active: boolean;
  readonly receipt?: OperationReceipt;
}

export function resolveOperationStatus({
  operationKey,
  state,
  active,
  receipt,
}: OperationObservation): OperationStatus {
  switch (state) {
    case 'idle':
    case 'pending':
    case 'failed':
    case 'cancelled':
      return state;
    case 'working':
      return active ? 'working' : 'unknown';
    case 'succeeded':
      if (
        operationKey.length > 0 &&
        receipt?.operationKey === operationKey &&
        receipt.persisted &&
        receipt.state === 'succeeded'
      ) {
        return 'succeeded';
      }
      return active ? 'pending' : 'unknown';
    default:
      return 'unknown';
  }
}
