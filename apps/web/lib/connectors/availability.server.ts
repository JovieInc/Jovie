import 'server-only';

import { env } from '@/lib/env-server';
import { getConnectorDefinitions } from './registry';
import type { ConnectorAvailability, ConnectorProviderId } from './types';

/** Only booleans and user copy cross the server boundary; never credentials. */
export function getConnectorAvailability(): Record<
  ConnectorProviderId,
  ConnectorAvailability
> {
  const configured = {
    google: Boolean(
      env.GOOGLE_OAUTH_CLIENT_ID && env.GOOGLE_OAUTH_CLIENT_SECRET
    ),
    youtube: Boolean(
      env.GOOGLE_OAUTH_CLIENT_ID && env.GOOGLE_OAUTH_CLIENT_SECRET
    ),
    spotify: Boolean(env.SPOTIFY_CLIENT_ID && env.SPOTIFY_CLIENT_SECRET),
  };
  return Object.fromEntries(
    getConnectorDefinitions().map(definition => [
      definition.id,
      {
        available: configured[definition.oauthBundle],
        reason: configured[definition.oauthBundle]
          ? undefined
          : 'Connection setup is unavailable. Try again later.',
      },
    ])
  ) as Record<ConnectorProviderId, ConnectorAvailability>;
}
