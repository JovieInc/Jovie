import fs from 'fs';
import type { Metadata } from 'next';
import path from 'path';
import { remark } from 'remark';
import html from 'remark-html';
import { Container } from '@/components/site/Container';
import { APP_NAME } from '@/constants/app';

const CHANGELOG_PATH = path.join(process.cwd(), 'CHANGELOG.md');

async function getChangelogHtml(): Promise<string> {
  const fileContents = fs.readFileSync(CHANGELOG_PATH, 'utf8');
  const processedContent = await remark().use(html).process(fileContents);
  return processedContent.toString();
}

export const metadata: Metadata = {
  title: `Changelog | ${APP_NAME}`,
  description: `${APP_NAME} product changelog and release notes`,
};

export default async function ChangelogPage() {
  const contentHtml = await getChangelogHtml();

  return (
    <section className='bg-base text-primary-token py-12 md:py-16'>
      <Container>
        <header className='mb-8 md:mb-10'>
          <h1 className='text-3xl md:text-4xl font-semibold tracking-tight'>
            Changelog
          </h1>
          <p className='mt-2 max-w-2xl text-sm md:text-base text-secondary-token'>
            Updates and improvements to {APP_NAME}. We follow the Keep a
            Changelog format and semantic versioning.
          </p>
        </header>
        <article
          className='prose prose-neutral dark:prose-invert max-w-none text-sm md:text-base'
          dangerouslySetInnerHTML={{ __html: contentHtml }}
        />
      </Container>
    </section>
  );
}
