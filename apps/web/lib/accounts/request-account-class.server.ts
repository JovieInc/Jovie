import 'server-only';

import { headers } from 'next/headers';
import { ACCOUNT_CLASS_HEADER } from './internal-account';

/**
 * The harness header on the current request, or null outside a request scope
 * (cron, scripts, tests). Setting it can only hide the sender's own new
 * account from company metrics, so it needs no secret.
 */
export async function readRequestAccountClassHeader(): Promise<string | null> {
  try {
    return (await headers()).get(ACCOUNT_CLASS_HEADER);
  } catch {
    return null;
  }
}
