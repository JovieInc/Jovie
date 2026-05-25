import 'server-only';

import {
  createHash,
  createHmac,
  randomUUID,
  timingSafeEqual,
} from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { Notification, Provider } from '@parse/node-apn';
import { and, eq, gt, inArray, isNull } from 'drizzle-orm';
import { PKPass } from 'passkit-generator';
import { BASE_URL, getProfileUrl } from '@/constants/domains';
import { createUniqueSourceLinkCode } from '@/lib/audience/source-links';
import { isProfileComplete } from '@/lib/auth/profile-completeness';
import { type DbOrTransaction, db } from '@/lib/db';
import { audienceSourceLinks } from '@/lib/db/schema/analytics';
import { creatorProfiles } from '@/lib/db/schema/profiles';
import {
  type AppleWalletProfilePass,
  appleWalletPassDevices,
  appleWalletPassRegistrations,
  appleWalletProfilePasses,
} from '@/lib/db/schema/wallet';
import { env } from '@/lib/env-server';
import { captureError } from '@/lib/error-tracking';
import { getAppFlagValue } from '@/lib/flags/server';
import { NO_STORE_HEADERS } from '@/lib/http/headers';
import {
  downloadImage,
  sanitizeHttpsUrl,
} from '@/lib/ingestion/avatar/http-client';
import { getSharp } from '@/lib/ingestion/avatar/image-optimizer';
import { logger } from '@/lib/utils/logger';

export const APPLE_WALLET_PROFILE_PASS_MIME = 'application/vnd.apple.pkpass';
export const APPLE_WALLET_PROFILE_PASS_SOURCE_TYPE = 'wallet_pass';
export const APPLE_WALLET_PROFILE_PASS_NAME = 'Apple Wallet Profile';

export interface AppleWalletProfile {
  readonly id: string;
  readonly username: string;
  readonly usernameNormalized: string;
  readonly displayName: string | null;
  readonly avatarUrl: string | null;
  readonly isPublic: boolean | null;
  readonly onboardingCompletedAt: Date | null;
}

interface AppleWalletConfig {
  readonly passTypeIdentifier: string;
  readonly teamIdentifier: string;
  readonly signerCert: string;
  readonly signerKey: string;
  readonly signerKeyPassphrase: string | undefined;
  readonly wwdr: string;
  readonly authTokenSecret: string;
  readonly apnsProduction: boolean;
}

export class AppleWalletConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AppleWalletConfigError';
  }
}

function normalizePem(value: string): string {
  return value.replaceAll('\\n', '\n').trim();
}

function requiredEnv(key: keyof typeof env): string {
  const value = env[key];
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new AppleWalletConfigError(`Missing ${key}`);
  }
  return value;
}

export function getAppleWalletConfig(): AppleWalletConfig {
  return {
    passTypeIdentifier: requiredEnv('APPLE_WALLET_PASS_TYPE_IDENTIFIER'),
    teamIdentifier: requiredEnv('APPLE_WALLET_TEAM_IDENTIFIER'),
    signerCert: normalizePem(requiredEnv('APPLE_WALLET_SIGNER_CERT_PEM')),
    signerKey: normalizePem(requiredEnv('APPLE_WALLET_SIGNER_KEY_PEM')),
    signerKeyPassphrase:
      typeof env.APPLE_WALLET_SIGNER_KEY_PASSPHRASE === 'string'
        ? env.APPLE_WALLET_SIGNER_KEY_PASSPHRASE
        : undefined,
    wwdr: normalizePem(requiredEnv('APPLE_WALLET_WWDR_CERT_PEM')),
    authTokenSecret: requiredEnv('APPLE_WALLET_AUTH_TOKEN_SECRET'),
    apnsProduction: env.APPLE_WALLET_APNS_PRODUCTION === 'true',
  };
}

export function isAppleWalletConfigured(): boolean {
  try {
    getAppleWalletConfig();
    return true;
  } catch {
    return false;
  }
}

export async function isAppleWalletProfilePassAvailable(
  userId: string | null,
  profile: AppleWalletProfile | null
): Promise<boolean> {
  if (!profile) return false;
  if (!isAppleWalletConfigured()) return false;
  if (
    !isProfileComplete({
      username: profile.username,
      usernameNormalized: profile.usernameNormalized,
      displayName: profile.displayName,
      isPublic: profile.isPublic,
      onboardingCompletedAt: profile.onboardingCompletedAt,
    })
  ) {
    return false;
  }

  return getAppFlagValue('APPLE_WALLET_PROFILE_PASS', { userId });
}

