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
 * iMessage is an Ovie talk channel. Jovie-on-iMessage is later.
 * Credentials are portable Photon env vars, not Vercel Connect.
 */
export function onOvieIMessage(
  _ctx: PhotonInboundMessageContext,
  message: unknown
): PhotonInboundResult {
  if (!admitOvieIMessage(authorFrom(message))) return null;
  const turn = bindEvePilotIdentity('ovie');
  return {
    auth: {
      attributes: {
        fallback: 'true',
        identity: 'ovie',
        source: 'imessage',
      },
      authenticator: 'photon-imessage',
      issuer: 'photon',
      principalId: 'ovie-imessage',
      principalType: 'user',
    },
    context: [turn.instructions],
    title: 'Ovie iMessage',
  };
}

export default photonIMessageChannel({
  async credentials() {
    const projectId = process.env.IMESSAGE_PROJECT_ID?.trim();
    const projectSecret = process.env.IMESSAGE_PROJECT_SECRET?.trim();
    if (!projectId || !projectSecret) {
      throw new Error(
        'Photon portable credentials required (IMESSAGE_PROJECT_ID / IMESSAGE_PROJECT_SECRET). Do not use Vercel Connect.'
      );
    }
    return { projectId, projectSecret };
  },
  onMessage: onOvieIMessage,
  webhookSecret: process.env.IMESSAGE_WEBHOOK_SECRET,
});
