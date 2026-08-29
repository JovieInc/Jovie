import { APP_NAME, BASE_URL } from '@/constants/app';
import { DOCS_URL } from '@/constants/domains';
import { APP_ROUTES } from '@/constants/routes';
import { HOMEPAGE_LAUNCH_COPY } from '@/data/homepageLaunchCopy';
import { buildSiteLlmsGuidance } from '@/lib/agent/site-llms-guidance';

/**
 * Markdown representation of the public homepage for Accept: text/markdown.
 * Copy comes from the existing launch document — this is not a redesign.
 */
export function buildHomepageMarkdown(): string {
  const { hero, workspace, productStatement, faq } = HOMEPAGE_LAUNCH_COPY;
  const callouts = workspace.callouts
    .map(item => `### ${item.title}\n\n${item.body}`)
    .join('\n\n');
  const questions = faq
    .map(item => `### ${item.question}\n\n${item.answer}`)
    .join('\n\n');

  return `# ${hero.headline}

${hero.subhead}

${hero.primaryCta.label}: ${BASE_URL}${hero.primaryCta.href}
${hero.secondaryCta.label}: ${BASE_URL}${hero.secondaryCta.href}

## ${workspace.kicker}

${workspace.headline.replaceAll('\n', ' ')}

${callouts}

## ${productStatement.body}

${productStatement.description}

## Questions

${questions}

${buildSiteLlmsGuidance()}
## Recovery links

- Home: ${BASE_URL}${APP_ROUTES.HOME}
- About: ${BASE_URL}${APP_ROUTES.ABOUT}
- Support: ${BASE_URL}${APP_ROUTES.SUPPORT}
- Docs: ${DOCS_URL}
- OpenAPI: ${BASE_URL}/openapi.json
- llms.txt: ${BASE_URL}/llms.txt
- Sitemap: ${BASE_URL}/sitemap.xml

— ${APP_NAME}
`;
}

export function buildNotFoundMarkdown(): string {
  return `# Page not found

That path does not exist on ${APP_NAME}. Recover from one of these public surfaces:

- Home: ${BASE_URL}${APP_ROUTES.HOME}
- When to use ${APP_NAME}: ${BASE_URL}/llms.txt
- ${APP_NAME} developer resources: ${BASE_URL}/llms.txt
- OpenAPI 3.1: ${BASE_URL}/openapi.json
- Public artist API: ${BASE_URL}/api/v1/{username}
- Docs: ${DOCS_URL}
- Sitemap: ${BASE_URL}/sitemap.xml
- About: ${BASE_URL}${APP_ROUTES.ABOUT}
- Support: ${BASE_URL}${APP_ROUTES.SUPPORT}
`;
}
