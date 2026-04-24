'use client';

import { Popover, PopoverContent, PopoverTrigger } from '@jovie/ui';
import { Check, ChevronDown } from 'lucide-react';
import { memo, useCallback } from 'react';

export interface CountryOption {
  code: string;
  dialCode: string;
  flag: string;
  label: string;
}

const FONT_SYNTHESIS_STYLE = { fontSynthesisWeight: 'none' } as const;

// Countries supported by Twilio SMS (sorted by usage/popularity)
export const COUNTRY_OPTIONS: CountryOption[] = [
  // North America
  { code: 'US', dialCode: '+1', flag: '🇺🇸', label: 'United States' },
  { code: 'CA', dialCode: '+1', flag: '🇨🇦', label: 'Canada' },
  { code: 'MX', dialCode: '+52', flag: '🇲🇽', label: 'Mexico' },
  // Europe
  { code: 'GB', dialCode: '+44', flag: '🇬🇧', label: 'United Kingdom' },
  { code: 'DE', dialCode: '+49', flag: '🇩🇪', label: 'Germany' },
  { code: 'FR', dialCode: '+33', flag: '🇫🇷', label: 'France' },
  { code: 'ES', dialCode: '+34', flag: '🇪🇸', label: 'Spain' },
  { code: 'IT', dialCode: '+39', flag: '🇮🇹', label: 'Italy' },
  { code: 'NL', dialCode: '+31', flag: '🇳🇱', label: 'Netherlands' },
  { code: 'BE', dialCode: '+32', flag: '🇧🇪', label: 'Belgium' },
  { code: 'CH', dialCode: '+41', flag: '🇨🇭', label: 'Switzerland' },
  { code: 'AT', dialCode: '+43', flag: '🇦🇹', label: 'Austria' },
  { code: 'SE', dialCode: '+46', flag: '🇸🇪', label: 'Sweden' },
  { code: 'NO', dialCode: '+47', flag: '🇳🇴', label: 'Norway' },
  { code: 'DK', dialCode: '+45', flag: '🇩🇰', label: 'Denmark' },
  { code: 'FI', dialCode: '+358', flag: '🇫🇮', label: 'Finland' },
  { code: 'IE', dialCode: '+353', flag: '🇮🇪', label: 'Ireland' },
  { code: 'PT', dialCode: '+351', flag: '🇵🇹', label: 'Portugal' },
  { code: 'PL', dialCode: '+48', flag: '🇵🇱', label: 'Poland' },
  { code: 'CZ', dialCode: '+420', flag: '🇨🇿', label: 'Czech Republic' },
  { code: 'GR', dialCode: '+30', flag: '🇬🇷', label: 'Greece' },
  { code: 'RO', dialCode: '+40', flag: '🇷🇴', label: 'Romania' },
  { code: 'HU', dialCode: '+36', flag: '🇭🇺', label: 'Hungary' },
  // Asia Pacific
  { code: 'AU', dialCode: '+61', flag: '🇦🇺', label: 'Australia' },
  { code: 'NZ', dialCode: '+64', flag: '🇳🇿', label: 'New Zealand' },
  { code: 'JP', dialCode: '+81', flag: '🇯🇵', label: 'Japan' },
  { code: 'KR', dialCode: '+82', flag: '🇰🇷', label: 'South Korea' },
  { code: 'SG', dialCode: '+65', flag: '🇸🇬', label: 'Singapore' },
  { code: 'HK', dialCode: '+852', flag: '🇭🇰', label: 'Hong Kong' },
  { code: 'TW', dialCode: '+886', flag: '🇹🇼', label: 'Taiwan' },
  { code: 'MY', dialCode: '+60', flag: '🇲🇾', label: 'Malaysia' },
  { code: 'PH', dialCode: '+63', flag: '🇵🇭', label: 'Philippines' },
  { code: 'TH', dialCode: '+66', flag: '🇹🇭', label: 'Thailand' },
  { code: 'ID', dialCode: '+62', flag: '🇮🇩', label: 'Indonesia' },
  { code: 'VN', dialCode: '+84', flag: '🇻🇳', label: 'Vietnam' },
  { code: 'IN', dialCode: '+91', flag: '🇮🇳', label: 'India' },
  { code: 'PK', dialCode: '+92', flag: '🇵🇰', label: 'Pakistan' },
  // Middle East
  { code: 'IL', dialCode: '+972', flag: '🇮🇱', label: 'Israel' },
  { code: 'AE', dialCode: '+971', flag: '🇦🇪', label: 'United Arab Emirates' },
  { code: 'SA', dialCode: '+966', flag: '🇸🇦', label: 'Saudi Arabia' },
  // South America
  { code: 'BR', dialCode: '+55', flag: '🇧🇷', label: 'Brazil' },
  { code: 'AR', dialCode: '+54', flag: '🇦🇷', label: 'Argentina' },
  { code: 'CL', dialCode: '+56', flag: '🇨🇱', label: 'Chile' },
  { code: 'CO', dialCode: '+57', flag: '🇨🇴', label: 'Colombia' },
  { code: 'PE', dialCode: '+51', flag: '🇵🇪', label: 'Peru' },
  // Africa
  { code: 'ZA', dialCode: '+27', flag: '🇿🇦', label: 'South Africa' },
  { code: 'NG', dialCode: '+234', flag: '🇳🇬', label: 'Nigeria' },
  { code: 'KE', dialCode: '+254', flag: '🇰🇪', label: 'Kenya' },
  { code: 'EG', dialCode: '+20', flag: '🇪🇬', label: 'Egypt' },
];

