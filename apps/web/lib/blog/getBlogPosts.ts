import { type Dirent, promises as fs } from 'node:fs';
import { join } from 'node:path';
import { cache } from 'react';
import { createMarkdownDocument } from '@/lib/docs/getMarkdownDocument';
import { resolveAppContentPath, resolveAppPath } from '@/lib/filesystem-paths';
import { validatePathTraversal } from '@/lib/security/path-traversal';
import type { MarkdownDocument } from '@/types/docs';
import {
  type BlogSourceMetadata,
  blogPublicationTimestamp,
  parseBlogSource,
} from './metadata';
import type {
  BlogPostMetadata,
  BlogPostSummary,
} from './presentation-contracts';
import {
  BLOG_PUBLICATION_RECORDS,
  BLOG_PUBLICATION_STATES,
  type BlogPublicationRecord,
  isBlogPublicationEligible,
  isBlogPublicationIndexable,
} from './publication';

export { slugifyCategory } from './categories';
export type {
  BlogPostMetadata,
  BlogPostSummary,
} from './presentation-contracts';
export { isBlogPostIndexable } from './publication';

const BLOG_DIRECTORY = resolveAppContentPath('blog');
const PUBLIC_DIRECTORY = resolveAppPath('public');
const PUBLIC_SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export interface BlogPost extends MarkdownDocument, BlogPostMetadata {
  slug: string;
}

export interface BlogCandidate {
  readonly content: string;
  readonly metadata: BlogSourceMetadata;
  readonly publication: BlogPublicationRecord;
  readonly sourcePath: string;
  readonly summary: BlogPostSummary;
}

export interface BlogCatalog {
  readonly candidates: readonly BlogCandidate[];
  readonly publicCandidates: readonly BlogCandidate[];
  readonly publicPosts: readonly BlogPostSummary[];
  readonly indexablePosts: readonly BlogPostSummary[];
}

export interface LoadBlogCatalogOptions {
  readonly directory: string;
  readonly publicDirectory: string;
  readonly publicationRecords?: readonly BlogPublicationRecord[];
  readonly now?: Date;
}

export class BlogPostUnavailableError extends Error {
  readonly code = 'ENOENT';

  constructor(slug: string) {
    super(`Blog post unavailable: ${slug}`);
    this.name = 'BlogPostUnavailableError';
  }
}

export function isBlogPostUnavailableError(
  error: unknown
): error is BlogPostUnavailableError {
  return (
    error instanceof BlogPostUnavailableError ||
    (error instanceof Error &&
      'code' in error &&
      (error as NodeJS.ErrnoException).code === 'ENOENT')
  );
}