function buildAuthenticationToken(
  config: AppleWalletConfig,
  serialNumber: string
): string {
  return createHmac('sha256', config.authTokenSecret)
    .update(`jovie-wallet-profile-pass:${serialNumber}`)
    .digest('base64url');
}

function hashAuthenticationToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function verifyAppleWalletAuthenticationToken(
  pass: Pick<
    AppleWalletProfilePass,
    'authenticationTokenHash' | 'serialNumber'
  >,
  token: string
): boolean {
  const config = getAppleWalletConfig();
  const expectedToken = buildAuthenticationToken(config, pass.serialNumber);
  if (expectedToken !== token) return false;

  const expectedHash = Buffer.from(pass.authenticationTokenHash, 'hex');
  const actualHash = Buffer.from(hashAuthenticationToken(token), 'hex');
  if (expectedHash.length !== actualHash.length) return false;
  return timingSafeEqual(expectedHash, actualHash);
}

export function buildAppleWalletProfileUrl(
  profile: AppleWalletProfile
): string {
  return getProfileUrl(profile.username);
}

export function buildAppleWalletWebServiceUrl(): string {
  return new URL('/api/wallet/apple/v1', BASE_URL).toString();
}

export function buildAppleWalletPassFileName(handle: string): string {
  const safeHandle = handle.replaceAll(/[^a-z0-9_-]/gi, '').slice(0, 48);
  return `jovie-${safeHandle || 'profile'}.pkpass`;
}

function buildWalletUpdatedTag(now = new Date()): string {
  return now.toISOString();
}

function buildAvatarAssetVersion(avatarUrl: string | null): string {
  if (!avatarUrl) return 'none';
  return createHash('sha256').update(avatarUrl).digest('hex').slice(0, 24);
}

function buildWalletSourceUtmParams() {
  return {
    source: 'apple_wallet',
    medium: 'wallet',
    campaign: 'profile',
    content: 'profile-pass',
  };
}

function buildShortLinkUrl(code: string): string {
  return new URL(`/s/${code}`, BASE_URL).toString();
}

async function ensureWalletSourceLink(
  tx: DbOrTransaction,
  profile: AppleWalletProfile,
  existingSourceLinkId: string | null | undefined
) {
  const destinationUrl = buildAppleWalletProfileUrl(profile);
  const now = new Date();

  if (existingSourceLinkId) {
    const [existing] = await tx
      .select()
      .from(audienceSourceLinks)
      .where(eq(audienceSourceLinks.id, existingSourceLinkId))
      .limit(1);

    if (existing && !existing.archivedAt) {
      const [updated] = await tx
        .update(audienceSourceLinks)
        .set({
          name: APPLE_WALLET_PROFILE_PASS_NAME,
          sourceType: APPLE_WALLET_PROFILE_PASS_SOURCE_TYPE,
          destinationKind: 'profile',
          destinationId: profile.id,
          destinationUrl,
          utmParams: buildWalletSourceUtmParams(),
          metadata: {
            ...(existing.metadata ?? {}),
            walletPassKind: 'apple_profile',
            objectLabel: profile.displayName ?? `@${profile.username}`,
          },
          updatedAt: now,
        })
        .where(eq(audienceSourceLinks.id, existing.id))
        .returning();
      if (updated) return updated;
    }
  }

  const [existingWalletLink] = await tx
    .select()
    .from(audienceSourceLinks)
    .where(
      and(
        eq(audienceSourceLinks.creatorProfileId, profile.id),
        eq(
          audienceSourceLinks.sourceType,
          APPLE_WALLET_PROFILE_PASS_SOURCE_TYPE
        ),
        isNull(audienceSourceLinks.archivedAt)
      )
    )
    .limit(1);

  if (existingWalletLink) {
    const [updated] = await tx
      .update(audienceSourceLinks)
      .set({
        name: APPLE_WALLET_PROFILE_PASS_NAME,
        destinationKind: 'profile',
        destinationId: profile.id,
        destinationUrl,
        utmParams: buildWalletSourceUtmParams(),
        metadata: {
          ...(existingWalletLink.metadata ?? {}),
          walletPassKind: 'apple_profile',
          objectLabel: profile.displayName ?? `@${profile.username}`,
        },
        updatedAt: now,
      })
      .where(eq(audienceSourceLinks.id, existingWalletLink.id))
      .returning();
    if (updated) return updated;
  }

  const code = await createUniqueSourceLinkCode(
    tx,
    `${profile.username}-wallet`
  );
  const [created] = await tx
    .insert(audienceSourceLinks)
    .values({
      creatorProfileId: profile.id,
      code,
      name: APPLE_WALLET_PROFILE_PASS_NAME,
      sourceType: APPLE_WALLET_PROFILE_PASS_SOURCE_TYPE,
      destinationKind: 'profile',
      destinationId: profile.id,
      destinationUrl,
      utmParams: buildWalletSourceUtmParams(),
      metadata: {
        walletPassKind: 'apple_profile',
        objectLabel: profile.displayName ?? `@${profile.username}`,
      },
      createdAt: now,
      updatedAt: now,
    })
    .returning();

  if (!created) {
    throw new Error('Apple Wallet source link insert returned no row');
  }
  return created;
}

