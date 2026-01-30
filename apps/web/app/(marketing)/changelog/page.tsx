import fs from 'node:fs';
import path from 'node:path';
import DOMPurify from 'isomorphic-dompurify';
import type { Metadata } from 'next';
import { unstable_cache } from 'next/cache';
import { remark } from 'remark';
import html from 'remark-html';
import { Container } from '@/components/site/Container';
import { APP_NAME } from '@/constants/app';

const CHANGELOG_CANDIDATE_PATHS = [
  path.join(process.cwd(), 'CHANGELOG.md'),
  path.join(process.cwd(), '..', '..', 'CHANGELOG.md'),
];

function resolveChangelogPath(): string | null {
  for (const candidate of CHANGELOG_CANDIDATE_PATHS) {
    if (fs.existsSync(candidate)) return candidate;
  }
  return null;
}

// Fully static - changelog is read from filesystem at build time
export const revalidate = false;

/**
 * Process markdown to HTML. This is CPU-intensive so we cache the result.
 */
async function processChangelogMarkdown(): Promise<string> {
  const changelogPath = resolveChangelogPath();
  if (!changelogPath) {
    return DOMPurify.sanitize(
      '<h2>Changelog unavailable</h2><p>Please check back soon.</p>'
    );
  }

  try {
    const fileContents = fs.readFileSync(changelogPath, 'utf8');
    const processedContent = await remark().use(html).process(fileContents);
    return DOMPurify.sanitize(processedContent.toString());
  } catch {
    return DOMPurify.sanitize(
      '<h2>Changelog unavailable</h2><p>Please check back soon.</p>'
    );
  }
}

/**
 * Cached version of changelog processing.
 * Fully static - processed at build time only.
 */
const getChangelogHtml = unstable_cache(
  processChangelogMarkdown,
  ['changelog-html'],
  {
    revalidate: false,
    tags: ['changelog'],
  }
);

export const metadata: Metadata = {
  title: `Changelog | ${APP_NAME}`,
  description: `${APP_NAME} product changelog and release notes`,
};

export default async function ChangelogPage() {
  const contentHtml = await getChangelogHtml();

  return (
    <section className='bg-white text-gray-900 dark:bg-[#0D0E12] dark:text-white py-12 md:py-16'>
      <Container>
        <header className='mb-8 md:mb-10'>
          <h1 className='text-3xl md:text-4xl font-semibold tracking-tight'>
            Changelog
          </h1>
          <p className='mt-2 text-sm md:text-base text-gray-600 dark:text-gray-400 max-w-2xl'>
            Updates and improvements to {APP_NAME}. We follow the Keep a
            Changelog format and semantic versioning.
          </p>
        </header>
        <article
          className='prose prose-neutral dark:prose-invert max-w-none text-sm md:text-base'
          // biome-ignore lint/security/noDangerouslySetInnerHtml: HTML sanitized with DOMPurify
          dangerouslySetInnerHTML={{ __html: contentHtml }}
        />
      </Container>
    </section>
  );
}
