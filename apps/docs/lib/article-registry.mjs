import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  articleMetadataError,
  buildArticleConsumers,
  isPrimaryArticle,
  parseFeatureRegistry,
  parseFrontmatter,
  parseProductRoutes,
  validateArticleMetadata,
} from './article-metadata.mjs';

const moduleDirectory = dirname(fileURLToPath(import.meta.url));
export const DEFAULT_REPOSITORY_ROOT = resolve(moduleDirectory, '../../..');

function findMdxFiles(directory) {
  const files = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...findMdxFiles(path));
    else if (entry.isFile() && entry.name.endsWith('.mdx')) files.push(path);
  }
  return files.sort();
}

export function routeFromArticlePath(path, docsAppDirectory) {
  const localPath = relative(docsAppDirectory, path).split(sep).join('/');
  const route = localPath.replace(/(?:^|\/)page\.mdx$/, '');
  return route ? `/${route}` : '/';
}

export function loadArticleRegistry({
  repositoryRoot = DEFAULT_REPOSITORY_ROOT,
  articleDirectory = join(repositoryRoot, 'apps/docs/app'),
  featureRegistryPath = join(repositoryRoot, 'docs/FEATURE_REGISTRY.md'),
  routeRegistryPath = join(repositoryRoot, 'apps/web/constants/routes.ts'),
} = {}) {
  // Registry reads happen only while statically generating the docs. Do not
  // trace the entire monorepo into the deployed server bundle.
  const features = parseFeatureRegistry(
    readFileSync(/* turbopackIgnore: true */ featureRegistryPath, 'utf8')
  );
  const routes = parseProductRoutes(
    readFileSync(/* turbopackIgnore: true */ routeRegistryPath, 'utf8')
  );
  const articles = [];
  const seenIds = new Map();
  const seenRoutes = new Map();

  for (const path of findMdxFiles(articleDirectory)) {
    const sourcePath = relative(repositoryRoot, path).split(sep).join('/');
    const { metadata } = parseFrontmatter(
      readFileSync(path, 'utf8'),
      sourcePath
    );
    validateArticleMetadata(metadata, { features, routes, sourcePath });
    const route = routeFromArticlePath(path, articleDirectory);
    const errors = [];
    if (seenIds.has(metadata.id)) {
      errors.push(`duplicate id also used by ${seenIds.get(metadata.id)}`);
    }
    if (seenRoutes.has(route)) {
      errors.push(`duplicate route also used by ${seenRoutes.get(route)}`);
    }
    const primary = isPrimaryArticle(metadata);
    if (!primary && metadata.searchable !== false) {
      errors.push(
        'non-primary articles must set searchable: false so Pagefind shares the certification policy'
      );
    }
    if (primary && metadata.searchable === false) {
      errors.push('primary articles must not disable Pagefind search');
    }
    if (errors.length > 0) throw articleMetadataError(sourcePath, errors);

    seenIds.set(metadata.id, sourcePath);
    seenRoutes.set(route, sourcePath);
    articles.push({ ...metadata, route, sourcePath });
  }

  return {
    articles,
    features,
    routes,
    consumers: buildArticleConsumers(articles),
  };
}

export function filterNavigationPageMap(pageMap, primaryRoutes) {
  const allowedRoutes = new Set(primaryRoutes);
  const visit = item => {
    if ('data' in item) return null;
    if ('children' in item) {
      const children = item.children.map(visit).filter(Boolean);
      if (children.length === 0 && !allowedRoutes.has(item.route)) return null;
      return { ...item, children };
    }
    if ('route' in item && !allowedRoutes.has(item.route)) return null;
    return item;
  };
  return pageMap.map(visit).filter(Boolean);
}