interface CountryOptionButtonProps {
  readonly option: CountryOption;
  readonly isSelected: boolean;
  readonly onSelect: (option: CountryOption) => void;
}

const CountryOptionButton = memo(function CountryOptionButton({
  option,
  isSelected,
  onSelect,
}: CountryOptionButtonProps) {
  const handleClick = useCallback(() => {
    onSelect(option);
  }, [onSelect, option]);

  return (
    <button
      type='button'
      onClick={handleClick}
      className={`flex w-full items-center gap-3 rounded-[var(--radius-2xl)] px-3 py-2 text-[13px] font-semibold leading-[20px] tracking-[-0.01em] transition-colors duration-normal ease-out ${
        isSelected
          ? 'border border-[color:var(--profile-pearl-border)] bg-[var(--profile-pearl-bg-active)] text-primary-token'
          : 'text-primary-token hover:bg-[var(--profile-pearl-bg)]'
      }`}
      style={FONT_SYNTHESIS_STYLE}
    >
      <span className='text-base'>{option.flag}</span>
      <span className='flex-1 text-left'>{option.label}</span>
      <span className='text-tertiary-token'>{option.dialCode}</span>
      {isSelected && <Check className='w-4 h-4 text-primary-token' />}
    </button>
  );
});

interface CountrySelectorProps {
  readonly country: CountryOption;
  readonly isOpen: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly onSelect: (country: CountryOption) => void;
}

export function CountrySelector({
  country,
  isOpen,
  onOpenChange,
  onSelect,
}: CountrySelectorProps) {
  const handleSelect = useCallback(
    (option: CountryOption) => {
      onSelect(option);
      onOpenChange(false);
    },
    [onSelect, onOpenChange]
  );

  return (
    <Popover open={isOpen} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        <button
          type='button'
          className='flex h-12 items-center gap-1.5 rounded-full px-3 text-mid font-semibold tracking-[-0.015em] text-primary-token transition-colors hover:text-primary-token focus-visible:outline-none'
          style={FONT_SYNTHESIS_STYLE}
          aria-label='Select country code'
        >
          <span>{country.flag}</span>
          <span>{country.dialCode}</span>
          <ChevronDown className='w-3.5 h-3.5 text-tertiary-token' />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align='start'
        sideOffset={6}
        className='w-64 rounded-[var(--radius-3xl)] border border-[color:var(--profile-panel-border)] bg-[var(--profile-drawer-bg)] p-2 shadow-[var(--profile-panel-shadow)] backdrop-blur-2xl'
      >
        <div className='max-h-64 overflow-y-auto'>
          {COUNTRY_OPTIONS.map(option => (
            <CountryOptionButton
              key={option.code}
              option={option}
              isSelected={country.code === option.code}
              onSelect={handleSelect}
            />
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