function hasPassSnapshotChanged(
  pass: AppleWalletProfilePass,
  input: {
    readonly profileUrl: string;
    readonly walletShareUrl: string;
    readonly displayName: string;
    readonly handle: string;
    readonly avatarUrl: string | null;
    readonly avatarAssetVersion: string;
    readonly sourceLinkId: string;
  }
): boolean {
  return (
    pass.profileUrl !== input.profileUrl ||
    pass.walletShareUrl !== input.walletShareUrl ||
    pass.displayName !== input.displayName ||
    pass.handle !== input.handle ||
    pass.avatarUrl !== input.avatarUrl ||
    pass.avatarAssetVersion !== input.avatarAssetVersion ||
    pass.sourceLinkId !== input.sourceLinkId
  );
}

export async function ensureAppleWalletProfilePass(
  tx: DbOrTransaction,
  profile: AppleWalletProfile
): Promise<{
  readonly pass: AppleWalletProfilePass;
  readonly authenticationToken: string;
}> {
  const config = getAppleWalletConfig();
  const [existingPass] = await tx
    .select()
    .from(appleWalletProfilePasses)
    .where(
      and(
        eq(appleWalletProfilePasses.creatorProfileId, profile.id),
        eq(
          appleWalletProfilePasses.passTypeIdentifier,
          config.passTypeIdentifier
        )
      )
    )
    .limit(1);

  const sourceLink = await ensureWalletSourceLink(
    tx,
    profile,
    existingPass?.sourceLinkId
  );
  const profileUrl = buildAppleWalletProfileUrl(profile);
  const walletShareUrl = buildShortLinkUrl(sourceLink.code);
  const displayName = profile.displayName?.trim() || profile.username;
  const handle = profile.username;
  const avatarAssetVersion = buildAvatarAssetVersion(profile.avatarUrl);
  const now = new Date();

  if (!existingPass) {
    const serialNumber = `jwp-${randomUUID()}`;
    const authenticationToken = buildAuthenticationToken(config, serialNumber);
    const [created] = await tx
      .insert(appleWalletProfilePasses)
      .values({
        creatorProfileId: profile.id,
        sourceLinkId: sourceLink.id,
        passTypeIdentifier: config.passTypeIdentifier,
        serialNumber,
        authenticationTokenHash: hashAuthenticationToken(authenticationToken),
        profileUrl,
        walletShareUrl,
        displayName,
        handle,
        avatarUrl: profile.avatarUrl,
        avatarAssetVersion,
        lastUpdatedTag: buildWalletUpdatedTag(now),
        createdAt: now,
        updatedAt: now,
      })
      .returning();

    if (!created) {
      throw new Error('Apple Wallet profile pass insert returned no row');
    }
    return { pass: created, authenticationToken };
  }

  const authenticationToken = buildAuthenticationToken(
    config,
    existingPass.serialNumber
  );
  const nextSnapshot = {
    profileUrl,
    walletShareUrl,
    displayName,
    handle,
    avatarUrl: profile.avatarUrl,
    avatarAssetVersion,
    sourceLinkId: sourceLink.id,
  };

  if (!hasPassSnapshotChanged(existingPass, nextSnapshot)) {
    return { pass: existingPass, authenticationToken };
  }

  const [updated] = await tx
    .update(appleWalletProfilePasses)
    .set({
      ...nextSnapshot,
      passVersion: existingPass.passVersion + 1,
      lastUpdatedTag: buildWalletUpdatedTag(now),
      updatedAt: now,
    })
    .where(eq(appleWalletProfilePasses.id, existingPass.id))
    .returning();

  if (!updated) {
    throw new Error('Apple Wallet profile pass update returned no row');
  }
  return { pass: updated, authenticationToken };
}

