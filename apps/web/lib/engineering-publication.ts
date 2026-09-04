import { createHash } from 'node:crypto';
import { type Dirent, promises as fs } from 'node:fs';
import { cache } from 'react';
import { z } from 'zod';
import { APP_ROUTES } from '@/constants/routes';
import { isInternalEntry } from '@/lib/changelog-filter-rules';
import { resolveAppContentPath } from '@/lib/filesystem-paths';
import { validatePathTraversal } from '@/lib/security/path-traversal';

const PUBLIC_CAPABILITY_IDS = new Set([
  'artist-profiles',
  'changelog',
  'pricing',
  'smart-links',
]);
const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const HASH_RE = /^[a-f0-9]{64}$/;
const FRONTMATTER_RE = /^--- *\n([\s\S]*?)\n--- *(?:\n|$)/;
const METRIC_RE =
  /\$\d|\d+(?:\.\d+)?%|\b\d+\s*(?:million|billion|x)\b|\b\d{2,}\s+(?:users|artists|creators|profiles)\b/gi;
const UNRELEASED_RE =
  /\b(?:symphony|gbrain|hermes-air|agent[\s-]?os|conductor workspace)\b/i;
const PUBLIC_HREF_RE =
  /^(https:\/\/(?:jov\.ie|github\.com\/JovieInc\/Jovie)\/[^\s]+|\/(?!\/)[^\s]*)$/;
const ENG = APP_ROUTES.ENGINEERING;
const CONTENT_DIRECTORY = resolveAppContentPath('engineering');

export type PublicationIssue = {
  readonly rule: string;
  readonly message: string;
};

const EngineeringStorySourceSchema = z.object({
  id: z.string().regex(SLUG_RE),
  title: z.string().min(1),
  date: z.string().regex(DATE_RE),
  summary: z.string().min(1),
  status: z.enum(['draft', 'published']),
  availability: z.enum(['public', 'internal']),
  capabilities: z
    .array(
      z.object({
        id: z.string().min(1),
        availability: z.enum(['public', 'unreleased']),
        receiptId: z.string().min(1),
      })
    )
    .min(1),
  evidence: z
    .array(
      z.object({
        id: z.string().min(1),
        kind: z.enum(['public-url', 'changelog', 'test', 'pull-request']),
        href: z.string().min(1),
        claims: z.array(z.string().min(1)),
      })
    )
    .min(1),
  founderApproval: z
    .object({
      approvedBy: z.literal('Tim White'),
      approvedAt: z.string().regex(DATE_RE),
      copyHash: z.string().regex(HASH_RE),
    })
    .nullable(),
});

export type EngineeringStorySource = z.infer<
  typeof EngineeringStorySourceSchema
>;
export interface EngineeringStoryRecord {
  readonly slug: string;
  readonly body: string;
  readonly source: EngineeringStorySource | null;
  readonly issues: readonly PublicationIssue[];
}

const failed = (
  slug: string,
  body: string,
  rule: string,
  message: string
): EngineeringStoryRecord => ({
  slug,
  body,
  source: null,
  issues: [{ rule, message }],
});

export function hashEngineeringCopy(input: {
  readonly title: string;
  readonly summary: string;
  readonly body: string;
}): string {
  return createHash('sha256')
    .update(`${input.title}\n${input.summary}\n${input.body}`)
    .digest('hex');
}

function parseFrontmatter(raw: string): {
  readonly frontmatter: string | null;
  readonly body: string;
} {
  const match = FRONTMATTER_RE.exec(raw);
  if (!match?.[1]) return { frontmatter: null, body: raw };
  return { frontmatter: match[1], body: raw.slice(match[0].length) };
}

function lintStory(
  source: EngineeringStorySource,
  slug: string,
  body: string
): PublicationIssue[] {
  const issues: PublicationIssue[] = [];
  const push = (rule: string, message: string) => {
    issues.push({ rule, message });
  };
  const publicText = `${source.title}\n${source.summary}\n${body}`;
  const receipts = new Set(source.evidence.map(item => item.id));
  if (source.id !== slug)
    push('id-filename-mismatch', `${source.id} != ${slug}`);
  if (slug === 'preview' || slug === 'feed') {
    push('invalid-schema', `${slug} is reserved`);
  }
  if (source.availability !== 'public') {
    push('non-public-availability', 'availability must be public');
  }
  if (!source.founderApproval) {
    push('missing-approval', 'Tim White must approve the exact public copy');
  } else if (
    source.founderApproval.copyHash !==
    hashEngineeringCopy({ title: source.title, summary: source.summary, body })
  ) {
    push('copy-hash-mismatch', 'copyHash does not match current copy');
  }
  for (const capability of source.capabilities) {
    if (
      capability.availability === 'unreleased' ||
      !PUBLIC_CAPABILITY_IDS.has(capability.id)
    ) {
      push('unpublished-capability', `${capability.id} is not public`);
    }
    if (!receipts.has(capability.receiptId)) {
      push('incomplete-evidence', `missing ${capability.receiptId}`);
    }
  }
  for (const receipt of source.evidence) {
    if (!PUBLIC_HREF_RE.test(receipt.href)) {
      push('unsafe-receipt', `${receipt.id} href is not public`);
    }
  }
  if (isInternalEntry(publicText) || UNRELEASED_RE.test(publicText)) {
    push('internal-detail', 'copy contains internal or unreleased detail');
  }
  const claimed = source.evidence.flatMap(item => item.claims).join('\n');
  for (const match of publicText.matchAll(METRIC_RE)) {
    const metric = match[0]?.trim();
    if (metric && !claimed.includes(metric)) {
      push('unverifiable-metric', `${metric} has no evidence claim`);
    }
  }
  return issues;
}

