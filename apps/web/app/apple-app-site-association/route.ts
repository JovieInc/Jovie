import { createAppleAppSiteAssociationResponse } from '@/lib/ios/apple-app-site-association';

export const revalidate = false;
export const dynamic = 'force-static';

export function GET() {
  return createAppleAppSiteAssociationResponse();
}