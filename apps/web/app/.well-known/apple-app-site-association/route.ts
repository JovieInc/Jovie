import { createAppleAppSiteAssociationResponse } from '@/lib/ios/apple-app-site-association';

export function GET() {
  return createAppleAppSiteAssociationResponse();
}