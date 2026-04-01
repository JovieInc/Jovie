export interface ClaimHandleFormProps {
  readonly onHandleChange?: (handle: string) => void;
  readonly size?: 'default' | 'hero' | 'display';
  readonly submitButtonTestId?: string;
  readonly hideHelperText?: boolean;
  readonly submitTracking?: {
    readonly eventName: 'landing_cta_claim_handle';
    readonly section: 'final_cta';
  };
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
