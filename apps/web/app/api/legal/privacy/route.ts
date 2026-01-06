import { createLegalDocumentRoute } from '@/lib/legal/route-factory';

// API routes should be dynamic
export const dynamic = 'force-dynamic';

export const GET = createLegalDocumentRoute(
  'privacy.md',
  'Failed to load privacy policy.'
);
