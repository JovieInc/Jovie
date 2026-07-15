import { oauthProviderOpenIdConfigMetadata } from '@better-auth/oauth-provider';
import { auth } from '@/lib/auth/better-auth';

/** OpenID Connect discovery at the issuer root for public OAuth clients. */
export const GET = oauthProviderOpenIdConfigMetadata(auth);
