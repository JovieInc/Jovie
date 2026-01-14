/**
 * Validation utilities for onboarding submission.
 *
 * Extracts validation logic to reduce cognitive complexity.
 */

import { normalizeString } from '@/lib/utils/string-utils';
import type { HandleValidationState } from './types';

export interface OnboardingFormData {
  handle: string;
  handleInput: string;
  handleValidation: HandleValidationState;
  isSubmitting: boolean;
  hasError: boolean;
}

/**
 * Validates if onboarding form can be submitted.
 *
 * @param data - Form data to validate
 * @returns True if form can be submitted
 */
export function canSubmitOnboarding(data: OnboardingFormData): boolean {
  const { handle, handleInput, handleValidation, isSubmitting, hasError } =
    data;

  const resolvedHandle = normalizeString(handle || handleInput);

  if (!resolvedHandle) return false;
  if (isSubmitting) return false;
  if (hasError) return false;
  if (!handleValidation.clientValid) return false;
  if (handleValidation.checking) return false;
  if (!handleValidation.available) return false;

  return true;
}

/**
 * Validates display name field.
 *
 * @param fullName - Display name to validate
 * @throws Error if display name is invalid
 */
export function validateDisplayName(fullName: string): void {
  const trimmedName = fullName.trim();
  if (!trimmedName) {
    throw new Error('[DISPLAY_NAME_REQUIRED] Display name is required');
  }
}

/**
 * Gets the resolved handle from form inputs.
 *
 * @param handle - Primary handle value
 * @param handleInput - Fallback handle input
 * @returns Normalized handle string
 */
export function getResolvedHandle(handle: string, handleInput: string): string {
  return normalizeString(handle || handleInput);
}