/** Count words in Markdown content after removing code blocks and syntax. */
function countWords(content: string): number {
  const text = content
    .replaceAll(/```[\s\S]*?```/g, '')
    .replaceAll(/[#*_`>[\]()!|-]/g, '')
    .trim();
  return text.split(/\s+/).filter(Boolean).length;
}

function calculateReadingTime(wordCount: number): number {
  return Math.max(1, Math.ceil(wordCount / 238));
}

function summaryFromMetadata(
  metadata: BlogSourceMetadata,
  content: string
): BlogPostSummary {
  const words = countWords(content);
  return {
    slug: metadata.slug,
    title: metadata.title,
    date: metadata.date,
    updatedDate: metadata.updatedDate,
    author: metadata.author,
    authorUsername: metadata.authorUsername,
    authorTitle: metadata.authorTitle,
    authorProfile: metadata.authorProfile,
    category: metadata.category,
    tags: metadata.tags,
    image: metadata.image,
    imageAlt: metadata.imageAlt,
    excerpt: metadata.description,
    readingTime: calculateReadingTime(words),
    wordCount: words,
  };
}

function stripHtmlH1Blocks(html: string): string {
  return html.replaceAll(/<h1\b[^>]*>[\s\S]*?<\/h1>/gi, '');
}

function catalogError(issues: readonly string[]): Error {
  return new Error(
    `Blog publication catalog is invalid:\n${issues
      .map(issue => `- ${issue}`)
      .join('\n')}`
  );
}

function publicationRegistryIssues(
  records: readonly BlogPublicationRecord[]
): string[] {
  const issues: string[] = [];
  const ids = new Set<string>();
  const slugs = new Set<string>();
  const allowedStates = new Set<string>(BLOG_PUBLICATION_STATES);

  for (const record of records) {
    if (!PUBLIC_SLUG_PATTERN.test(record.id)) {
      issues.push(`publication record id is invalid: ${record.id}`);
    }
    if (!PUBLIC_SLUG_PATTERN.test(record.slug)) {
      issues.push(`publication record slug is invalid: ${record.slug}`);
    }
    if (ids.has(record.id)) {
      issues.push(`duplicate blog id in publication records: ${record.id}`);
    }
    if (slugs.has(record.slug)) {
      issues.push(`duplicate blog slug in publication records: ${record.slug}`);
    }
    if (!allowedStates.has(record.state)) {
      issues.push(
        `publication record ${record.id} has invalid state: ${record.state}`
      );
    }
    ids.add(record.id);
    slugs.add(record.slug);
  }
  return issues;
}

async function validateAssetReference(
  metadata: BlogSourceMetadata,
  sourcePath: string,
  publicDirectory: string,
  eligible: boolean
): Promise<string[]> {
  if (!metadata.image) return [];
  if (!eligible) {
    return [
      `${sourcePath}: ineligible articles must not reference public assets; use private storage until publication`,
    ];
  }

  const assetPath = validatePathTraversal(
    metadata.image.replace(/^\//, ''),
    publicDirectory
  );
  try {
    await fs.access(assetPath);
    return [];
  } catch {
    return [`${sourcePath}: asset ${metadata.image} does not exist`];
  }
}

export async function loadBlogCatalog(
  options: LoadBlogCatalogOptions
): Promise<BlogCatalog> {
  const records = options.publicationRecords ?? BLOG_PUBLICATION_RECORDS;
  const now = options.now ?? new Date();
  const issues = publicationRegistryIssues(records);

  let entries: Dirent[];
  try {
    entries = await fs.readdir(options.directory, { withFileTypes: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    entries = [];
  }

  const sourceEntries = entries
    .filter(entry => entry.isFile() && entry.name.endsWith('.md'))
    .sort((left, right) => left.name.localeCompare(right.name));
  const parsedSources: Array<{
    readonly content: string;
    readonly metadata: BlogSourceMetadata;
    readonly sourcePath: string;
  }> = [];

  for (const entry of sourceEntries) {
    const sourcePath = join(options.directory, entry.name);
    const fileSlug = entry.name.slice(0, -3);
    try {
      const raw = await fs.readFile(sourcePath, 'utf8');
      parsedSources.push(parseBlogSource(raw, { fileSlug, sourcePath }));
    } catch (error) {
      issues.push(error instanceof Error ? error.message : String(error));
    }
  }

  const sourceIds = new Set<string>();
  const sourceSlugs = new Set<string>();
  const candidates: BlogCandidate[] = [];

  for (const source of parsedSources) {
    const { metadata, sourcePath } = source;
    if (sourceIds.has(metadata.id)) {
      issues.push(`${sourcePath}: duplicate blog id ${metadata.id}`);
    }
    if (sourceSlugs.has(metadata.slug)) {
      issues.push(`${sourcePath}: duplicate blog slug ${metadata.slug}`);
    }
    sourceIds.add(metadata.id);
    sourceSlugs.add(metadata.slug);

    const publication = records.find(record => record.id === metadata.id);
    if (!publication) {
      issues.push(`${sourcePath}: no publication record for ${metadata.id}`);
      continue;
    }
    if (publication.slug !== metadata.slug) {
      issues.push(
        `${sourcePath}: publication record slug ${publication.slug} does not match canonical slug ${metadata.slug}`
      );
      continue;
    }

    const eligible = isBlogPublicationEligible(metadata, publication, now);
    if (
      (publication.state === 'noindex' || publication.state === 'indexed') &&
      blogPublicationTimestamp(metadata.date) > now.valueOf()
    ) {
      issues.push(
        `${sourcePath}: future-dated article cannot use public state ${publication.state}; keep it embargoed or shadow until a build promoted at or after ${metadata.date}`
      );
    }
    issues.push(
      ...(await validateAssetReference(
        metadata,
        sourcePath,
        options.publicDirectory,
        eligible
      ))
    );
    candidates.push({
      ...source,
      publication,
      summary: summaryFromMetadata(metadata, source.content),
    });
  }

  for (const record of records) {
    if (!sourceIds.has(record.id)) {
      issues.push(
        `publication record ${record.id} references missing Markdown source`
      );
    }
  }

  if (issues.length > 0) throw catalogError(issues);

  const byPublicationDate = (left: BlogCandidate, right: BlogCandidate) => {
    const dateDifference =
      blogPublicationTimestamp(right.metadata.date) -
      blogPublicationTimestamp(left.metadata.date);
    return (
      dateDifference || left.metadata.slug.localeCompare(right.metadata.slug)
    );
  };
  const sortedCandidates = [...candidates].sort(byPublicationDate);
  const publicCandidates = sortedCandidates.filter(candidate =>
    isBlogPublicationEligible(candidate.metadata, candidate.publication, now)
  );
  const indexableCandidates = publicCandidates.filter(candidate =>
    isBlogPublicationIndexable(candidate.publication)
  );

  return {
    candidates: sortedCandidates,
    publicCandidates,
    publicPosts: publicCandidates.map(candidate => candidate.summary),
    indexablePosts: indexableCandidates.map(candidate => candidate.summary),
  };
}

export function getPublicBlogCandidate(
  catalog: BlogCatalog,
  slug: string
): BlogCandidate {
  if (!PUBLIC_SLUG_PATTERN.test(slug)) {
    throw new BlogPostUnavailableError(slug);
  }
  const candidate = catalog.publicCandidates.find(
    entry => entry.metadata.slug === slug
  );
  if (!candidate) throw new BlogPostUnavailableError(slug);
  return candidate;
}

const getProductionBlogCatalog = cache(() =>
  loadBlogCatalog({
    directory: BLOG_DIRECTORY,
    publicDirectory: PUBLIC_DIRECTORY,
    publicationRecords: BLOG_PUBLICATION_RECORDS,
  })
);

async function materializeBlogPost(
  candidate: BlogCandidate
): Promise<BlogPost> {
  const doc = await createMarkdownDocument(candidate.content);
  return {
    ...candidate.summary,
    ...doc,
    html: stripHtmlH1Blocks(doc.html),
    toc: doc.toc.filter(entry => entry.level !== 1),
  };
}

export const getBlogPost = cache(async (slug: string): Promise<BlogPost> => {
  const catalog = await getProductionBlogCatalog();
  return materializeBlogPost(getPublicBlogCandidate(catalog, slug));
});

export const getBlogPosts = cache(async (): Promise<BlogPostSummary[]> => {
  const catalog = await getProductionBlogCatalog();
  return [...catalog.publicPosts];
});

export const getBlogPostSlugs = cache(async (): Promise<string[]> => {
  const catalog = await getProductionBlogCatalog();
  return catalog.publicCandidates.map(candidate => candidate.metadata.slug);
});

/** Get related eligible posts by category match, then by recency. */
export async function getRelatedPosts(
  slug: string,
  category?: string,
  limit = 2
): Promise<BlogPostSummary[]> {
  const allPosts = await getBlogPosts();
  const otherPosts = allPosts.filter(post => post.slug !== slug);
  const sameCategoryPosts = category
    ? otherPosts.filter(post => post.category === category)
    : [];
  const remainingPosts = otherPosts.filter(
    post => !sameCategoryPosts.includes(post)
  );
  return [...sameCategoryPosts, ...remainingPosts].slice(0, limit);
}