async function renderPngAsset(
  input: Buffer,
  options: {
    readonly width: number;
    readonly height: number;
    readonly fit?: 'cover' | 'contain';
    readonly background?: string;
  }
): Promise<Buffer> {
  const sharp = await getSharp();
  return sharp(input, { failOnError: false })
    .rotate()
    .resize({
      width: options.width,
      height: options.height,
      fit: options.fit ?? 'contain',
      position: 'centre',
      background: options.background ?? '#00000000',
    })
    .png()
    .toBuffer();
}

async function buildStaticPassAssets(): Promise<Record<string, Buffer>> {
  const logo = await readFile(join(process.cwd(), 'public', 'Jovie-logo.png'));
  return {
    'icon.png': await renderPngAsset(logo, { width: 29, height: 29 }),
    'icon@2x.png': await renderPngAsset(logo, { width: 58, height: 58 }),
    'logo.png': await renderPngAsset(logo, {
      width: 160,
      height: 50,
      fit: 'contain',
    }),
    'logo@2x.png': await renderPngAsset(logo, {
      width: 320,
      height: 100,
      fit: 'contain',
    }),
  };
}

async function buildAvatarAssets(
  pass: AppleWalletProfilePass
): Promise<Record<string, Buffer>> {
  const sanitizedUrl = sanitizeHttpsUrl(pass.avatarUrl);
  if (!sanitizedUrl) return {};

  try {
    const downloaded = await downloadImage(sanitizedUrl);
    return {
      'thumbnail.png': await renderPngAsset(downloaded.buffer, {
        width: 90,
        height: 90,
        fit: 'cover',
      }),
      'thumbnail@2x.png': await renderPngAsset(downloaded.buffer, {
        width: 180,
        height: 180,
        fit: 'cover',
      }),
    };
  } catch (error) {
    logger.warn('[apple-wallet] Falling back without avatar thumbnail', {
      passId: pass.id,
      error: error instanceof Error ? error.message : String(error),
    });
    await captureError('Apple Wallet avatar asset generation failed', error, {
      passId: pass.id,
      creatorProfileId: pass.creatorProfileId,
    }).catch(() => undefined);
    return {};
  }
}

export async function generateAppleWalletProfilePassBuffer(
  pass: AppleWalletProfilePass,
  authenticationToken: string
): Promise<Buffer> {
  const config = getAppleWalletConfig();
  const passJson = {
    formatVersion: 1,
    passTypeIdentifier: pass.passTypeIdentifier,
    serialNumber: pass.serialNumber,
    teamIdentifier: config.teamIdentifier,
    organizationName: 'Jovie',
    description: 'Jovie Profile',
    logoText: 'Jovie',
    foregroundColor: 'rgb(17,17,17)',
    backgroundColor: 'rgb(255,255,255)',
    labelColor: 'rgb(92,92,92)',
    webServiceURL: buildAppleWalletWebServiceUrl(),
    authenticationToken,
    userInfo: {
      kind: 'jovie_profile',
      creatorProfileId: pass.creatorProfileId,
      sourceLinkId: pass.sourceLinkId,
      passVersion: pass.passVersion,
    },
    generic: {
      headerFields: [{ key: 'kind', label: 'PROFILE', value: 'JOVIE' }],
      primaryFields: [
        { key: 'name', label: 'Jovie Profile', value: pass.displayName },
      ],
      secondaryFields: [
        { key: 'handle', label: 'Handle', value: `@${pass.handle}` },
      ],
      auxiliaryFields: [
        {
          key: 'status',
          label: 'Share',
          value: 'Scan to open profile',
        },
      ],
      backFields: [
        {
          key: 'profile',
          label: 'Profile',
          value: pass.profileUrl,
          dataDetectorTypes: ['PKDataDetectorTypeLink'],
        },
        {
          key: 'share',
          label: 'Share',
          value: 'Show this pass and let someone scan the QR code.',
        },
        {
          key: 'open',
          label: 'Open in Jovie',
          value: `${pass.profileUrl}?open_app=1`,
          dataDetectorTypes: ['PKDataDetectorTypeLink'],
        },
      ],
    },
  };
  const staticAssets = await buildStaticPassAssets();
  const avatarAssets = await buildAvatarAssets(pass);
  const pkpass = new PKPass(
    {
      ...staticAssets,
      ...avatarAssets,
      'pass.json': Buffer.from(JSON.stringify(passJson)),
    },
    {
      wwdr: config.wwdr,
      signerCert: config.signerCert,
      signerKey: config.signerKey,
      signerKeyPassphrase: config.signerKeyPassphrase,
    }
  );

  pkpass.setBarcodes({
    format: 'PKBarcodeFormatQR',
    message: pass.walletShareUrl,
    messageEncoding: 'iso-8859-1',
    altText: `jov.ie/${pass.handle}`,
  });

  return pkpass.getAsBuffer();
}

