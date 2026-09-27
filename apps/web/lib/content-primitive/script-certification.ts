import { lintCopy } from '@jovie/copy';
import type { CertificationEvidenceReceipt } from '@/lib/agent-os/certification';
import { parseMarkdownFrontmatter } from '@/lib/docs/parseMarkdownFrontmatter';
import {
  DESCRIPTION_LENGTH,
  type SeoCheck,
  TITLE_LENGTH,
} from '@/lib/seo/page-certification';

/**
 * Machine certification for an answer-article script (a blog markdown file).
 * Same check envelope and receipt ids as live page certification, so a
 * script's receipts and its launched page's receipts line up.
 */

export const MIN_ANSWER_WORDS = 450;
export const MIN_EXTERNAL_CITATIONS = 2;

export interface ScriptCertification {
  readonly slug: string;
  readonly passed: boolean;
  readonly checks: readonly SeoCheck[];
  readonly frontmatter: Readonly<Record<string, string>>;
}

const REQUIRED_FRONTMATTER = [
  'title',
  'description',
  'date',
  'category',
  'contentType',
  'question',
] as const;

function linksIn(markdown: string): string[] {
  return [...markdown.matchAll(/\]\(([^)\s]+)\)/g)].map(
    match => match[1] ?? ''
  );
}

function pass(
  dimension: SeoCheck['dimension'],
  id: string,
  summary: string
): SeoCheck {
  return { dimension, id, status: 'passed', summary };
}

function fail(
  dimension: SeoCheck['dimension'],
  id: string,
  summary: string,
  remediation: string
): SeoCheck {
  return { dimension, id, status: 'failed', summary, remediation };
}

function lengthCheck(
  id: string,
  value: string | undefined,
  bounds: { readonly min: number; readonly max: number }
): SeoCheck {
  const length = value?.length ?? 0;
  return length >= bounds.min && length <= bounds.max
    ? pass('technical', id, `${id} ${length} chars`)
    : fail(
        'technical',
        id,
        `${id} is ${length} chars (need ${bounds.min}-${bounds.max})`,
        `Rewrite the ${id} to ${bounds.min}-${bounds.max} characters.`
      );
}

export function certifyAnswerScript(
  slug: string,
  raw: string
): ScriptCertification {
  const { content, data } = parseMarkdownFrontmatter(raw);
  const checks: SeoCheck[] = [];

  const missing = REQUIRED_FRONTMATTER.filter(key => !data[key]);
  checks.push(
    missing.length === 0
      ? pass('technical', 'frontmatter', 'required frontmatter present')
      : fail(
          'technical',
          'frontmatter',
          `missing ${missing.join(', ')}`,
          'Fill every required frontmatter field.'
        )
  );
  checks.push(
    data.contentType === 'answer-article'
      ? pass('technical', 'content-type', 'answer-article')
      : fail(
          'technical',
          'content-type',
          `contentType is ${data.contentType ?? 'missing'}`,
          'Set contentType: answer-article.'
        )
  );
  checks.push(lengthCheck('title', data.title, TITLE_LENGTH));
  checks.push(lengthCheck('description', data.description, DESCRIPTION_LENGTH));
  checks.push(
    /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) && slug.length <= 70
      ? pass('technical', 'slug', slug)
      : fail(
          'technical',
          'slug',
          `slug "${slug}" is not kebab-case under 70 chars`,
          'Rename the file to a short kebab-case slug.'
        )
  );

  const headings = content.match(/^## .+/gm) ?? [];
  const words = content
    .replace(/```[\s\S]*?```/g, '')
    .replace(/[#*_`>[\]()!|-]/g, ' ')
    .split(/\s+/)
    .filter(Boolean).length;
  checks.push(
    words >= MIN_ANSWER_WORDS && headings.length >= 3
      ? pass(
          'agentic',
          'answer-depth',
          `${words} words, ${headings.length} sections`
        )
      : fail(
          'agentic',
          'answer-depth',
          `${words} words, ${headings.length} sections`,
          `Answer in at least ${MIN_ANSWER_WORDS} words across 3 or more ## sections.`
        )
  );
  // Agents quote the first paragraph: it must answer the question directly.
  const firstParagraph =
    content
      .split(/\n\s*\n/)
      .map(block => block.trim())
      .find(block => block && !block.startsWith('#')) ?? '';
  checks.push(
    firstParagraph.split(/\s+/).length >= 25
      ? pass('agentic', 'direct-answer', 'opens with a direct answer')
      : fail(
          'agentic',
          'direct-answer',
          'first paragraph is too short to answer the question',
          'Open with a 25+ word paragraph that answers the question outright.'
        )
  );

  const links = linksIn(content);
  const external = links.filter(
    link =>
      /^https?:\/\//.test(link) && !/^https?:\/\/(www\.)?jov\.ie/.test(link)
  );
  const internal = links.filter(
    link => link.startsWith('/') || /^https?:\/\/(www\.)?jov\.ie/.test(link)
  );
  checks.push(
    external.length >= MIN_EXTERNAL_CITATIONS
      ? pass('agentic', 'citations', `${external.length} cited sources`)
      : fail(
          'agentic',
          'citations',
          `${external.length} cited sources`,
          `Cite at least ${MIN_EXTERNAL_CITATIONS} primary sources with links.`
        )
  );
  checks.push(
    internal.length >= 1
      ? pass('agentic', 'product-link', `${internal.length} jov.ie links`)
      : fail(
          'agentic',
          'product-link',
          'no link to a Jovie page',
          'Link the Jovie page that solves the problem where it helps the reader.'
        )
  );

  const copy = lintCopy(
    [data.title, data.description, content].filter(Boolean).join('\n'),
    { register: 'jovie-marketing' }
  );
  checks.push(
    copy.ok
      ? pass(
          'copy',
          'copy-lint',
          '@jovie/copy jovie-marketing: no blocking findings'
        )
      : fail(
          'copy',
          'copy-lint',
          `${copy.blocking.length} blocking (${[...new Set(copy.blocking.map(item => item.rule))].join(', ')})`,
          'Rewrite the flagged lines (canon/VOICE.md).'
        )
  );

  return {
    slug,
    passed: checks.every(item => item.status !== 'failed'),
    checks,
    frontmatter: data,
  };
}

export function scriptReceipts(
  result: ScriptCertification,
  sourceSha: string | null
): CertificationEvidenceReceipt[] {
  return (['technical', 'agentic', 'copy'] as const).map(dimension => {
    const failed = result.checks.filter(
      item => item.dimension === dimension && item.status === 'failed'
    );
    return {
      id: `seo.${dimension}`,
      tier: 'invariant_evaluation',
      status: failed.length === 0 ? 'passed' : 'failed',
      sourceSha,
      ref: `script:${result.slug}`,
      digest: null,
      summary:
        failed.length === 0
          ? `${dimension} checks passed`
          : failed.map(item => `${item.id}: ${item.summary}`).join('; '),
    };
  });
}
