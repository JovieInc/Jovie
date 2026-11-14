import { NextResponse } from 'next/server';
import { type AccessPolicy, defineRoute } from '@/lib/api/route-pipeline';
import { founderWelcomeJob } from '@/lib/founder-welcome/server';
import { verifySummerOidcRequest } from '@/lib/ovie/summer-oidc.server';

export const runtime = 'nodejs';

/** Same caller as the recovery-emails trigger: the production Summer project. */
const summerAccess: AccessPolicy<null> = {
  name: 'summer-oidc',
  async authorize(request) {
    return (await verifySummerOidcRequest(request))
      ? { ok: true, auth: null }
      : { ok: false, status: 401, body: { error: 'unauthorized' } };
  },
};

/**
 * Runs the founder welcome pipeline once: files one approval card per newly
 * admitted /start visitor and sends only where that person's own card is
 * approved. Counts only: no addresses, names or ids.
 */
export const POST = defineRoute(
  { route: '/api/internal/ovie/founder-welcome', access: summerAccess },
  async () => {
    const result = await founderWelcomeJob();
    return NextResponse.json({ contract: 'founder-welcome/v1', result });
  }
);
