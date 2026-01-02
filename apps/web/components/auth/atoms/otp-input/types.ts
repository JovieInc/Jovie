export const OTP_LENGTH = 6;

export interface OtpInputProps {
  /**
   * Current value of the OTP
   */
  value?: string;
  /**
   * Called when the OTP value changes
   */
  onChange?: (value: string) => void;
  /**
   * Called when all digits are entered
   */
  onComplete?: (value: string) => void;
  /**
   * Whether to focus the first digit on mount
   * @default true
   */
  autoFocus?: boolean;
  /**
   * Accessible label for the OTP input
   */
  'aria-label'?: string;
  /**
   * Whether the input is disabled
   */
  disabled?: boolean;
  /**
   * Error state
   */
  error?: boolean;
  /**
   * Error message ID for aria-describedby association
   */
  errorId?: string;
}
