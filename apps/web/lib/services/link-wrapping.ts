/**
 * Link Wrapping Service with Anti-Cloaking Protection
 * Handles creation and management of wrapped links
 */

import { and, sql as drizzleSql, eq, lt } from 'drizzle-orm';
import { withDbSession } from '@/lib/auth/session';
import { db } from '@/lib/db';
import { wrappedLinks } from '@/lib/db/schema/links';
import { captureError } from '@/lib/error-tracking';
import {
  categorizeDomain,
  getCrawlerSafeLabel,
} from '@/lib/utils/domain-categorizer';
import {
  extractDomain,
  generateShortId,
  isValidUrl,
  simpleDecryptUrl,
  simpleEncryptUrl,
} from '@/lib/utils/url-encryption';

export interface WrappedLink {
  id: string;
  shortId: string;
  originalUrl: string;
  kind: 'normal' | 'sensitive';
  domain: string;
  category?: string;
  titleAlias?: string;
  clickCount: number;
  createdAt: string;
  expiresAt?: string;
}

export interface CreateWrappedLinkOptions {
  url: string;
  userId?: string;
  expiresInHours?: number;
  customAlias?: string;
}

export interface LinkStats {
  totalClicks: number;
  normalLinks: number;
  sensitiveLinks: number;
  topDomains: Array<{ domain: string; count: number }>;
}

/**
 * Helper to construct WrappedLink object from database record.
 * Eliminates duplication in link object construction.
 */
function buildWrappedLinkFromRecord(
  data: typeof wrappedLinks.$inferSelect,
  originalUrl: string
): WrappedLink {
  return {
    id: data.id,
    shortId: data.shortId,
    originalUrl,
    kind: data.kind as 'normal' | 'sensitive',
    domain: data.domain,
    category: data.category || undefined,
    titleAlias: data.titleAlias || undefined,
    clickCount: data.clickCount || 0,
    createdAt: data.createdAt.toISOString(),
    expiresAt: data.expiresAt?.toISOString() || undefined,
  };
}

/**
 * Creates a new wrapped link with anti-cloaking protection
 */
export async function createWrappedLink(
  options: CreateWrappedLinkOptions
): Promise<WrappedLink | null> {
  const { url, userId, expiresInHours, customAlias } = options;

  if (!isValidUrl(url)) {
    throw new TypeError('Invalid URL provided');
  }

  const domain = extractDomain(url);
  const category = await categorizeDomain(url);

  // Generate unique short ID
  let shortId = customAlias || generateShortId();
  let expiresAt: Date | null = null;

  const createRecord = async () => {
    // Ensure short ID is unique
    let attempts = 0;
    while (attempts < 5) {
      const [existing] = await db
        .select({ id: wrappedLinks.id })
        .from(wrappedLinks)
        .where(eq(wrappedLinks.shortId, shortId))
        .limit(1);

      if (!existing) break;

      shortId = generateShortId();
      attempts++;
    }

    if (attempts >= 5) {
      throw new Error('Failed to generate unique short ID');
    }

    // Encrypt URL for storage
    const encryptedUrl = simpleEncryptUrl(url);

    // Calculate expiration
    expiresAt = expiresInHours
      ? new Date(Date.now() + expiresInHours * 60 * 60 * 1000)
      : null;

    // Create wrapped link record
    const [data] = await db
      .insert(wrappedLinks)
      .values({
        shortId,
        encryptedUrl,
        kind: category.kind,
        domain,
        category: category.category || null,
        titleAlias: category.alias || getCrawlerSafeLabel(domain),
        createdBy: userId || null,
        expiresAt,
      })
      .returning();

    if (!data) {
      captureError('Failed to create wrapped link: no data returned', null, {
        shortId,
        domain,
      });
      return null;
    }

    return buildWrappedLinkFromRecord(data, url);
  };

  try {
    const result = userId
      ? await withDbSession(async () => createRecord(), {
          clerkUserId: userId,
        })
      : await createRecord();

    return result;
  } catch (error) {
    captureError('Link wrapping service error', error, { url, userId });
    return null;
  }
}

/**
 * Retrieves a wrapped link by short ID
 */
export async function getWrappedLink(
  shortId: string
): Promise<WrappedLink | null> {
  try {
    // Add timeout to prevent hanging on database issues
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error('Database timeout')), 5000); // 5 second timeout
    });

    const [data] = await Promise.race([
      db
        .select()
        .from(wrappedLinks)
        .where(eq(wrappedLinks.shortId, shortId))
        .limit(1),
      timeoutPromise,
    ]);

    if (!data) {
      return null;
    }

    // Check if link has expired
    if (data.expiresAt && new Date(data.expiresAt) < new Date()) {
      return null;
    }

    // Decrypt URL
    const originalUrl = simpleDecryptUrl(data.encryptedUrl);

    return buildWrappedLinkFromRecord(data, originalUrl);
  } catch (error: unknown) {
    captureError('Failed to get wrapped link', error, { shortId });
    return null;
  }
}

