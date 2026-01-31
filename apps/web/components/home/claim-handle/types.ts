export interface ClaimHandleFormProps {
  readonly onHandleChange?: (handle: string) => void;
}

export interface HandleAvailabilityState {
  checkingAvail: boolean;
  available: boolean | null;
  availError: string | null;
}

export type HelperTone = 'idle' | 'pending' | 'success' | 'error';

export interface HelperState {
  tone: HelperTone;
  text: string;
}
