import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  digest,
  type ProfileWriteAdapter,
  type ProfileWriteManifest,
} from '@/lib/connectors/profile-writes/contract';
import {
  getBioSubmissionManifest,
  getProfileDestination,
} from '@/lib/connectors/profile-writes/destinations';
import { CopyFloorViolationError } from '@/lib/copy/outbound-floor';
import type { EmailProvider } from '@/types/notifications';
import {
  type BioSubmissionContext,
  createBioSubmissionAdapter,
} from './adapter';

vi.mock('@/lib/connectors/profile-writes/destinations', () => ({
  getBioSubmissionManifest: vi.fn(),
  getProfileDestination: vi.fn(),
}));

const NOW = new Date('2026-10-16T08:00:00.000Z');
const BIO = 'The new single is out now.';
const destination = {
  connectorAccountId: 'fixture-connector',
  destinationAccountId: 'fixture-artist',
  providerId: 'fixture-dsp',
};
const emailDestination = {
  label: 'Fixture DSP',
  method: 'email' as const,
  recipient: 'support@example.test',
  portal: 'https://example.test/artists',
  maxBioLength: 100,
};
const load = vi.fn<() => Promise<BioSubmissionContext>>();
const send = vi.fn<EmailProvider['sendEmail']>();
let context: BioSubmissionContext;
let manifest: ProfileWriteManifest;
let adapter: ProfileWriteAdapter;

function write(
  overrides: Partial<Parameters<ProfileWriteAdapter['write']>[0]> = {}
) {
  return adapter.write({
    destination,
    expectedVersion: digest(context),
    values: { bio: BIO },
    idempotencyKey: 'fixture-submission-key',
    manifestDigest: digest(manifest),
    ...overrides,
  });
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  context = {
    bio: 'Previous artist bio.',
    displayName: 'Example Artist',
    username: 'example-artist',
    spotifyId: 'fixture-spotify-id',
    spotifyUrl: 'https://example.test/spotify/artist',
    externalArtistId: 'fixture-artist',
    externalArtistUrl: 'https://example.test/artists/fixture-artist',
  };
  // Synthetic evidence exercises dispatch without enabling a real destination.
  manifest = {
    providerId: destination.providerId,
    operation: 'email-submission',
    version: 'fixture-v1',
    fields: ['bio'],
    requiredScopes: [],
    termsApproved: true,
    evidenceRef: 'fixture:terms-review',
    evidenceExpiresAt: '2026-10-16T09:00:00.000Z',
    rollback: 'manual',
    recipient: emailDestination.recipient,
    maxBioLength: emailDestination.maxBioLength,
    rateLimitWindowSeconds: 86400,
  };
  load.mockImplementation(async () => ({ ...context }));
  send.mockResolvedValue({
    channel: 'email',
    status: 'sent',
    detail: 'fixture-message-id',
    provider: 'debug',
  });
  vi.mocked(getBioSubmissionManifest).mockImplementation(() => manifest);
  vi.mocked(getProfileDestination).mockReturnValue(emailDestination);
  adapter = createBioSubmissionAdapter({
    providerId: destination.providerId,
    load,
    send,
  });
});

afterEach(() => {
  vi.useRealTimers();
});

