import { promises as fs } from 'node:fs';
import path from 'node:path';
import { cache } from 'react';
import { createMarkdownDocument } from '@/lib/docs/getMarkdownDocument';
import { parseMarkdownFrontmatter } from '@/lib/docs/parseMarkdownFrontmatter';
import { validatePathTraversal } from '@/lib/security/path-traversal';
import type { MarkdownDocument } from '@/types/docs';

const BLOG_DIRECTORY = path.join(process.cwd(), 'content', 'blog');

export interface BlogPostMetadata {
  title: string;
  date: string;
  author: string;
  authorTitle?: string;
  authorProfile?: string;
  category?: string;
  excerpt: string;
}

export interface BlogPost extends MarkdownDocument, BlogPostMetadata {
  slug: string;
}

export interface BlogPostSummary extends BlogPostMetadata {
  slug: string;
}

const DEFAULT_AUTHOR = 'Jovie';

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
    .replaceAll(/\[(.*?)\]\(.*?\)/g, '$1')
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

  return {
    slug,
    title: data.title ?? formatTitleFromSlug(slug),
    date: data.date ?? new Date().toISOString().split('T')[0],
    author: data.author ?? DEFAULT_AUTHOR,
    authorTitle: data.authorTitle,
    authorProfile: data.authorProfile,
    category: data.category,
    excerpt,
    ...doc,
  };
}

export const getBlogPost = cache(async (slug: string) => {
  return loadBlogPost(slug);
});

export const getBlogPosts = cache(async (): Promise<BlogPostSummary[]> => {
  const entries = await fs.readdir(BLOG_DIRECTORY, { withFileTypes: true });

  const slugs = entries
    .filter(entry => entry.isFile() && entry.name.endsWith('.md'))
    .map(entry => entry.name.replace(/\.md$/, ''));

  const posts = await Promise.all(
    slugs.map(async slug => {
      const { content, data } = await readBlogPostFile(slug);
      return {
        slug,
        title: data.title ?? formatTitleFromSlug(slug),
        date: data.date ?? new Date().toISOString().split('T')[0],
        author: data.author ?? DEFAULT_AUTHOR,
        authorTitle: data.authorTitle,
        authorProfile: data.authorProfile,
        category: data.category,
        excerpt: createExcerpt(content),
      };
    })
  );

  // Sort by date descending (newest first)
  return posts.sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
  );
});

export const getBlogPostSlugs = cache(async (): Promise<string[]> => {
  const entries = await fs.readdir(BLOG_DIRECTORY, { withFileTypes: true });
  return entries
    .filter(entry => entry.isFile() && entry.name.endsWith('.md'))
    .map(entry => entry.name.replace(/\.md$/, ''));
});
