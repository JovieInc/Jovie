export interface SmartHandleInputProps {
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly onValidationChange?: (validation: HandleValidationState) => void;
  readonly placeholder?: string;
  readonly prefix?: string;
  readonly showAvailability?: boolean;
  readonly formatHints?: boolean;
  readonly disabled?: boolean;
  readonly artistName?: string;
  readonly className?: string;
}

export interface HandleValidationState {
  available: boolean;
  checking: boolean;
  error: string | null;
  clientValid: boolean;
  suggestions: string[];
}