describe('bio submission adapter', () => {
  it('reloads the provider manifest on each access', () => {
    expect(adapter.manifest).toEqual(manifest);
    manifest = { ...manifest, version: 'fixture-v2' };
    expect(adapter.manifest.version).toBe('fixture-v2');
    expect(getBioSubmissionManifest).toHaveBeenCalledTimes(2);
    expect(getBioSubmissionManifest).toHaveBeenCalledWith('fixture-dsp');
    expect(send).not.toHaveBeenCalled();
  });

  it.each(['Previous artist bio.', null])(
    'reads the canonical bio and fingerprints the full context (%j)',
    async bio => {
      context.bio = bio;
      expect(await adapter.read(destination)).toEqual({
        values: { bio },
        version: digest(context),
        observedAt: NOW.toISOString(),
      });
      expect(load).toHaveBeenCalledTimes(1);
      expect(send).not.toHaveBeenCalled();
    }
  );

  it.each(['bio', 'externalArtistId', 'spotifyId'] as const)(
    'rejects a changed %s after preview before dispatch',
    async field => {
      const preview = await adapter.read(destination);
      context[field] = 'changed-since-preview';
      expect(await write({ expectedVersion: preview.version })).toEqual({
        status: 'rejected',
        version: null,
        receipt: { statusCode: 412 },
      });
      expect(load).toHaveBeenCalledTimes(2);
      expect(getBioSubmissionManifest).not.toHaveBeenCalled();
      expect(send).not.toHaveBeenCalled();
    }
  );

  it('rejects a manifest whose recipient changed after preview', async () => {
    const manifestDigest = digest(adapter.manifest);
    manifest = { ...manifest, recipient: 'changed@example.test' };
    await expect(write({ manifestDigest })).rejects.toThrow('stale-manifest');
    expect(getBioSubmissionManifest).toHaveBeenLastCalledWith('fixture-dsp');
    expect(getProfileDestination).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
  });

  const unverifiedManifests: {
    name: string;
    change: Partial<ProfileWriteManifest>;
  }[] = [
    { name: 'missing operation', change: { operation: undefined } },
    { name: 'unapproved terms', change: { termsApproved: false } },
    { name: 'missing evidence', change: { evidenceRef: '' } },
    {
      name: 'expired evidence',
      change: { evidenceExpiresAt: '2026-10-16T07:59:59.999Z' },
    },
    {
      name: 'evidence expiring now',
      change: { evidenceExpiresAt: NOW.toISOString() },
    },
    {
      name: 'invalid evidence expiry',
      change: { evidenceExpiresAt: 'invalid' },
    },
    { name: 'missing recipient', change: { recipient: undefined } },
    { name: 'empty recipient', change: { recipient: '' } },
    { name: 'missing bio limit', change: { maxBioLength: undefined } },
  ];

  it.each(unverifiedManifests)(
    'blocks $name before sending',
    async ({ change }) => {
      manifest = { ...manifest, ...change };
      await expect(write()).rejects.toThrow('unverified-submission');
      expect(send).not.toHaveBeenCalled();
    }
  );

  it.each([undefined, { ...emailDestination, method: 'api' as const }])(
    'blocks missing or non-email destinations (%j)',
    async target => {
      vi.mocked(getProfileDestination).mockReturnValue(target);
      await expect(write()).rejects.toThrow('unverified-submission');
      expect(getProfileDestination).toHaveBeenCalledWith('fixture-dsp');
      expect(send).not.toHaveBeenCalled();
    }
  );

  it.each([undefined, null, '', 'x'.repeat(101)])(
    'blocks a missing, empty, or oversized bio (%j)',
    async bio => {
      await expect(write({ values: { bio } })).rejects.toThrow(
        'unverified-submission'
      );
      expect(send).not.toHaveBeenCalled();
    }
  );

  it('rechecks evidence expiry at dispatch even when the manifest digest matches', async () => {
    const manifestDigest = digest(adapter.manifest);
    vi.setSystemTime(new Date(manifest.evidenceExpiresAt));
    await expect(write({ manifestDigest })).rejects.toThrow(
      'unverified-submission'
    );
    expect(send).not.toHaveBeenCalled();
  });

  it('blocks copy-floor violations before sending', async () => {
    await expect(
      write({ values: { bio: 'We guarantee playlist placements.' } })
    ).rejects.toMatchObject({
      name: CopyFloorViolationError.name,
      surface: 'dsp-bio-sync',
      rules: expect.arrayContaining(['guaranteed-results']),
    });
    expect(send).not.toHaveBeenCalled();
  });

  it.each(['read', 'write'] as const)(
    'propagates a source load failure during %s without sending',
    async operation => {
      const error = new Error('fixture-load-failure');
      load.mockRejectedValue(error);
      await expect(
        operation === 'read' ? adapter.read(destination) : write()
      ).rejects.toBe(error);
      expect(send).not.toHaveBeenCalled();
    }
  );

  it('propagates a delivery rejection without retrying', async () => {
    const error = new Error('fixture-send-failure');
    send.mockRejectedValue(error);
    await expect(write()).rejects.toBe(error);
    expect(send).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each(['error', 'skipped'] as const)(
    'treats a %s delivery result as unknown rather than applied',
    async status => {
      send.mockResolvedValue({ channel: 'email', status });
      await expect(write()).rejects.toThrow('submission-result-unknown');
      expect(send).toHaveBeenCalledTimes(1);
    }
  );

  it('times out an unresolved send after ten seconds without retrying', async () => {
    send.mockReturnValue(new Promise(() => {}));
    const outcome = expect(write()).rejects.toThrow(
      'DSP bio submission timed out after 10000ms'
    );
    await vi.advanceTimersByTimeAsync(10_000);
    await outcome;
    expect(send).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('sends the requested bio with current artist identifiers and returns a submission receipt', async () => {
    expect(await write()).toEqual({
      status: 'applied',
      version: null,
      receipt: { messageId: 'fixture-message-id', statusCode: 202 },
    });
    expect(load).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledExactlyOnceWith({
      to: 'support@example.test',
      subject: expect.stringContaining('Example Artist'),
      text: expect.stringContaining(BIO),
      html: expect.stringContaining(BIO),
      idempotencyKey: 'fixture-submission-key',
    });
    const message = send.mock.calls[0][0];
    for (const value of [
      'Fixture DSP',
      context.username,
      context.externalArtistId,
      context.externalArtistUrl,
      context.spotifyUrl,
    ]) {
      expect(message.text).toContain(value);
    }
    expect(message.text).not.toContain(context.bio);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('accepts a bio at the exact limit and falls back to the username when the display name is absent', async () => {
    context.displayName = null;
    context.externalArtistUrl = null;
    context.spotifyUrl = null;
    const bio = 'New songs out Friday.';
    manifest = { ...manifest, maxBioLength: bio.length };
    expect(await write({ values: { bio } })).toMatchObject({
      status: 'applied',
      version: null,
      receipt: { statusCode: 202 },
    });
    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0][0]).toMatchObject({
      subject: expect.stringContaining(context.username),
      text: expect.stringContaining(bio),
    });
  });
});
