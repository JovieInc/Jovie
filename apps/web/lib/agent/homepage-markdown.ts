import { APP_NAME, BASE_URL } from '@/constants/app';
import { DOCS_URL } from '@/constants/domains';
import { APP_ROUTES } from '@/constants/routes';
import { COMPANY_IDENTITY } from '@/data/companyIdentity';
import { HOMEPAGE_IDENTITY_COPY } from '@/data/homepageIdentityCopy';
import { buildSiteLlmsGuidance } from '@/lib/agent/site-llms-guidance';

function toAbsolutePublicUrl(href: string): string {
  if (href.startsWith('https://') || href.startsWith('http://')) {
    return href;
  }
  return `${BASE_URL}${href}`;
}

function renderIdentitySections(): string {
  return HOMEPAGE_IDENTITY_COPY.sections
    .map(section => {
      const lines = [
        `## ${section.eyebrow}`,
        '',
        `### ${section.headline}`,
        '',
        section.body,
      ];
      if ('step' in section) {
        lines.push('', `### ${section.step.headline}`, '', section.step.body);
      }
      if ('identity' in section) {
        lines.push(
          '',
          `### ${section.identity.label}`,
          '',
          section.identity.title,
          '',
          section.identity.handle
        );
      }
      if ('possibilities' in section) {
        lines.push('', `### ${section.possibilities.label}`, '');
        for (const item of section.possibilities.items) {
          lines.push(`- ${item.title}: ${item.detail}`);
        }
      }
      return lines.join('\n');
    })
    .join('\n\n');
}

/**
 * Markdown representation of the public homepage for Accept: text/markdown.
 * Projects approved identity copy. The music launch document is a separate surface.
 */
export function buildHomepageMarkdown(): string {
  const { hero, close } = HOMEPAGE_IDENTITY_COPY;

  return `# ${hero.headline}

${hero.subhead}

${COMPANY_IDENTITY.definition}

${hero.claim.action} ${hero.claim.domain}${hero.claim.placeholder}: ${toAbsolutePublicUrl(APP_ROUTES.START)}

${renderIdentitySections()}

## ${close.headline}

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
