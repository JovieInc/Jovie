export const OTP_LENGTH = 6;

export interface OtpInputProps {
  /**
   * Current value of the OTP
   */
  readonly value?: string;
  /**
   * Called when the OTP value changes
   */
  readonly onChange?: (value: string) => void;
  /**
   * Called when all digits are entered
   */
  readonly onComplete?: (value: string) => void;
  /**
   * Whether to focus the first digit on mount
   * @default true
   */
  readonly autoFocus?: boolean;
  /**
   * Accessible label for the OTP input
   */
  readonly 'aria-label'?: string;
  /**
   * Whether the input is disabled
   */
  readonly disabled?: boolean;
  /**
   * Error state
   */
  readonly error?: boolean;
  /**
   * Error message ID for aria-describedby association
   */
  readonly errorId?: string;
}
