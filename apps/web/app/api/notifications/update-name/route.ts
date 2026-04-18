import { NextRequest } from 'next/server';
import { updateSubscriberNameSchema } from '@/lib/validation/schemas/notifications';
import { handleSubscriberFieldUpdate } from '../update-subscriber-field';

export const runtime = 'nodejs';

/**
 * Strip HTML tags from a string to prevent stored XSS.
 */
function stripHtmlTags(input: string): string {
  let result = '';
  let inTag = false;

  for (const char of input) {
    if (char === '<') {
      inTag = true;
      continue;
    }

    if (char === '>') {
      inTag = false;
      continue;
    }

    if (!inTag) {
      result += char;
    }
  }

  return result;
}

export async function PATCH(request: NextRequest) {
  return handleSubscriberFieldUpdate(request, {
    schema: updateSubscriberNameSchema,
    fieldName: 'name',
    extractField: data => ({ name: data.name }),
    sanitize: value => stripHtmlTags(value).trim() || null,
    logPrefix: 'Update Name',
    route: '/api/notifications/update-name',
    errorMessage: 'Subscriber name update failed',
  });
}
