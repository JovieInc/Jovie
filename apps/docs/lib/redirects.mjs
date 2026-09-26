import { articleMetadataError, isPrimaryArticle } from './article-metadata.mjs';

const ROUTE_ALIAS_RE = /^\/[a-z0-9\-/]*$/;

/**
 * Builds the permanent redirect table from canonical article metadata. Each
 * `redirectAliases` entry on an article is a retired URL that must resolve in
 * exactly one hop to that article's canonical route. This keeps the redirect
 * contract in the same page-map source as navigation, search, and the sitemap.
 */
export function buildRedirects(articles) {
  const routes = new Map(
    articles.map(article => [article.route, article.sourcePath])
  );
  const primaryRoutes = new Set(
    articles.filter(isPrimaryArticle).map(article => article.route)
  );
  const redirects = [];
  const seenSources = new Map();

  for (const article of articles) {
    for (const alias of article.redirectAliases ?? []) {
      const errors = [];
      if (typeof alias !== 'string' || !ROUTE_ALIAS_RE.test(alias)) {
        errors.push(`invalid redirect alias: ${String(alias)}`);
      } else {
        if (alias === article.route) {
          errors.push(`redirect alias ${alias} points at its own route`);
        }
        if (primaryRoutes.has(alias)) {
          errors.push(
            `redirect alias ${alias} shadows a live canonical route owned by ${routes.get(alias)}`
          );
        }
        if (seenSources.has(alias)) {
          errors.push(
            `duplicate redirect alias ${alias} also used by ${seenSources.get(alias)}`
          );
        }
      }
      if (errors.length > 0) {
        throw articleMetadataError(article.sourcePath, errors);
      }
      seenSources.set(alias, article.sourcePath);
      redirects.push({
        source: alias,
        destination: article.route,
        permanent: true,
      });
    }
  }

  return redirects.sort((left, right) =>
    left.source.localeCompare(right.source)
  );
}
