import 'server-only';

import {
  createHash,
  createPrivateKey,
  createPublicKey,
  sign,
  timingSafeEqual,
} from 'node:crypto';
import { env } from '@/lib/env-server';

const KEY_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{2,63}$/u;
const DOMAIN = 'jovie.eve.summer-conversation/v1';

export type FounderSummerAuthorization =
  | 'authorized'
  | 'forbidden'
  | 'unconfigured';

export function authorizeFounderSummerUser(
  userId: string | null
): FounderSummerAuthorization {
  const founderUserId = env.OVIE_SUMMER_FOUNDER_APP_USER_ID?.trim();
  if (!founderUserId) return 'unconfigured';
  return userId === founderUserId ? 'authorized' : 'forbidden';
}

export function founderPrincipalHash(userId: string): string {
  return createHash('sha256').update(userId).digest('base64url');
}

export function summerConversationAttestation(
  rawBody: string
): Record<string, string> | null {
  const privateKeyRaw = env.SUMMER_CONVERSATION_SIGNING_PRIVATE_KEY?.trim();
  const keyId = env.SUMMER_CONVERSATION_SIGNING_KEY_ID?.trim();
  if (!privateKeyRaw || !keyId || !KEY_ID.test(keyId)) return null;
  try {
    const privateKey = createPrivateKey(
      privateKeyRaw.includes('\\n')
        ? privateKeyRaw.replaceAll('\\n', '\n')
        : privateKeyRaw
    );
    if (privateKey.asymmetricKeyType !== 'ed25519') return null;
    const bottleneckRaw =
      env.SUMMER_BOTTLENECK_PRODUCER_SIGNING_PRIVATE_KEY?.trim();
    if (bottleneckRaw) {
      const bottleneckKey = createPrivateKey(
        bottleneckRaw.includes('\\n')
          ? bottleneckRaw.replaceAll('\\n', '\n')
          : bottleneckRaw
      );
      const publicDer = (key: Parameters<typeof createPublicKey>[0]) =>
        createPublicKey(key).export({ type: 'spki', format: 'der' }) as Buffer;
      if (timingSafeEqual(publicDer(privateKey), publicDer(bottleneckKey)))
        return null;
    }
    const signature = sign(
      null,
      Buffer.from(`${DOMAIN}\0${rawBody}`),
      privateKey
    ).toString('base64url');
    return {
      'x-jovie-summer-key-id': keyId,
      'x-jovie-summer-signature': `ed25519=${signature}`,
    };
  } catch {
    return null;
  }
}
