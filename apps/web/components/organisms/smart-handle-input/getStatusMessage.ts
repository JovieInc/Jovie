import type { ClientValidationResult } from '@/lib/validation/client-username';
import type { HandleValidationState } from './types';

interface GetStatusMessageProps {
  readonly handleValidation: HandleValidationState;
  readonly clientValidation: ClientValidationResult;
  readonly value: string;
}

export function getStatusMessage({
  handleValidation,
  clientValidation,
  value,
}: GetStatusMessageProps): string | null {
  if (handleValidation.checking) {
    return 'Checking availability...';
  }
  if (handleValidation.available && clientValidation.valid) {
    return `@${value} is available!`;
  }
  if (handleValidation.error) {
    return handleValidation.error;
  }
  if (clientValidation.error) {
    return clientValidation.error;
  }
  return null;
}
