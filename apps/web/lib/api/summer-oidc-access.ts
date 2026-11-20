import 'server-only';

import { verifySummerOidcRequest } from '@/lib/ovie/summer-oidc.server';
import type { AccessPolicy } from './route-pipeline';

/**
 * Summer's production Vercel OIDC token (401 `unauthorized` otherwise), for
 * the internal routes Summer and agents read.
 */
export function summerOidcAccess(): AccessPolicy<null> {
  return {
    name: 'summer-oidc',
    async authorize(request) {
      return (await verifySummerOidcRequest(request))
        ? { ok: true, auth: null }
        : { ok: false, status: 401, body: { error: 'unauthorized' } };
    },
  };
}
