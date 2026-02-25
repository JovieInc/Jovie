import crypto from 'node:crypto';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { creatorProfiles } from '@/lib/db/schema/profiles';
import { env } from '@/lib/env-server';
import { logger } from '@/lib/utils/logger';

/**
 * Escape special XML characters to prevent injection when
 * interpolating user-controlled values into SVG markup.
 */
function escapeXml(str: string): string {
  return str
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

const CLAIM_CREATIVE_LAYOUTS = [
  { key: 'square', width: 1080, height: 1080 },
  { key: 'portrait', width: 1080, height: 1350 },
  { key: 'story', width: 1080, height: 1920 },
  { key: 'landscape', width: 1200, height: 628 },
] as const;

interface ClaimRetargetingState {
  readonly claimLink?: string;
  readonly username?: string;
  readonly generatedAt?: string;
  readonly creatives?: Record<string, string>;
}

function getClaimRetargetingState(
  settings: Record<string, unknown> | null | undefined
): ClaimRetargetingState {
  if (!settings || typeof settings !== 'object') return {};
  const retargeting = settings.retargeting;
  if (!retargeting || typeof retargeting !== 'object') return {};
  const claimProfile = (retargeting as Record<string, unknown>).claimProfile;
  if (!claimProfile || typeof claimProfile !== 'object') return {};
  return claimProfile as ClaimRetargetingState;
}

function hasAllCreativeSizes(
  creatives: Record<string, string> | undefined
): boolean {
  if (!creatives) return false;
  return CLAIM_CREATIVE_LAYOUTS.every(layout => Boolean(creatives[layout.key]));
}

function getSolidBackgroundColor(username: string): string {
  const palette = [
    '#0B1020',
    '#101828',
    '#141A2A',
    '#1A1F38',
    '#111827',
    '#0F172A',
  ];
  const hash = crypto.createHash('sha256').update(username).digest('hex');
  const index = Number.parseInt(hash.slice(0, 2), 16) % palette.length;
  return palette[index] ?? palette[0];
}

export function renderClaimCreativeSvg(params: {
  username: string;
  claimLink: string;
  width: number;
  height: number;
}): string {
  const { username, claimLink, width, height } = params;
  const bg = getSolidBackgroundColor(username);
  const primary = Math.round(Math.min(width, height) * 0.085);
  const secondary = Math.round(primary * 0.5);
  const ctaWidth = Math.round(width * 0.68);
  const ctaHeight = Math.round(height * 0.11);
  const ctaX = Math.round((width - ctaWidth) / 2);
  const ctaY = Math.round(height * 0.73);

  const safeUsername = escapeXml(username);
  const safeClaimLink = escapeXml(claimLink);
  const title = `jov.ie/${safeUsername}`;

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <rect width="100%" height="100%" fill="${bg}" />
  <text x="50%" y="42%" fill="#FFFFFF" font-family="Inter, -apple-system, BlinkMacSystemFont, 'SF Pro Display', sans-serif" font-size="${primary}" font-weight="700" text-anchor="middle" letter-spacing="0.3">${title}</text>
  <rect x="${ctaX}" y="${ctaY}" width="${ctaWidth}" height="${ctaHeight}" rx="999" fill="#FFFFFF"/>
  <text x="50%" y="${ctaY + Math.round(ctaHeight * 0.62)}" fill="#111827" font-family="Inter, -apple-system, BlinkMacSystemFont, 'SF Pro Display', sans-serif" font-size="${secondary}" font-weight="600" text-anchor="middle">Claim your Jovie profile</text>
  <text x="50%" y="${Math.round(height * 0.92)}" fill="#9CA3AF" font-family="Inter, -apple-system, BlinkMacSystemFont, 'SF Pro Display', sans-serif" font-size="${Math.max(24, Math.round(primary * 0.28))}" text-anchor="middle">${safeClaimLink}</text>
</svg>`;
}

export async function ensureClaimRetargetingCreatives(params: {
  profileId: string;
  username: string;
  claimLink: string;
}): Promise<void> {
  const { profileId, username, claimLink } = params;

  try {
    const [profile] = await db
      .select({ settings: creatorProfiles.settings })
      .from(creatorProfiles)
      .where(eq(creatorProfiles.id, profileId))
      .limit(1);

    if (!profile) return;

    const existing = getClaimRetargetingState(
      (profile.settings as Record<string, unknown> | null | undefined) ?? {}
    );

    if (
      existing.claimLink === claimLink &&
      existing.username === username &&
      hasAllCreativeSizes(existing.creatives)
    ) {
      return;
    }

    const { put } = await import('@vercel/blob');
    const token = env.BLOB_READ_WRITE_TOKEN;
    if (!token) {
      logger.warn(
        '[Retargeting] Skipping creative upload: BLOB_READ_WRITE_TOKEN missing'
      );
      return;
    }

    const claimHash = crypto
      .createHash('sha256')
      .update(claimLink)
      .digest('hex')
      .slice(0, 12);

    const creatives: Record<string, string> = {};

    for (const layout of CLAIM_CREATIVE_LAYOUTS) {
      const svg = renderClaimCreativeSvg({
        username,
        claimLink,
        width: layout.width,
        height: layout.height,
      });

      const path = `retargeting/claim-profile/${username}/${layout.key}-${layout.width}x${layout.height}-${claimHash}.svg`;

      const blob = await put(path, Buffer.from(svg, 'utf8'), {
        token,
        access: 'public',
        contentType: 'image/svg+xml',
        addRandomSuffix: false,
        cacheControlMaxAge: 60 * 60 * 24 * 365,
      });

      creatives[layout.key] = blob.url;
    }

    const currentSettings =
      (profile.settings as Record<string, unknown> | null | undefined) ?? {};

    await db
      .update(creatorProfiles)
      .set({
        settings: {
          ...currentSettings,
          retargeting: {
            ...(typeof currentSettings.retargeting === 'object' &&
            currentSettings.retargeting !== null
              ? (currentSettings.retargeting as Record<string, unknown>)
              : {}),
            claimProfile: {
              claimLink,
              username,
              generatedAt: new Date().toISOString(),
              creatives,
            },
          },
        },
      })
      .where(eq(creatorProfiles.id, profileId));
  } catch (error) {
    logger.error('[Retargeting] Failed to ensure claim creatives', {
      profileId,
      username,
      error,
    });
  }
}
