import { APP_NAME, BASE_URL } from '@/constants/app';
import { DOCS_URL } from '@/constants/domains';
import { APP_ROUTES } from '@/constants/routes';
import { COMPANY_IDENTITY } from '@/data/companyIdentity';
import { HOMEPAGE_COPY } from '@/data/homepageCopy';
import { buildSiteLlmsGuidance } from '@/lib/agent/site-llms-guidance';

function toAbsolutePublicUrl(href: string): string {
  if (href.startsWith('https://') || href.startsWith('http://')) {
    return href;
  }
  return `${BASE_URL}${href}`;
}

function renderFreeOffer(): string {
  const { offer } = HOMEPAGE_COPY;
  return [
    `### ${offer.includedLabel}`,
    '',
    ...offer.included.map(item => `- ${item.label}`),
  ].join('\n');
}

/**
 * Markdown representation of the public homepage for Accept: text/markdown.
 * Machine-readable identity stays general (company definition first); the
 * homepage's artist-profile offer follows as a labeled section. Visual-only
 * fan-moment copy is not projected here.
 */
export function buildHomepageMarkdown(): string {
  const { hero } = HOMEPAGE_COPY;

  return `# ${COMPANY_IDENTITY.headline}

${COMPANY_IDENTITY.definition}

## Artist profiles

${hero.subhead}

${hero.claim.action} ${hero.claim.domain}${hero.claim.placeholder}: ${toAbsolutePublicUrl(APP_ROUTES.START)}

${renderFreeOffer()}

${buildSiteLlmsGuidance()}
## Recovery links

- Home: ${BASE_URL}${APP_ROUTES.HOME}
- About: ${BASE_URL}${APP_ROUTES.ABOUT}
- Support: ${BASE_URL}${APP_ROUTES.SUPPORT}
- Help Center: ${DOCS_URL}/docs
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
- Public profile API: ${BASE_URL}/api/v1/{username}
- Help Center: ${DOCS_URL}/docs
- Sitemap: ${BASE_URL}/sitemap.xml
- Full site guide: ${BASE_URL}/llms-full.txt
- About: ${BASE_URL}${APP_ROUTES.ABOUT}
- Support: ${BASE_URL}${APP_ROUTES.SUPPORT}
`;
}