export function evaluateEngineeringSource(
  raw: string,
  slug: string
): EngineeringStoryRecord {
  const { frontmatter, body } = parseFrontmatter(raw);
  if (frontmatter === null) {
    return failed(
      slug,
      body,
      'missing-frontmatter',
      'JSON frontmatter required'
    );
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(frontmatter);
  } catch (error) {
    return failed(
      slug,
      body,
      'invalid-frontmatter-json',
      error instanceof Error ? error.message : String(error)
    );
  }
  const result = EngineeringStorySourceSchema.safeParse(parsed);
  if (!result.success) {
    return {
      slug,
      body,
      source: null,
      issues: result.error.issues.map(item => ({
        rule: 'invalid-schema' as const,
        message: `${item.path.join('.') || 'source'}: ${item.message}`,
      })),
    };
  }
  return {
    slug,
    body,
    source: result.data,
    issues: lintStory(result.data, slug, body),
  };
}

export const isPublishReady = (record: EngineeringStoryRecord): boolean =>
  record.source !== null && record.issues.length === 0;

export const selectPublishedStories = (
  records: readonly EngineeringStoryRecord[]
): EngineeringStoryRecord[] =>
  records.filter(
    record => isPublishReady(record) && record.source?.status === 'published'
  );

export const selectPreviewStories = (
  records: readonly EngineeringStoryRecord[]
): EngineeringStoryRecord[] =>
  [...records].sort((left, right) =>
    (right.source?.date ?? '').localeCompare(left.source?.date ?? '')
  );

export async function loadEngineeringStoriesFromDisk(): Promise<
  EngineeringStoryRecord[]
> {
  let entries: Dirent[];
  try {
    entries = await fs.readdir(CONTENT_DIRECTORY, { withFileTypes: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw error;
  }
  const stories = await Promise.all(
    entries
      .filter(entry => entry.isFile() && entry.name.endsWith('.md'))
      .map(async entry => {
        const slug = entry.name.slice(0, -3);
        const raw = await fs.readFile(
          validatePathTraversal(`${slug}.md`, CONTENT_DIRECTORY),
          'utf8'
        );
        return evaluateEngineeringSource(raw, slug);
      })
  );
  return selectPreviewStories(stories);
}

export const getEngineeringStories = cache(loadEngineeringStoriesFromDisk);
export const getPublishedEngineeringStories = async () =>
  selectPublishedStories(await getEngineeringStories());
export const getPreviewEngineeringStories = async () =>
  selectPreviewStories(await getEngineeringStories());
export const findEngineeringStory = (
  records: readonly EngineeringStoryRecord[],
  slug: string
) => records.find(record => record.slug === slug);

const storyUrl = (baseUrl: string, slug: string) => `${baseUrl}${ENG}/${slug}`;

function escapeXml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

export function buildEngineeringJsonFeed(input: {
  readonly appName: string;
  readonly baseUrl: string;
  readonly stories: readonly EngineeringStoryRecord[];
}): Record<string, unknown> {
  const home = `${input.baseUrl}${ENG}`;
  return {
    version: 'https://jsonfeed.org/version/1.1',
    title: `${input.appName} Engineering`,
    home_page_url: home,
    feed_url: `${home}/feed.json`,
    description: `Founder-approved engineering stories from ${input.appName}.`,
    items: input.stories.flatMap(story =>
      story.source
        ? [
            {
              id: storyUrl(input.baseUrl, story.slug),
              url: storyUrl(input.baseUrl, story.slug),
              title: story.source.title,
              summary: story.source.summary,
              content_text: story.body.trim(),
              date_published: `${story.source.date}T00:00:00Z`,
            },
          ]
        : []
    ),
  };
}

export function buildEngineeringAtomFeed(input: {
  readonly appName: string;
  readonly baseUrl: string;
  readonly stories: readonly EngineeringStoryRecord[];
  readonly updated: string;
}): string {
  const home = `${input.baseUrl}${ENG}`;
  const entries = input.stories
    .flatMap(story => {
      if (!story.source) return [];
      const url = storyUrl(input.baseUrl, story.slug);
      return [
        `<entry><title>${escapeXml(story.source.title)}</title><id>${escapeXml(url)}</id><link href="${escapeXml(url)}" rel="alternate"/><updated>${story.source.date}T00:00:00Z</updated><summary>${escapeXml(story.source.summary)}</summary><content type="text">${escapeXml(story.body.trim())}</content></entry>`,
      ];
    })
    .join('');
  return `<?xml version="1.0" encoding="utf-8"?><feed xmlns="http://www.w3.org/2005/Atom"><title>${escapeXml(input.appName)} Engineering</title><subtitle>Founder-approved engineering stories</subtitle><link href="${escapeXml(home)}/feed.xml" rel="self" type="application/atom+xml"/><link href="${escapeXml(home)}" rel="alternate"/><id>${escapeXml(home)}</id><updated>${escapeXml(input.updated)}</updated><author><name>${escapeXml(input.appName)}</name></author>${entries}</feed>`;
}
