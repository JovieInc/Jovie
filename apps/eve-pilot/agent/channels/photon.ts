import {
  type PhotonInboundMessageContext,
  type PhotonInboundResult,
  photonIMessageChannel,
} from 'eve/channels/photon';

import { admitOvieIMessage } from '../lib/imessage-allowlist';
import { bindEvePilotIdentity } from '../select-identity';

type PhotonAuthor = {
  readonly handle?: string;
  readonly id?: string;
  readonly isBot?: boolean;
  readonly phone?: string;
};

function authorFrom(message: unknown): PhotonAuthor | undefined {
  if (!message || typeof message !== 'object') return undefined;
  const record = message as { author?: PhotonAuthor };
  return record.author;
}

/**
 * Eve's photon adapter falls back to Vercel OIDC when webhookSecret is
 * missing/empty. That path 500s unsigned POST. HMAC 401 is the contract.
 */
export const PHOTON_WEBHOOK_SECRET_UNCONFIGURED =
  'imessage-webhook-secret-unconfigured';
export const PHOTON_PROJECT_ID_UNCONFIGURED = 'imessage-project-id-unconfigured';
export const PHOTON_PROJECT_SECRET_UNCONFIGURED =
  'imessage-project-secret-unconfigured';

export function photonWebhookSecret(
  environment: Readonly<Record<string, string | undefined>> = process.env
): string {
  return (
    environment.IMESSAGE_WEBHOOK_SECRET?.trim() ||
    PHOTON_WEBHOOK_SECRET_UNCONFIGURED
  );
}

export function photonCredentials(
  environment: Readonly<Record<string, string | undefined>> = process.env
): { readonly projectId: string; readonly projectSecret: string } {
  const projectId = environment.IMESSAGE_PROJECT_ID?.trim();
  const projectSecret = environment.IMESSAGE_PROJECT_SECRET?.trim();
  if (!projectId || !projectSecret) {
    // Adapter init runs before HMAC. Throwing here 500s unsigned POST.
    return {
      projectId: PHOTON_PROJECT_ID_UNCONFIGURED,
      projectSecret: PHOTON_PROJECT_SECRET_UNCONFIGURED,
    };
  }
  return { projectId, projectSecret };
}

/**
 * iMessage is Summer's live talk channel on this Eve app.
 * Credentials are portable Photon env vars, not Vercel Connect.
 */
export function onSummerIMessage(
  _ctx: PhotonInboundMessageContext,
  message: unknown
): PhotonInboundResult {
  if (!admitOvieIMessage(authorFrom(message))) return null;
  const turn = bindEvePilotIdentity('summer');
  return {
    auth: {
      attributes: {
        fallback: 'true',
        identity: 'summer',
        source: 'imessage',
      },
      authenticator: 'photon-imessage',
      issuer: 'photon',
      principalId: 'summer-imessage',
      principalType: 'user',
    },
    context: [turn.instructions],
    title: 'Summer iMessage',
  };
}

export default photonIMessageChannel({
  async credentials() {
    return photonCredentials();
  },
  onMessage: onSummerIMessage,
  userName: 'Summer',
  webhookSecret: photonWebhookSecret(),
});
