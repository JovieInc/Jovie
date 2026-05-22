import { promises as fs } from 'node:fs';
import path from 'node:path';
import { cache } from 'react';
import {
  applyMarkdownTemplate,
  createMarkdownDocument,
} from '@/lib/docs/getMarkdownDocument';
import { resolveAppContentPath } from '@/lib/filesystem-paths';
import type { TocEntry as DocsTocEntry, MarkdownDocument } from '@/types/docs';

const LEGAL_DOCS = {
  privacy: {
    title: 'Privacy Policy',
    practicalSummary:
      'We collect only what is essential, guard it with modern controls, and keep you in the loop about every change.',
    file: path.join('legal', 'privacy.md'),
  },
  terms: {
    title: 'Terms of Service',
    practicalSummary:
      'Jovie is governed by clear policies for accounts, content, subscriptions, acceptable use, and dispute resolution.',
    file: path.join('legal', 'terms.md'),
  },
  cookies: {
    title: 'Cookie Policy',
    practicalSummary:
      'This document explains the cookies Jovie uses, why they are used, and how to manage your preferences.',
    file: path.join('legal', 'cookies.md'),
  },
  dmca: {
    title: 'DMCA Policy',
    practicalSummary:
      'This document explains how to report copyright infringement and how counter-notices are handled.',
    file: path.join('legal', 'dmca.md'),
  },
} as const;

export type LegalDocumentSlug = keyof typeof LEGAL_DOCS;

export type TocEntry = DocsTocEntry;

export interface LegalDocument extends MarkdownDocument {
  slug: LegalDocumentSlug;
  title: string;
  lastUpdated: string;
  practicalSummary: string;
}

interface ParsedLegalMarkdown {
  readonly body: string;
  readonly title: string;
  readonly lastUpdated: string;
}

const TITLE_PREFIX = '## ';
const LAST_UPDATED_PREFIX = '_Last updated:';

function parseLegalTitle(line: string, fallbackTitle: string): string | null {
  const trimmedLine = line.trim();
  if (!trimmedLine.startsWith(TITLE_PREFIX)) return null;

  return trimmedLine.slice(TITLE_PREFIX.length).trim() || fallbackTitle;
}

function parseLastUpdated(line: string): string | null {
  const trimmedLine = line.trim();
  if (
    !trimmedLine.startsWith(LAST_UPDATED_PREFIX) ||
    !trimmedLine.endsWith('_')
  ) {
    return null;
  }

  return trimmedLine.slice(LAST_UPDATED_PREFIX.length, -1).trim();
}

function parseLegalMarkdown(
  raw: string,
  fallbackTitle: string
): ParsedLegalMarkdown {
  const lines = applyMarkdownTemplate(raw).trimStart().split('\n');
  const parsedTitle = parseLegalTitle(lines[0] ?? '', fallbackTitle);
  const title = parsedTitle ?? fallbackTitle;

  if (parsedTitle !== null) {
    lines.shift();
  }

  while (lines[0]?.trim() === '') {
    lines.shift();
  }

  const parsedLastUpdated = parseLastUpdated(lines[0] ?? '');
  const lastUpdated = parsedLastUpdated ?? '';

  if (parsedLastUpdated !== null) {
    lines.shift();
  }

  while (lines[0]?.trim() === '') {
    lines.shift();
  }

  return {
    body: lines.join('\n'),
    title,
    lastUpdated,
  };
}

export async function getLegalDocument(
  slug: LegalDocumentSlug
): Promise<LegalDocument> {
  if (process.env.NODE_ENV === 'development') {
    return getLegalDocumentUncached(slug);
  }
  return getLegalDocumentCached(slug);
}

async function getLegalDocumentUncached(
  slug: LegalDocumentSlug
): Promise<LegalDocument> {
  const docInfo = LEGAL_DOCS[slug];
  if (!docInfo) {
    throw new SyntaxError(`Unknown legal document slug: ${slug}`);
  }

  const absolutePath = resolveAppContentPath(docInfo.file);
  const parsed = parseLegalMarkdown(
    await fs.readFile(absolutePath, 'utf-8'),
    docInfo.title
  );
  const doc = await createMarkdownDocument(parsed.body);

  return {
    slug,
    title: parsed.title,
    lastUpdated: parsed.lastUpdated,
    practicalSummary: docInfo.practicalSummary,
    ...doc,
  };
}

const getLegalDocumentCached = cache(getLegalDocumentUncached);
