import { createHash } from 'node:crypto';
import {
  defaultPhotonAuth,
  type PhotonInboundMessageContext,
  type PhotonInboundResult,
  photonIMessageChannel,
} from 'eve/channels/photon';

import { admitOvieIMessage } from '../lib/imessage-allowlist';
import {
  bindEvePilotIdentity,
  photonIdentityFromEnvironment,
} from '../select-identity';

type PhotonAuthor = {
  readonly handle?: string;
  readonly id?: string;
  readonly isBot?: boolean;
  readonly phone?: string;
  readonly userId?: string;
};

function authorFrom(message: unknown): PhotonAuthor | undefined {
  if (!message || typeof message !== 'object') return undefined;
  const record = message as { author?: PhotonAuthor };
  return record.author;
}

export const PHOTON_WEBHOOK_SECRET_UNCONFIGURED =
  'imessage-webhook-secret-unconfigured';
export const PHOTON_PROJECT_ID_UNCONFIGURED =
  'imessage-project-id-unconfigured';
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
    return {
      projectId: PHOTON_PROJECT_ID_UNCONFIGURED,
      projectSecret: PHOTON_PROJECT_SECRET_UNCONFIGURED,
    };
  }
  return { projectId, projectSecret };
}

function digest(value: string): string {
  return createHash('sha256').update(value).digest('hex').slice(0, 16);
}

export function photonThreadBinding(
  identity: 'jovie' | 'summer',
  threadId: string
): string {
  return `${identity}:photon:${digest(threadId)}`;
}

export function photonUserName(
  environment: Readonly<Record<string, string | undefined>> = process.env
): 'Jovie' | 'Summer' | 'Eve (unconfigured)' {
  const identity = photonIdentityFromEnvironment(environment);
  if (identity === 'jovie') return 'Jovie';
  if (identity === 'summer') return 'Summer';
  return 'Eve (unconfigured)';
}

export function onPhotonIMessage(
  ctx: PhotonInboundMessageContext,
  message: unknown,
  environment: Readonly<Record<string, string | undefined>> = process.env
): PhotonInboundResult {
  const identity = photonIdentityFromEnvironment(environment);
  const author = authorFrom(message);
  const credentials = photonCredentials(environment);
  if (
    !identity ||
    !author ||
    author.isBot ||
    !author.userId?.trim() ||
    credentials.projectId === PHOTON_PROJECT_ID_UNCONFIGURED ||
    credentials.projectSecret === PHOTON_PROJECT_SECRET_UNCONFIGURED
  ) {
    return null;
  }
  if (
    identity === 'summer' &&
    !admitOvieIMessage(
      author,
      undefined,
      environment.OVIE_IMESSAGE_ALLOWED_SENDERS
    )
  ) {
    return null;
  }

  const auth = defaultPhotonAuth(message as never);
  const turn = bindEvePilotIdentity(identity);
  const audience = identity === 'summer' ? 'private-company' : 'public-artist';
  return {
    auth: {
      ...auth,
      attributes: {
        ...auth.attributes,
        audience,
        identity,
        presentation: identity === 'summer' ? 'ovie' : 'jovie',
        project_binding: digest(credentials.projectId),
        provenance: 'photon-hmac',
        source: 'imessage',
        thread_binding: photonThreadBinding(identity, ctx.thread.id),
      },
    },
    context: [turn.instructions],
    title: identity === 'summer' ? 'Summer via Ovie' : 'Jovie iMessage',
  };
}

export default photonIMessageChannel({
  async credentials() {
    return photonCredentials();
  },
  onMessage: onPhotonIMessage,
  userName: photonUserName(),
  webhookSecret: photonWebhookSecret(),
});
