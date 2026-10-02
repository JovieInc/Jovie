import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import {
  ovieOAuthHandoffCookie,
  ovieOAuthRecoveryPurpose,
  readOvieOAuthHandoff,
} from '@/lib/ovie/mcp/authorization-request';
import { ovieFounderLoginLocation } from '@/lib/ovie/mcp/oauth';
import { requireOvieApiAccess } from '@/lib/ovie/privacy-lock/access';
import { OvieConnectVerification } from './OvieConnectVerification';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = {
  title: 'Connect Ovie',
  robots: { index: false, follow: false },
  referrer: 'no-referrer',
};

export default async function OvieConnectPage({
  searchParams,
}: {
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const nonce = typeof params.handoff === 'string' ? params.handoff : '';
  const cookieName = ovieOAuthHandoffCookie(nonce);
  const authorization =
    Object.keys(params).length === 1 && cookieName
      ? readOvieOAuthHandoff(nonce, (await cookies()).get(cookieName)?.value)
      : null;
  const authorizePath = `/api/ovie/oauth/authorize?handoff=${nonce}`;
  if (!authorization) {
    return (
      <p role='alert'>
        This connection request is invalid. Restart the Ovie reconnect.
      </p>
    );
  }
  const denied = await requireOvieApiAccess({ privileged: true });
  if (!denied) redirect(authorizePath);
  if (denied.status === 401 || denied.status === 403) {
    const purpose = await ovieOAuthRecoveryPurpose(denied);
    if (purpose) {
      return (
        <OvieConnectVerification
          authorizePath={authorizePath}
          purpose={purpose}
        />
      );
    }
    const { code } = (await denied.clone().json()) as { code?: string };
    if (code === 'UNAUTHORIZED' || code === 'FORBIDDEN') {
      redirect(ovieFounderLoginLocation(authorizePath, code === 'FORBIDDEN'));
    }
  }
  return (
    <p role='alert'>
      Ovie verification is unavailable. Try reconnecting again.
    </p>
  );
}
