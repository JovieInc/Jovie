import { z } from 'zod';
import { parseMarkdownFrontmatter } from '@/lib/docs/parseMarkdownFrontmatter';

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const DATE_TIME_PATTERN =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/;
const PUBLIC_BLOG_ASSET_PATTERN =
  /^\/images\/blog\/[a-z0-9][a-z0-9._/-]*\.(?:avif|gif|jpe?g|png|svg|webp)$/i;
const INTERNAL_PROFILE_PATTERN = /^\/[a-z0-9]+(?:[/-][a-z0-9]+)*$/;

function isValidCalendarDate(value: string): boolean {
  if (!DATE_PATTERN.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return (
    !Number.isNaN(parsed.valueOf()) &&
    parsed.toISOString().slice(0, 10) === value
  );
}

export function blogPublicationTimestamp(value: string): number {
  if (isValidCalendarDate(value)) {
    return new Date(`${value}T00:00:00.000Z`).valueOf();
  }
  if (!DATE_TIME_PATTERN.test(value)) return Number.NaN;
  return new Date(value).valueOf();
}

function isValidPublicationDate(value: string): boolean {
  return !Number.isNaN(blogPublicationTimestamp(value));
}

function isSafeAuthorProfile(value: string): boolean {
  if (INTERNAL_PROFILE_PATTERN.test(value) && !value.includes('..')) {
    return true;
  }
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password;
  } catch {
    return false;
  }
}

function parseTags(value: string): string[] {
  return value
    .split(',')
    .map(tag => tag.trim())
    .filter(Boolean);
}

const PublicationDate = z
  .string()
  .trim()
  .min(1, 'date is required')
  .refine(
    isValidPublicationDate,
    'date must be a valid ISO YYYY-MM-DD date or timezone-qualified timestamp'
  );

export const BlogSourceMetadataSchema = z
  .strictObject({
    id: z.string().regex(SLUG_PATTERN, 'must be stable lowercase kebab-case'),
    slug: z
      .string()
      .regex(SLUG_PATTERN, 'must be a canonical lowercase kebab-case slug'),
    title: z.string().trim().min(1, 'title is required').max(160),
    description: z
      .string()
      .trim()
      .min(20, 'description must be 20-200 characters')
      .max(200, 'description must be 20-200 characters'),
    date: PublicationDate,
    updatedDate: PublicationDate.optional(),
    author: z.string().trim().min(1, 'author is required').max(100),
    authorUsername: z.string().regex(SLUG_PATTERN).optional(),
    authorTitle: z.string().trim().min(1).max(120).optional(),
    authorProfile: z
      .string()
      .trim()
      .refine(
        isSafeAuthorProfile,
        'authorProfile must be an internal path or an HTTPS URL'
      )
      .optional(),
    category: z.string().trim().min(1, 'category is required').max(80),
    tags: z
      .string()
      .transform(parseTags)
      .refine(tags => tags.length > 0, 'tags must contain at least one value')
      .refine(
        tags =>
          new Set(tags.map(tag => tag.toLowerCase())).size === tags.length,
        'tags must not contain duplicates'
      ),
    image: z
      .string()
      .regex(
        PUBLIC_BLOG_ASSET_PATTERN,
        'image must be a safe /images/blog/* public asset path'
      )
      .refine(value => !value.includes('..'), 'image must not traverse paths')
      .optional(),
    imageAlt: z.string().trim().min(1).max(200).optional(),
  })
  .superRefine((metadata, context) => {
    if (metadata.updatedDate) {
      const published = blogPublicationTimestamp(metadata.date);
      const updated = blogPublicationTimestamp(metadata.updatedDate);
      if (updated < published) {
        context.addIssue({
          code: 'custom',
          path: ['updatedDate'],
          message: 'updatedDate must not precede date',
        });
      }
    }
    if (metadata.image && !metadata.imageAlt) {
      context.addIssue({
        code: 'custom',
        path: ['imageAlt'],
        message: 'imageAlt is required when image is used',
      });
    }
    if (metadata.imageAlt && !metadata.image) {
      context.addIssue({
        code: 'custom',
        path: ['image'],
        message: 'image is required when imageAlt is provided',
      });
    }
  });

export type BlogSourceMetadata = z.infer<typeof BlogSourceMetadataSchema>;

export interface ParsedBlogSource {
  readonly content: string;
  readonly metadata: BlogSourceMetadata;
  readonly sourcePath: string;
}

export interface ParseBlogSourceOptions {
  readonly fileSlug: string;
  readonly sourcePath: string;
}

function metadataError(sourcePath: string, issues: readonly string[]): Error {
  return new Error(
    `Invalid blog metadata in ${sourcePath}:\n${issues
      .map(issue => `- ${issue}`)
      .join('\n')}`
  );
}

export function parseBlogSource(
  raw: string,
  options: ParseBlogSourceOptions
): ParsedBlogSource {
  const { content, data } = parseMarkdownFrontmatter(raw, options.sourcePath);
  const parsed = BlogSourceMetadataSchema.safeParse(data);
  if (!parsed.success) {
    throw metadataError(
      options.sourcePath,
      parsed.error.issues.map(issue => {
        const path = issue.path.join('.') || 'frontmatter';
        return `${path}: ${issue.message}`;
      })
    );
  }

  const issues: string[] = [];
  if (!SLUG_PATTERN.test(options.fileSlug)) {
    issues.push('filename must be lowercase kebab-case');
  }
  if (parsed.data.slug !== options.fileSlug) {
    issues.push(
      `slug must match filename "${options.fileSlug}"; intentional changes require an explicit redirect`
    );
  }
  if (issues.length > 0) throw metadataError(options.sourcePath, issues);

  return {
    content,
    metadata: parsed.data,
    sourcePath: options.sourcePath,
  };
}
