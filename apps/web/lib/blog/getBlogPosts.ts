import { type Dirent, promises as fs } from 'node:fs';
import { cache } from 'react';
import { createMarkdownDocument } from '@/lib/docs/getMarkdownDocument';
import { parseMarkdownFrontmatter } from '@/lib/docs/parseMarkdownFrontmatter';
import { resolveAppContentPath } from '@/lib/filesystem-paths';
import { validatePathTraversal } from '@/lib/security/path-traversal';
import type { MarkdownDocument } from '@/types/docs';

const BLOG_DIRECTORY = resolveAppContentPath('blog');

export interface BlogPostMetadata {
  title: string;
  date: string;
  updatedDate?: string;
  author: string;
  authorUsername?: string;
  authorTitle?: string;
  authorProfile?: string;
  category?: string;
  tags: string[];
  excerpt: string;
  readingTime: number;
  wordCount: number;
}

export interface BlogPost extends MarkdownDocument, BlogPostMetadata {
  slug: string;
}

export interface BlogPostSummary extends BlogPostMetadata {
  slug: string;
}

const DEFAULT_AUTHOR = 'Jovie';

/** Count words in markdown content (strips frontmatter, code blocks, and syntax) */
function countWords(content: string): number {
  const text = content
    .replaceAll(/^---[\s\S]*?---/g, '') // strip frontmatter
    .replaceAll(/```[\s\S]*?```/g, '') // strip code blocks
    .replaceAll(/[#*_`>[\]()!|-]/g, '') // strip markdown syntax
    .trim();
  return text.split(/\s+/).filter(Boolean).length;
}

/** Calculate reading time in minutes (238 WPM average) */
function calculateReadingTime(wordCount: number): number {
  return Math.max(1, Math.ceil(wordCount / 238));
}

/** Parse comma-separated tags from frontmatter string */
function parseTags(tagsString?: string): string[] {
  if (!tagsString) return [];
  return tagsString
    .split(',')
    .map(tag => tag.trim())
    .filter(Boolean);
}

/** Slugify a category name for URL use */
export function slugifyCategory(category: string): string {
  return category
    .toLowerCase()
    .replaceAll(/[^a-z0-9\s-]/g, '')
    .replaceAll(/\s+/g, '-')
    .replaceAll(/-+/g, '-')
    .replaceAll(/^-|-$/g, '');
}

/** Get related posts by category match, then by recency */
export async function getRelatedPosts(
  slug: string,
  category?: string,
  limit = 2
): Promise<BlogPostSummary[]> {
  const allPosts = await getBlogPosts();
  const otherPosts = allPosts.filter(p => p.slug !== slug);

  if (otherPosts.length === 0) return [];

  // Prioritize same category, then by date
  const sameCategoryPosts = category
    ? otherPosts.filter(p => p.category === category)
    : [];
  const remainingPosts = otherPosts.filter(p => !sameCategoryPosts.includes(p));

  return [...sameCategoryPosts, ...remainingPosts].slice(0, limit);
}

function createExcerpt(content: string): string {
  const safeContent = content.slice(0, 20000);
  const blocks = safeContent
    .split(/\n\s*\n/)
    .map(block => block.trim())
    .filter(Boolean);

  const paragraph =
    blocks.find(block => !block.startsWith('#')) ?? blocks[0] ?? '';

  return paragraph
    .replaceAll(/^#+\s*/g, '')
    .replaceAll(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replaceAll(/[*_`>]/g, '')
    .replaceAll(/\s+/g, ' ')
    .trim()
    .slice(0, 200);
}

function formatTitleFromSlug(slug: string): string {
  return slug
    .split('-')
    .map(segment => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(' ');
}

function stripHtmlH1Blocks(html: string): string {
  return html.replaceAll(/<h1\b[^>]*>[\s\S]*?<\/h1>/gi, '');
}

async function readBlogPostFile(slug: string): Promise<{
  content: string;
  data: Record<string, string>;
}> {
  // Validate path to prevent directory traversal attacks
  const safePath = validatePathTraversal(`${slug}.md`, BLOG_DIRECTORY);
  const raw = await fs.readFile(safePath, 'utf-8');
  return parseMarkdownFrontmatter(raw);
}

async function loadBlogPost(slug: string): Promise<BlogPost> {
  const { content, data } = await readBlogPostFile(slug);
  const doc = await createMarkdownDocument(content);
  const excerpt = createExcerpt(content);
  const words = countWords(content);
  const html = stripHtmlH1Blocks(doc.html);
  const toc = doc.toc.filter(entry => entry.level !== 1);

  return {
    slug,
    title: data.title ?? formatTitleFromSlug(slug),
    date: data.date ?? new Date().toISOString().split('T')[0],
    updatedDate: data.updatedDate,
    author: data.author ?? DEFAULT_AUTHOR,
    authorUsername: data.authorUsername,
    authorTitle: data.authorTitle,
    authorProfile: data.authorProfile,
    category: data.category,
    tags: parseTags(data.tags),
    excerpt,
    readingTime: calculateReadingTime(words),
    wordCount: words,
    ...doc,
    html,
    toc,
  };
}

export const getBlogPost = cache(async (slug: string) => {
  return loadBlogPost(slug);
});

export const getBlogPosts = cache(async (): Promise<BlogPostSummary[]> => {
  let entries: Dirent[];
  try {
    entries = await fs.readdir(BLOG_DIRECTORY, { withFileTypes: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw error;
  }

  const slugs = entries
    .filter(entry => entry.isFile() && entry.name.endsWith('.md'))
    .map(entry => entry.name.slice(0, -3));

  const posts = await Promise.all(
    slugs.map(async slug => {
      const { content, data } = await readBlogPostFile(slug);
      const words = countWords(content);
      return {
        slug,
        title: data.title ?? formatTitleFromSlug(slug),
        date: data.date ?? new Date().toISOString().split('T')[0],
        updatedDate: data.updatedDate,
        author: data.author ?? DEFAULT_AUTHOR,
        authorUsername: data.authorUsername,
        authorTitle: data.authorTitle,
        authorProfile: data.authorProfile,
        category: data.category,
        tags: parseTags(data.tags),
        excerpt: createExcerpt(content),
        readingTime: calculateReadingTime(words),
        wordCount: words,
      };
    })
  );

  // Sort by date descending (newest first)
  return posts.sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
  );
});

export const getBlogPostSlugs = cache(async (): Promise<string[]> => {
  let entries: Dirent[];
  try {
    entries = await fs.readdir(BLOG_DIRECTORY, { withFileTypes: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw error;
  }
  return entries
    .filter(entry => entry.isFile() && entry.name.endsWith('.md'))
    .map(entry => entry.name.slice(0, -3));
});
