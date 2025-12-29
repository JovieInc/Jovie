export interface ComboboxOption {
  id: string;
  name: string;
  imageUrl?: string;
}

export interface ComboboxProps {
  options: ComboboxOption[];
  value: ComboboxOption | null;
  onChange: (option: ComboboxOption | null) => void;
  onInputChange: (value: string) => void;
  onSubmit?: () => void;
  placeholder?: string;
  label?: string;
  className?: string;
  disabled?: boolean;
  maxDisplayedOptions?: number;
  isLoading?: boolean;
  error?: string | null;
  ctaText?: string;
  showCta?: boolean;
}
