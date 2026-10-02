import { type BlogSourceMetadata, blogPublicationTimestamp } from './metadata';

export const BLOG_PUBLICATION_STATES = [
  'draft',
  'embargoed',
  'shadow',
  'noindex',
  'indexed',
  'withdrawn',
] as const;

export type BlogPublicationState = (typeof BLOG_PUBLICATION_STATES)[number];

/**
 * Publication authority is intentionally separate from article frontmatter.
 * Article authors can propose content metadata, but cannot self-authorize a
 * route, indexing, or certification by adding fields to Markdown.
 */
export interface BlogPublicationRecord {
  readonly id: string;
  readonly slug: string;
  readonly state: BlogPublicationState;
}

export const BLOG_PUBLICATION_RECORDS: readonly BlogPublicationRecord[] = [
  {
    id: 'the-contact-problem',
    slug: 'the-contact-problem',
    state: 'indexed',
  },
  {
    id: 'the-friday-problem',
    slug: 'the-friday-problem',
    state: 'indexed',
  },
  {
    id: 'the-myspace-problem',
    slug: 'the-myspace-problem',
    state: 'indexed',
  },
  {
    id: 'the-suno-playbook-teardown',
    slug: 'the-suno-playbook-teardown',
    state: 'indexed',
  },
];

export function isBlogPublicationEligible(
  metadata: Pick<BlogSourceMetadata, 'date'>,
  record: BlogPublicationRecord,
  now: Date
): boolean {
  if (record.state !== 'noindex' && record.state !== 'indexed') return false;
  return blogPublicationTimestamp(metadata.date) <= now.valueOf();
}

export function isBlogPublicationIndexable(
  record: Pick<BlogPublicationRecord, 'state'>
): boolean {
  return record.state === 'indexed';
}

export function getBlogPublicationRecord(
  slug: string,
  records: readonly BlogPublicationRecord[] = BLOG_PUBLICATION_RECORDS
): BlogPublicationRecord | undefined {
  return records.find(record => record.slug === slug);
}

export function isBlogPostIndexable(slug: string): boolean {
  const record = getBlogPublicationRecord(slug);
  return record ? isBlogPublicationIndexable(record) : false;
}
