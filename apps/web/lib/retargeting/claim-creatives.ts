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

export function renderClaimCreativeSvg(params: {
  username: string;
  claimLink: string;
  width: number;
  height: number;
}): string {
  const { username, width, height } = params;

  // Clean all-white Apple style
  const bg = '#FFFFFF';
  const text = '#1D1D1F';
  const textMuted = '#86868B';
  const buttonBg = '#000000';
  const buttonText = '#FFFFFF';

  const isLandscape = width > height;
  const isStory = height >= 1920;

  // Dynamic sizing based on dimensions
  const baseScale = Math.min(width, height);
  const headlineSize = Math.round(baseScale * 0.08);
  const handleSize = Math.round(baseScale * 0.045);
  const logoSize = Math.round(baseScale * 0.03);

  const ctaWidth = Math.round(baseScale * 0.45);
  const ctaHeight = Math.round(baseScale * 0.09);
  const ctaTextSize = Math.round(ctaHeight * 0.35);

  const ctaX = Math.round((width - ctaWidth) / 2);
  const ctaY = Math.round(height * (isLandscape ? 0.75 : 0.65));

  const safeUsername = escapeXml(username);
  const title = `jov.ie/${safeUsername}`;

  // Font stack matching route.tsx
  const fontStack =
    '"SF Pro Display", "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <rect width="100%" height="100%" fill="${bg}" />
  
  <!-- Subtle Logo -->
  <text x="50%" y="${isStory ? '10%' : '15%'}" fill="${textMuted}" font-family="${fontStack}" font-size="${logoSize}" font-weight="600" text-anchor="middle" letter-spacing="-0.02em">Jovie</text>
  
  <!-- Content Block -->
  <g transform="translate(0, ${isLandscape ? -20 : 0})">
    <text x="50%" y="42%" fill="${text}" font-family="${fontStack}" font-size="${headlineSize}" font-weight="700" text-anchor="middle" letter-spacing="-0.04em">Don't lose your handle.</text>
    <text x="50%" y="${42 + (isLandscape ? 12 : 7)}%" fill="${textMuted}" font-family="${fontStack}" font-size="${handleSize}" font-weight="500" text-anchor="middle" letter-spacing="-0.02em">${title}</text>
  </g>

  <!-- CTA Button -->
  <rect x="${ctaX}" y="${ctaY}" width="${ctaWidth}" height="${ctaHeight}" rx="999" fill="${buttonBg}"/>
  <text x="50%" y="${ctaY + Math.round(ctaHeight * 0.6)}" fill="${buttonText}" font-family="${fontStack}" font-size="${ctaTextSize}" font-weight="600" text-anchor="middle" letter-spacing="-0.01em">Claim your profile</text>
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
