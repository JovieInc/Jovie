'use client';

import { Mail, Phone } from 'lucide-react';
import { useId } from 'react';
import { CountrySelector } from '@/components/profile/molecules/CountrySelector';
import type { CountryOption } from '@/lib/notifications/countries';
import { formatPhoneDigitsForDisplay } from '@/lib/notifications/countries';
import type { NotificationChannel } from '@/types/notifications';

export interface NotificationChannelInputProps {
  channel: NotificationChannel;
  country: CountryOption;
  phoneInput: string;
  emailInput: string;
  isCountryOpen: boolean;
  isSubmitting: boolean;
  inputRef: React.RefObject<HTMLInputElement>;
  onChannelChange: (channel: NotificationChannel) => void;
  onCountryChange: (country: CountryOption) => void;
  onCountryOpenChange: (open: boolean) => void;
  onPhoneChange: (value: string) => void;
  onEmailChange: (value: string) => void;
  onBlur: () => void;
  onKeyDown: React.KeyboardEventHandler<HTMLInputElement>;
}

export function NotificationChannelInput({
  channel,
  country,
  phoneInput,
  emailInput,
  isCountryOpen,
  isSubmitting,
  inputRef,
  onChannelChange,
  onCountryChange,
  onCountryOpenChange,
  onPhoneChange,
  onEmailChange,
  onBlur,
  onKeyDown,
}: NotificationChannelInputProps) {
  const inputId = useId();
  const shouldShowCountrySelector = channel === 'sms' && phoneInput.length > 0;

  return (
    <div className='rounded-2xl bg-surface-0 backdrop-blur-md ring-1 ring-(--color-border-subtle) shadow-sm focus-within:ring-2 focus-within:ring-[rgb(var(--focus-ring))] transition-[box-shadow,ring] overflow-hidden'>
      <div className='flex items-center'>
        {/* Country selector for phone */}
        {channel === 'sms' ? (
          shouldShowCountrySelector ? (
            <CountrySelector
              country={country}
              isOpen={isCountryOpen}
              onOpenChange={onCountryOpenChange}
              onSelect={onCountryChange}
            />
          ) : (
            <button
              type='button'
              className='h-12 pl-4 pr-3 flex items-center bg-transparent text-muted-foreground hover:bg-surface-2 transition-colors focus:outline-none'
              aria-label='Switch to email updates'
              onClick={() => onChannelChange('email')}
              disabled={isSubmitting}
            >
              <Mail className='w-4 h-4' aria-hidden='true' />
            </button>
          )
        ) : (
          <button
            type='button'
            className='h-12 pl-4 pr-3 flex items-center bg-transparent text-muted-foreground hover:bg-surface-2 transition-colors focus:outline-none'
            aria-label='Switch to text updates'
            onClick={() => onChannelChange('sms')}
            disabled={isSubmitting}
          >
            <Phone className='w-4 h-4' aria-hidden='true' />
          </button>
        )}

        {/* Input field */}
        <div className='flex-1 min-w-0'>
          <label htmlFor={inputId} className='sr-only'>
            {channel === 'sms' ? 'Phone number' : 'Email address'}
          </label>
          <input
            ref={inputRef}
            id={inputId}
            type={channel === 'sms' ? 'tel' : 'email'}
            inputMode={channel === 'sms' ? 'numeric' : 'email'}
            className='w-full h-12 px-4 bg-transparent text-[15px] text-foreground placeholder:text-muted-foreground placeholder:opacity-80 border-none focus:outline-none focus:ring-0'
            placeholder={
              channel === 'sms' ? '(555) 123-4567' : 'your@email.com'
            }
            value={
              channel === 'sms'
                ? formatPhoneDigitsForDisplay(phoneInput, country.dialCode)
                : emailInput
            }
            onChange={event => {
              if (channel === 'sms') {
                onPhoneChange(event.target.value);
              } else {
                onEmailChange(event.target.value);
              }
            }}
            onBlur={onBlur}
            onKeyDown={onKeyDown}
            disabled={isSubmitting}
            autoComplete={channel === 'sms' ? 'tel-national' : 'email'}
            maxLength={channel === 'sms' ? 32 : 254}
            style={{ fontSynthesisWeight: 'none' }}
          />
        </div>
      </div>
    </div>
  );
}
