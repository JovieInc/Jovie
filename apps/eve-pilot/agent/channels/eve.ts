import { timingSafeEqual } from 'node:crypto';
import {
  type AuthFn,
  localDev,
  vercelOidc,
  withAuthChallenges,
} from 'eve/channels/auth';
import { eveChannel } from 'eve/channels/eve';

const BEARER_PREFIX = 'Bearer ';

function matchesToken(actual: string, expected: string): boolean {
  const actualBytes = new TextEncoder().encode(actual);
  const expectedBytes = new TextEncoder().encode(expected);
  if (actualBytes.byteLength !== expectedBytes.byteLength) return false;
  return timingSafeEqual(actualBytes, expectedBytes);
}

/** Authenticates the Jovie web app's server-to-server shadow bridge. */
export const jovieCoreChatAuth: AuthFn<Request> = withAuthChallenges(
  request => {
    const expectedToken = process.env.EVE_CORE_CHAT_AUTH_TOKEN?.trim();
    const authorization = request.headers.get('authorization');
    if (
      !expectedToken ||
      !authorization?.startsWith(BEARER_PREFIX) ||
      !matchesToken(authorization.slice(BEARER_PREFIX.length), expectedToken)
    ) {
      return null;
    }

    return {
      attributes: {
        readOnly: 'true',
        source: 'jovie-core-chat',
      },
      authenticator: 'jovie-core-chat-token',
      issuer: 'jovie',
      principalId: 'jovie-core-chat',
      principalType: 'app',
    };
  },
  [{ scheme: 'Bearer' }]
);

export default eveChannel({
  // The shared token is for Jovie's server-to-server shadow bridge. Vercel
  // OIDC remains available for platform callers, and localDev keeps local
  // loopback development usable without a token.
  auth: [jovieCoreChatAuth, vercelOidc(), localDev()],
});
