import { NextRequest } from 'next/server';
import { updateSubscriberBirthdaySchema } from '@/lib/validation/schemas/notifications';
import { handleSubscriberFieldUpdate } from '../update-subscriber-field';

export const runtime = 'nodejs';

export async function PATCH(request: NextRequest) {
  return handleSubscriberFieldUpdate(request, {
    schema: updateSubscriberBirthdaySchema,
    fieldName: 'birthday',
    extractField: data => ({ birthday: data.birthday }),
    logPrefix: 'Update Birthday',
    route: '/api/notifications/update-birthday',
    errorMessage: 'Subscriber birthday update failed',
  });
}
