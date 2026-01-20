import { createLegalDocumentRoute } from '@/lib/legal/route-factory';

// Static with hourly revalidation - legal content rarely changes
export const revalidate = 3600;

export const GET = createLegalDocumentRoute(
  'terms.md',
  'Failed to load terms of service.'
);
