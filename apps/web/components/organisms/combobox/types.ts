export interface ComboboxOption {
  id: string;
  name: string;
  imageUrl?: string;
}

export interface ComboboxProps {
  readonly options: ComboboxOption[];
  readonly value: ComboboxOption | null;
  readonly onChange: (option: ComboboxOption | null) => void;
  readonly onInputChange: (value: string) => void;
  readonly onSubmit?: () => void;
  readonly placeholder?: string;
  readonly label?: string;
  readonly className?: string;
  readonly disabled?: boolean;
  readonly maxDisplayedOptions?: number;
  readonly isLoading?: boolean;
  readonly error?: string | null;
  readonly ctaText?: string;
  readonly showCta?: boolean;
}
