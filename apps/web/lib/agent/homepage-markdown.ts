import { APP_NAME, BASE_URL } from '@/constants/app';
import { DOCS_URL } from '@/constants/domains';
import { APP_ROUTES } from '@/constants/routes';
import { HOMEPAGE_LAUNCH_COPY } from '@/data/homepageLaunchCopy';
import { buildSiteLlmsGuidance } from '@/lib/agent/site-llms-guidance';

function toAbsolutePublicUrl(href: string): string {
  if (href.startsWith('https://') || href.startsWith('http://')) {
    return href;
  }
  return `${BASE_URL}${href}`;
}

/**
 * Markdown representation of the public homepage for Accept: text/markdown.
 * Copy comes from the canonical homepage copy module, so the Markdown and the
 * rendered page say the same thing.
 */
export function buildHomepageMarkdown(): string {
  const { hero, certified, fallbackCta } = HOMEPAGE_LAUNCH_COPY;
  const [presence, structure] = certified.sections;
  const possibilities = structure.possibilities.items
    .map(item => `- ${item.title}: ${item.detail}`)
    .join('\n');

  return `# ${hero.headline}

${hero.subhead}

${fallbackCta.label}: ${toAbsolutePublicUrl(fallbackCta.href)}

## ${presence.headline}

${presence.body}

### ${presence.step.headline}

${presence.step.body}

## ${structure.headline}

${structure.body}

### ${structure.identity.title}

${possibilities}

## ${certified.close.headline}

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
- Full site guide: ${BASE_URL}/llms-full.txt
- About: ${BASE_URL}${APP_ROUTES.ABOUT}
- Support: ${BASE_URL}${APP_ROUTES.SUPPORT}
`;
}
