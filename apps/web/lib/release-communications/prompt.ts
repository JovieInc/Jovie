import {
  type CustomerChangelogHero,
  isCustomerChangelogPostUrl,
  parseCustomerChangelogHero,
} from '../customer-changelog-hero';
import type { WhatsNewEntry } from '../whats-new';
import {
  type DailyPost,
  RELEASE_COMMUNICATIONS_CONTRACT_VERSION,
  type VerifiedMergeEvent,
} from './index';

export const WHATS_NEW_DAILY_PATH = '/api/whats-new';
export const WHATS_NEW_DAILY_DISMISS_PATH = '/api/whats-new/dismiss';

const SUMMARY_MAX_LENGTH = 140;

/**
 * What an in-app surface presents for one daily post. The post id is the
 * dismissal key: one record per user per post, never per line item.
 */
export interface DailyWhatsNewPrompt {
  readonly contractVersion: typeof RELEASE_COMMUNICATIONS_CONTRACT_VERSION;
  readonly postId: string;
  readonly localDate: string;
  readonly title: string;
  readonly summary: string;
  /** Number of material user-facing entries in the post. */
  readonly materialCount: number;
  readonly hero?: CustomerChangelogHero | null;
  readonly changelogUrl: string;
}

/**
 * Decide whether a daily post earns the in-app prompt.
 *
 * A post appears only when it holds at least one material entry and the user
 * has not dismissed it. Minor-only posts stay in the internal record but never
 * surface; dismissal suppresses the whole post across sessions while the next
 * day's new post presents normally.
 */
export function resolveDailyWhatsNewPrompt(input: {
  readonly post: DailyPost | null;
  readonly dismissed: boolean;
  readonly publishedUpdate?: WhatsNewEntry | null;
  readonly changelogUrl: string;
}): DailyWhatsNewPrompt | null {
  const { post, dismissed, changelogUrl } = input;
  if (!post || dismissed) return null;

  const material = post.entries.filter(entry => entry.material);
  const lead = material[0];
  if (!lead) return null;

  const published = input.publishedUpdate;
  const matchesPublished =
    published?.id === post.localDate &&
    published.title === lead.title &&
    isCustomerChangelogPostUrl(published.url, published.id);
  const hero = matchesPublished
    ? parseCustomerChangelogHero(published.hero, post.localDate)
    : null;
  const summary = lead.body?.trim().slice(0, SUMMARY_MAX_LENGTH) ?? '';
  return {
    contractVersion: RELEASE_COMMUNICATIONS_CONTRACT_VERSION,
    postId: post.id,
    localDate: post.localDate,
    title: lead.title,
    summary:
      summary ||
      (material.length > 1 ? `${material.length} updates` : 'New today'),
    materialCount: material.length,
    hero,
    changelogUrl: matchesPublished ? published.url : changelogUrl,
  };
}

/** Validate an untrusted prompt payload; malformed reads as "nothing new". */
export function parseDailyWhatsNewPrompt(
  value: unknown
): DailyWhatsNewPrompt | null {
  const prompt =
    value && typeof value === 'object'
      ? (value as Record<string, unknown>).prompt
      : null;
  if (!prompt || typeof prompt !== 'object') return null;
  const record = prompt as Record<string, unknown>;
  if (record.contractVersion !== RELEASE_COMMUNICATIONS_CONTRACT_VERSION)
    return null;
  if (typeof record.postId !== 'string' || record.postId.length === 0)
    return null;
  if (typeof record.title !== 'string' || record.title.length === 0)
    return null;
  return {
    contractVersion: RELEASE_COMMUNICATIONS_CONTRACT_VERSION,
    postId: record.postId,
    hero:
      typeof record.localDate === 'string' &&
      typeof record.changelogUrl === 'string' &&
      isCustomerChangelogPostUrl(record.changelogUrl, record.localDate)
        ? parseCustomerChangelogHero(record.hero, record.localDate)
        : null,
    localDate: typeof record.localDate === 'string' ? record.localDate : '',
    title: record.title,
    summary: typeof record.summary === 'string' ? record.summary : '',
    materialCount:
      typeof record.materialCount === 'number' ? record.materialCount : 1,
    changelogUrl:
      typeof record.changelogUrl === 'string' ? record.changelogUrl : '',
  };
}

const MAX_FIELD_LENGTH = 4000;

function boundedText(value: unknown, max = MAX_FIELD_LENGTH): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, max) : null;
}

/**
 * Validate a verified merge-event payload from the merge automation. Only a
 * payload that carries explicit `verified: true` proof and the required
 * identity fields is admitted; anything else is rejected so unverified or
 * malformed events can never create posts.
 */
export function parseVerifiedMergeEvent(
  value: unknown
): VerifiedMergeEvent | null {
  if (!value || typeof value !== 'object') return null;
  const record = value as Record<string, unknown>;
  if (record.verified !== true) return null;

  const repository = boundedText(record.repository, 200);
  const title = boundedText(record.title, 500);
  const mergeSha = boundedText(record.mergeSha, 100);
  const mergedAt = new Date(String(record.mergedAt));
  const pullRequestNumber = Number(record.pullRequestNumber);
  if (
    !repository ||
    !title ||
    !mergeSha ||
    Number.isNaN(mergedAt.getTime()) ||
    !Number.isInteger(pullRequestNumber) ||
    pullRequestNumber <= 0
  ) {
    return null;
  }

  const metadata =
    record.metadata && typeof record.metadata === 'object'
      ? (record.metadata as Record<string, unknown>)
      : {};

  return {
    repository,
    pullRequestNumber,
    mergeSha,
    mergedAt,
    product: boundedText(record.product, 100) ?? 'jovie',
    app: boundedText(record.app, 100) ?? 'web',
    title,
    body: boundedText(record.body),
    url: boundedText(record.url, 1000),
    verified: true,
    material:
      typeof record.material === 'boolean' ? record.material : undefined,
    audienceEligible:
      typeof record.audienceEligible === 'boolean'
        ? record.audienceEligible
        : undefined,
    metadata,
  };
}