/**
 * Increments click count for a wrapped link
 */
export async function incrementClickCount(shortId: string): Promise<boolean> {
  try {
    await db
      .update(wrappedLinks)
      .set({
        clickCount: drizzleSql`${wrappedLinks.clickCount} + 1`,
      })
      .where(eq(wrappedLinks.shortId, shortId));

    return true;
  } catch (error) {
    captureError('Failed to increment click count', error, { shortId });
    return false;
  }
}

/**
 * Gets link statistics for analytics
 */
export async function getLinkStats(userId?: string): Promise<LinkStats> {
  try {
    const fetchLinks = async () => {
      return await db
        .select()
        .from(wrappedLinks)
        .where(userId ? eq(wrappedLinks.createdBy, userId) : undefined)
        .limit(1000);
    };

    const data = userId
      ? await withDbSession(async () => fetchLinks(), {
          clerkUserId: userId,
        })
      : await fetchLinks();

    const totalClicks = data.reduce(
      (sum, link) => sum + (link.clickCount || 0),
      0
    );
    const normalLinks = data.filter(link => link.kind === 'normal').length;
    const sensitiveLinks = data.filter(
      link => link.kind === 'sensitive'
    ).length;

    // Calculate top domains
    const domainCounts: Record<string, number> = {};
    data.forEach(link => {
      domainCounts[link.domain] =
        (domainCounts[link.domain] || 0) + (link.clickCount || 0);
    });

    const topDomains = Object.entries(domainCounts)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 10)
      .map(([domain, count]) => ({ domain, count }));

    return {
      totalClicks,
      normalLinks,
      sensitiveLinks,
      topDomains,
    };
  } catch (error) {
    captureError('Failed to get link stats', error, { userId });
    return {
      totalClicks: 0,
      normalLinks: 0,
      sensitiveLinks: 0,
      topDomains: [],
    };
  }
}

/**
 * Deletes expired links (cleanup function)
 */
export async function cleanupExpiredLinks(): Promise<number> {
  try {
    const deleted = await db
      .delete(wrappedLinks)
      .where(lt(wrappedLinks.expiresAt, new Date()))
      .returning({ id: wrappedLinks.id });

    return deleted.length;
  } catch (error) {
    captureError('Failed to cleanup expired links', error);
    return 0;
  }
}

/**
 * Batch creates wrapped links for multiple URLs
 */
export async function createWrappedLinksBatch(
  urls: string[],
  userId?: string
): Promise<WrappedLink[]> {
  const results: WrappedLink[] = [];

  for (const url of urls) {
    try {
      const wrappedLink = await createWrappedLink({ url, userId });
      if (wrappedLink) {
        results.push(wrappedLink);
      }
    } catch (error) {
      captureError('Failed to wrap URL in batch', error, { url, userId });
    }
  }

  return results;
}

/**
 * Updates a wrapped link's metadata
 */
export async function updateWrappedLink(
  shortId: string,
  updates: Partial<Pick<WrappedLink, 'titleAlias' | 'expiresAt'>>,
  userId?: string
): Promise<boolean> {
  try {
    const updateData: Partial<typeof wrappedLinks.$inferInsert> = {};
    if (updates.titleAlias !== undefined)
      updateData.titleAlias = updates.titleAlias;
    if (updates.expiresAt !== undefined)
      updateData.expiresAt = updates.expiresAt
        ? new Date(updates.expiresAt)
        : null;

    if (Object.keys(updateData).length === 0) return true;

    const conditions = [eq(wrappedLinks.shortId, shortId)];
    if (userId) {
      conditions.push(eq(wrappedLinks.createdBy, userId));
    }

    await db
      .update(wrappedLinks)
      .set(updateData)
      .where(and(...conditions));

    return true;
  } catch (error) {
    captureError('Failed to update wrapped link', error, { shortId, updates });
    return false;
  }
}

/**
 * Deletes a single wrapped link by shortId.
 * Optionally scoped to a specific user for ownership verification.
 */
export async function deleteWrappedLink(
  shortId: string,
  userId?: string
): Promise<boolean> {
  try {
    const conditions = [eq(wrappedLinks.shortId, shortId)];
    if (userId) {
      conditions.push(eq(wrappedLinks.createdBy, userId));
    }

    const deleted = await db
      .delete(wrappedLinks)
      .where(and(...conditions))
      .returning({ id: wrappedLinks.id });

    return deleted.length > 0;
  } catch (error) {
    captureError('Failed to delete wrapped link', error, { shortId, userId });
    return false;
  }
}
