import { apiKey } from '@better-auth/api-key';

/** Provider owns hashing, expiry, session-bound mint/list/delete and revocation. */
export function agentApiKeyPlugin() {
  return apiKey({
    defaultPrefix: 'jovie_',
    requireName: true,
    maximumNameLength: 80,
    enableSessionForAPIKeys: false,
    keyExpiration: { defaultExpiresIn: 90 * 24 * 60 * 60 },
    // Product writes use a durable per-account limiter, shared by all its keys.
    rateLimit: { enabled: false },
  });
}
