import { oauthProviderAuthServerMetadata } from '@better-auth/oauth-provider';
import { auth } from '@/lib/auth/better-auth';

/** OAuth 2.1 discovery at the issuer root, outside Better Auth's base path. */
export const GET = oauthProviderAuthServerMetadata(auth);
