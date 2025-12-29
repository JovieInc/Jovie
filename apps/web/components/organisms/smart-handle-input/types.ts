export interface SmartHandleInputProps {
  value: string;
  onChange: (value: string) => void;
  onValidationChange?: (validation: HandleValidationState) => void;
  placeholder?: string;
  prefix?: string;
  showAvailability?: boolean;
  formatHints?: boolean;
  disabled?: boolean;
  artistName?: string;
  className?: string;
}

export interface HandleValidationState {
  available: boolean;
  checking: boolean;
  error: string | null;
  clientValid: boolean;
  suggestions: string[];
}