export function buildAppleWalletPassResponseHeaders(fileName: string) {
  return {
    ...NO_STORE_HEADERS,
    'Content-Type': APPLE_WALLET_PROFILE_PASS_MIME,
    'Content-Disposition': `attachment; filename="${fileName}"`,
  };
}

export function toAppleWalletPassResponseBody(buffer: Buffer): ArrayBuffer {
  const body = new ArrayBuffer(buffer.byteLength);
  new Uint8Array(body).set(buffer);
  return body;
}

export async function recordAppleWalletPassDownload(
  tx: DbOrTransaction,
  passId: string
): Promise<void> {
  const [pass] = await tx
    .select({
      downloadCount: appleWalletProfilePasses.downloadCount,
    })
    .from(appleWalletProfilePasses)
    .where(eq(appleWalletProfilePasses.id, passId))
    .limit(1);

  await tx
    .update(appleWalletProfilePasses)
    .set({
      downloadCount: (pass?.downloadCount ?? 0) + 1,
      lastDownloadedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(appleWalletProfilePasses.id, passId));
}

export async function getAppleWalletPassBySerial(
  tx: DbOrTransaction,
  passTypeIdentifier: string,
  serialNumber: string
): Promise<AppleWalletProfilePass | null> {
  const [pass] = await tx
    .select()
    .from(appleWalletProfilePasses)
    .where(
      and(
        eq(appleWalletProfilePasses.passTypeIdentifier, passTypeIdentifier),
        eq(appleWalletProfilePasses.serialNumber, serialNumber),
        isNull(appleWalletProfilePasses.revokedAt)
      )
    )
    .limit(1);
  return pass ?? null;
}

export async function registerAppleWalletDevice(
  tx: DbOrTransaction,
  input: {
    readonly passId: string;
    readonly deviceLibraryIdentifier: string;
    readonly pushToken: string;
  }
): Promise<'created' | 'updated'> {
  const now = new Date();
  const [existingDevice] = await tx
    .select()
    .from(appleWalletPassDevices)
    .where(
      eq(
        appleWalletPassDevices.deviceLibraryIdentifier,
        input.deviceLibraryIdentifier
      )
    )
    .limit(1);

  const [device] = existingDevice
    ? await tx
        .update(appleWalletPassDevices)
        .set({
          pushToken: input.pushToken,
          disabledAt: null,
          updatedAt: now,
        })
        .where(eq(appleWalletPassDevices.id, existingDevice.id))
        .returning()
    : await tx
        .insert(appleWalletPassDevices)
        .values({
          deviceLibraryIdentifier: input.deviceLibraryIdentifier,
          pushToken: input.pushToken,
          createdAt: now,
          updatedAt: now,
        })
        .returning();

  if (!device) throw new Error('Apple Wallet device upsert returned no row');

  const [existingRegistration] = await tx
    .select()
    .from(appleWalletPassRegistrations)
    .where(
      and(
        eq(appleWalletPassRegistrations.passId, input.passId),
        eq(appleWalletPassRegistrations.deviceId, device.id)
      )
    )
    .limit(1);

  if (existingRegistration) {
    await tx
      .update(appleWalletPassRegistrations)
      .set({
        unregisteredAt: null,
        lastSeenAt: now,
        updatedAt: now,
      })
      .where(eq(appleWalletPassRegistrations.id, existingRegistration.id));
    return existingRegistration.unregisteredAt ? 'created' : 'updated';
  }

  await tx.insert(appleWalletPassRegistrations).values({
    passId: input.passId,
    deviceId: device.id,
    registeredAt: now,
    lastSeenAt: now,
    createdAt: now,
    updatedAt: now,
  });
  return 'created';
}

export async function unregisterAppleWalletDevice(
  tx: DbOrTransaction,
  input: {
    readonly passId: string;
    readonly deviceLibraryIdentifier: string;
  }
): Promise<void> {
  const [device] = await tx
    .select({ id: appleWalletPassDevices.id })
    .from(appleWalletPassDevices)
    .where(
      eq(
        appleWalletPassDevices.deviceLibraryIdentifier,
        input.deviceLibraryIdentifier
      )
    )
    .limit(1);
  if (!device) return;

  await tx
    .update(appleWalletPassRegistrations)
    .set({ unregisteredAt: new Date(), updatedAt: new Date() })
    .where(
      and(
        eq(appleWalletPassRegistrations.passId, input.passId),
        eq(appleWalletPassRegistrations.deviceId, device.id),
        isNull(appleWalletPassRegistrations.unregisteredAt)
      )
    );
}

export async function getChangedAppleWalletSerialNumbers(
  tx: DbOrTransaction,
  input: {
    readonly deviceLibraryIdentifier: string;
    readonly passTypeIdentifier: string;
    readonly passesUpdatedSince: string | null;
  }
): Promise<{
  readonly serialNumbers: string[];
  readonly lastUpdated: string;
} | null> {
  const [device] = await tx
    .select({ id: appleWalletPassDevices.id })
    .from(appleWalletPassDevices)
    .where(
      and(
        eq(
          appleWalletPassDevices.deviceLibraryIdentifier,
          input.deviceLibraryIdentifier
        ),
        isNull(appleWalletPassDevices.disabledAt)
      )
    )
    .limit(1);
  if (!device) return null;

  const conditions = [
    eq(appleWalletPassRegistrations.deviceId, device.id),
    isNull(appleWalletPassRegistrations.unregisteredAt),
    eq(appleWalletProfilePasses.passTypeIdentifier, input.passTypeIdentifier),
    isNull(appleWalletProfilePasses.revokedAt),
  ];
  if (input.passesUpdatedSince) {
    conditions.push(
      gt(appleWalletProfilePasses.lastUpdatedTag, input.passesUpdatedSince)
    );
  }

  const rows = await tx
    .select({
      serialNumber: appleWalletProfilePasses.serialNumber,
      lastUpdatedTag: appleWalletProfilePasses.lastUpdatedTag,
    })
    .from(appleWalletPassRegistrations)
    .innerJoin(
      appleWalletProfilePasses,
      eq(appleWalletProfilePasses.id, appleWalletPassRegistrations.passId)
    )
    .where(and(...conditions));

  if (rows.length === 0) return null;
  return {
    serialNumbers: rows.map(row => row.serialNumber),
    lastUpdated: rows.reduce(
      (latest, row) =>
        row.lastUpdatedTag > latest ? row.lastUpdatedTag : latest,
      rows[0].lastUpdatedTag
    ),
  };
}

export async function markAppleWalletProfilePassDirty(
  tx: DbOrTransaction,
  profile: AppleWalletProfile
): Promise<string | null> {
  const config = getAppleWalletConfig();
  const [pass] = await tx
    .select()
    .from(appleWalletProfilePasses)
    .where(
      and(
        eq(appleWalletProfilePasses.creatorProfileId, profile.id),
        eq(
          appleWalletProfilePasses.passTypeIdentifier,
          config.passTypeIdentifier
        ),
        isNull(appleWalletProfilePasses.revokedAt)
      )
    )
    .limit(1);
  if (!pass) return null;

  const sourceLink = await ensureWalletSourceLink(
    tx,
    profile,
    pass.sourceLinkId
  );
  const profileUrl = buildAppleWalletProfileUrl(profile);
  const nextSnapshot = {
    sourceLinkId: sourceLink.id,
    profileUrl,
    walletShareUrl: buildShortLinkUrl(sourceLink.code),
    displayName: profile.displayName?.trim() || profile.username,
    handle: profile.username,
    avatarUrl: profile.avatarUrl,
    avatarAssetVersion: buildAvatarAssetVersion(profile.avatarUrl),
  };
  if (!hasPassSnapshotChanged(pass, nextSnapshot)) return pass.id;

  await tx
    .update(appleWalletProfilePasses)
    .set({
      ...nextSnapshot,
      passVersion: pass.passVersion + 1,
      lastUpdatedTag: buildWalletUpdatedTag(),
      updatedAt: new Date(),
    })
    .where(eq(appleWalletProfilePasses.id, pass.id));
  return pass.id;
}

export async function sendAppleWalletPassUpdatePushes(
  tx: DbOrTransaction,
  passId: string
): Promise<void> {
  const config = getAppleWalletConfig();
  const rows = await tx
    .select({
      passId: appleWalletProfilePasses.id,
      passTypeIdentifier: appleWalletProfilePasses.passTypeIdentifier,
      pushToken: appleWalletPassDevices.pushToken,
      deviceId: appleWalletPassDevices.id,
    })
    .from(appleWalletPassRegistrations)
    .innerJoin(
      appleWalletProfilePasses,
      eq(appleWalletProfilePasses.id, appleWalletPassRegistrations.passId)
    )
    .innerJoin(
      appleWalletPassDevices,
      eq(appleWalletPassDevices.id, appleWalletPassRegistrations.deviceId)
    )
    .where(
      and(
        eq(appleWalletProfilePasses.id, passId),
        isNull(appleWalletProfilePasses.revokedAt),
        isNull(appleWalletPassRegistrations.unregisteredAt),
        isNull(appleWalletPassDevices.disabledAt)
      )
    );

  if (rows.length === 0) return;

  const provider = new Provider({
    cert: config.signerCert,
    key: config.signerKey,
    passphrase: config.signerKeyPassphrase,
    production: config.apnsProduction,
    requestTimeout: 5000,
  });
  const notification = new Notification();
  notification.topic = config.passTypeIdentifier;
  notification.rawPayload = {};

  try {
    const result = await provider.send(
      notification,
      rows.map(row => row.pushToken)
    );
    const failedTokens = result.failed.map(failure => failure.device);
    if (failedTokens.length > 0) {
      const now = new Date();
      await tx
        .update(appleWalletPassDevices)
        .set({
          disabledAt: now,
          updatedAt: now,
        })
        .where(inArray(appleWalletPassDevices.pushToken, failedTokens));
      await tx
        .update(appleWalletProfilePasses)
        .set({
          lastPushError: `Failed to push ${failedTokens.length} Wallet update(s)`,
          updatedAt: now,
        })
        .where(eq(appleWalletProfilePasses.id, passId));
    } else {
      await tx
        .update(appleWalletProfilePasses)
        .set({
          lastPushedAt: new Date(),
          lastPushError: null,
          updatedAt: new Date(),
        })
        .where(eq(appleWalletProfilePasses.id, passId));
    }
  } finally {
    await provider.shutdown().catch(() => undefined);
  }
}

export async function loadAppleWalletProfile(
  tx: DbOrTransaction,
  profileId: string
): Promise<AppleWalletProfile | null> {
  const [profile] = await tx
    .select({
      id: creatorProfiles.id,
      username: creatorProfiles.username,
      usernameNormalized: creatorProfiles.usernameNormalized,
      displayName: creatorProfiles.displayName,
      avatarUrl: creatorProfiles.avatarUrl,
      isPublic: creatorProfiles.isPublic,
      onboardingCompletedAt: creatorProfiles.onboardingCompletedAt,
    })
    .from(creatorProfiles)
    .where(eq(creatorProfiles.id, profileId))
    .limit(1);
  return profile ?? null;
}

export async function refreshAppleWalletProfilePassForProfileId(
  profileId: string
): Promise<void> {
  if (!isAppleWalletConfigured()) return;

  try {
    const profile = await loadAppleWalletProfile(db, profileId);
    if (!profile) return;

    const passId = await markAppleWalletProfilePassDirty(db, profile);
    if (!passId) return;
    await sendAppleWalletPassUpdatePushes(db, passId);
  } catch (error) {
    logger.warn('[apple-wallet] Failed to refresh profile pass', {
      profileId,
      error: error instanceof Error ? error.message : String(error),
    });
    await captureError('Apple Wallet profile pass refresh failed', error, {
      profileId,
    }).catch(() => undefined);
  }
}
