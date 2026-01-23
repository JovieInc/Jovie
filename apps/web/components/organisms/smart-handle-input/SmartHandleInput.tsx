'use client';

import { useCallback, useEffect, useId, useMemo } from 'react';
import { Input } from '@/components/atoms/Input';
import {
  generateUsernameSuggestions,
  validateUsernameFormat,
} from '@/lib/validation/client-username';
import { FormatHints } from './FormatHints';
import { getStatusMessage } from './getStatusMessage';
import { HandleSuggestions } from './HandleSuggestions';
import type { SmartHandleInputProps } from './types';
import { useHandleApiValidation } from './useHandleApiValidation';
import { ValidationStatusIcon } from './ValidationStatusIcon';

export function SmartHandleInput({
  value,
  onChange,
  onValidationChange,
  placeholder = 'yourname',
  prefix = 'jovie.link/',
  showAvailability = true,
  formatHints = true,
  disabled = false,
  artistName,
  className = '',
}: SmartHandleInputProps) {
  const inputId = useId();
  const statusId = useId();
  const previewId = useId();

  // Instant client-side validation
  const validateClientSide = useCallback(
    (handleValue: string) => validateUsernameFormat(handleValue),
    []
  );

  const clientValidation = useMemo(
    () => validateClientSide(value),
    [value, validateClientSide]
  );

  // Memoized username suggestions
  const usernameSuggestions = useMemo(() => {
    if (clientValidation.valid || !value) return [];
    return generateUsernameSuggestions(value, artistName);
  }, [value, artistName, clientValidation.valid]);

  // API validation with debouncing
  const handleValidation = useHandleApiValidation({
    value,
    clientValidation,
    usernameSuggestions,
    showAvailability,
  });

  // Notify parent of validation changes
  useEffect(() => {
    onValidationChange?.(handleValidation);
  }, [handleValidation, onValidationChange]);

  const statusMessage = getStatusMessage({
    handleValidation,
    clientValidation,
    value,
  });

  // Compute validation state for input
  const getValidationState = (): 'invalid' | 'valid' | 'pending' | null => {
    if (!value) return null;
    if (handleValidation.error || clientValidation.error) return 'invalid';
    if (handleValidation.available && clientValidation.valid) return 'valid';
    if (handleValidation.checking) return 'pending';
    return null;
  };

  // Compute status message class
  const getStatusClass = (): string => {
    if (!statusMessage) return 'opacity-0';
    if (handleValidation.available && clientValidation.valid) {
      return 'text-(--accent-speed) opacity-100';
    }
    return 'text-destructive opacity-100';
  };

  return (
    <div className={`space-y-2 ${className}`}>
      {/* Input with prefix and validation icon */}
      <div className='relative'>
        <div className='absolute left-3 top-1/2 -translate-y-1/2 z-10 text-sm font-sans text-secondary-token'>
          {prefix}
        </div>
        <Input
          type='text'
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder}
          disabled={disabled}
          className='font-sans pl-20'
          inputClassName='font-sans'
          id={inputId}
          validationState={getValidationState()}
          statusIcon={
            <ValidationStatusIcon
              showAvailability={showAvailability}
              checking={handleValidation.checking}
              available={handleValidation.available}
              clientValid={clientValidation.valid}
              hasError={!!handleValidation.error}
            />
          }
          aria-describedby={`${statusId} ${previewId}`}
          aria-label='Enter your desired handle'
          autoCapitalize='none'
          autoCorrect='off'
          autoComplete='off'
          inputMode='text'
        />
      </div>

      {/* Live preview */}
      <div className='text-xs text-secondary-token' id={previewId}>
        Your profile will be live at{' '}
        <span className='font-sans text-primary-token'>
          {prefix}
          {value || placeholder}
        </span>
      </div>

      {/* Status message */}
      {/* NOSONAR S6819: role="status" is correct for validation feedback; <output> is for form results */}
      <div
        className={`text-xs min-h-5 transition-all duration-300 ${getStatusClass()}`}
        id={statusId}
        role='status'
        aria-live='polite'
      >
        {statusMessage || '\u00A0'}
      </div>

      {/* Username suggestions */}
      {formatHints && (
        <HandleSuggestions
          suggestions={handleValidation.suggestions}
          disabled={disabled}
          onChange={onChange}
        />
      )}

      {/* Format hints */}
      {formatHints && !value && <FormatHints />}
    </div>
  );
}
