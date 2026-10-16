import 'server-only';
import {
  digest,
  type ProfileWriteAdapter,
} from '@/lib/connectors/profile-writes/contract';
import { getProfileDestination } from '@/lib/connectors/profile-writes/destinations';
import { assertCustomerVoiceFloor } from '@/lib/copy/outbound-floor';
import { getDspBioUpdateEmail } from '@/lib/email/templates/dsp-bio-update';
import { withTimeout } from '@/lib/resilience/primitives';
import type { EmailProvider } from '@/types/notifications';

/** Fingerprinted in the preview, then reloaded immediately before dispatch. */
export interface BioSubmissionContext {
  bio: string | null;
  displayName: string | null;
  username: string;
  spotifyId: string | null;
  spotifyUrl: string | null;
  externalArtistId: string;
  externalArtistUrl: string | null;
}

export function createBioSubmissionAdapter(input: {
  manifest: () => ProfileWriteAdapter['manifest'];
  load: () => Promise<BioSubmissionContext>;
  send: EmailProvider['sendEmail'];
}): ProfileWriteAdapter {
  return {
    get manifest() {
      return input.manifest();
    },
    async read() {
      const context = await input.load();
      // This is the canonical source snapshot, not a claim about the DSP's bio.
      return {
        values: { bio: context.bio },
        version: digest(context),
        observedAt: new Date().toISOString(),
      };
    },
    async write({ expectedVersion, values, idempotencyKey, manifestDigest }) {
      const context = await input.load();
      if (digest(context) !== expectedVersion)
        return {
          status: 'rejected',
          version: null,
          receipt: { statusCode: 412 },
        };
      const manifest = input.manifest();
      if (digest(manifest) !== manifestDigest)
        throw new Error('stale-manifest');
      const destination = getProfileDestination(manifest.providerId);
      if (
        manifest.operation !== 'email-submission' ||
        destination?.method !== 'email' ||
        !manifest.termsApproved ||
        !manifest.evidenceRef ||
        !(Date.parse(manifest.evidenceExpiresAt) > Date.now()) ||
        !manifest.recipient ||
        !values.bio ||
        values.bio.length > (manifest.maxBioLength ?? 0)
      )
        throw new Error('unverified-submission');
      assertCustomerVoiceFloor(values.bio, 'dsp-bio-sync');
      const content = getDspBioUpdateEmail({
        artistName: context.displayName || context.username,
        username: context.username,
        dspDisplayName: destination.label,
        externalArtistId: context.externalArtistId,
        externalArtistUrl: context.externalArtistUrl ?? undefined,
        bioText: values.bio,
        spotifyId: context.spotifyId,
        spotifyUrl: context.spotifyUrl,
      });
      const result = await withTimeout(
        input.send({
          to: manifest.recipient,
          ...content,
          idempotencyKey,
        }),
        { timeoutMs: 10_000, context: 'DSP bio submission' }
      );
      if (result.status !== 'sent')
        throw new Error('submission-result-unknown');
      return {
        status: 'applied',
        version: null,
        receipt: { messageId: result.detail, statusCode: 202 },
      };
    },
  };
}
