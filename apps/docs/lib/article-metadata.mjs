const ARTICLE_ID_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export const ARTICLE_CATEGORIES = Object.freeze([
  'jovie-essentials',
  'build-your-presence',
  'manage-jovie',
  'developers',
  'legacy',
]);

export const ARTICLE_DOCUMENT_TYPES = Object.freeze([
  'guide',
  'reference',
  'landing',
  'legacy',
]);

export const ARTICLE_STATUSES = Object.freeze([
  'draft',
  'uncertified',
  'certified',
  'stale',
  'retired',
  'published',
]);

export const ARTICLE_VERIFIERS = Object.freeze([
  'human',
  'machine',
  'unverified',
]);

function parseScalar(value, lineNumber) {
  const trimmed = value.trim();
  if (trimmed === 'null' || trimmed === '~') return null;
  if (trimmed === 'true') return true;
  if (trimmed === 'false') return false;
  if (trimmed === '[]') return [];
  if (
    (trimmed.startsWith("'") && trimmed.endsWith("'")) ||
    (trimmed.startsWith('"') && trimmed.endsWith('"'))
  ) {
    return trimmed.slice(1, -1);
  }
  if (!trimmed) return undefined;
  if (/^[>|]/.test(trimmed)) {
    throw new Error(
      `unsupported multiline YAML scalar on frontmatter line ${lineNumber}`
    );
  }
  return trimmed;
}

export function parseFrontmatter(source, sourcePath = '<inline>') {
  const normalized = source.replaceAll('\r\n', '\n');
  if (!normalized.startsWith('---\n')) {
    throw articleMetadataError(sourcePath, ['frontmatter block is required']);
  }
  const closingIndex = normalized.indexOf('\n---', 4);
  if (closingIndex === -1) {
    throw articleMetadataError(sourcePath, [
      'frontmatter closing delimiter is required',
    ]);
  }

  const frontmatter = normalized.slice(4, closingIndex);
  const metadata = {};
  let arrayKey = null;

  for (const [index, rawLine] of frontmatter.split('\n').entries()) {
    const lineNumber = index + 2;
    if (!rawLine.trim() || rawLine.trimStart().startsWith('#')) continue;
    const arrayMatch = rawLine.match(/^\s{2}-\s+(.+)$/);
    if (arrayMatch) {
      if (!arrayKey || !Array.isArray(metadata[arrayKey])) {
        throw articleMetadataError(sourcePath, [
          `unexpected array item on frontmatter line ${lineNumber}`,
        ]);
      }
      metadata[arrayKey].push(parseScalar(arrayMatch[1], lineNumber));
      continue;
    }
    if (/^\s/.test(rawLine)) {
      throw articleMetadataError(sourcePath, [
        `unsupported nested YAML on frontmatter line ${lineNumber}`,
      ]);
    }
    const fieldMatch = rawLine.match(/^([A-Za-z][A-Za-z0-9]*):(?:\s*(.*))?$/);
    if (!fieldMatch) {
      throw articleMetadataError(sourcePath, [
        `invalid frontmatter syntax on line ${lineNumber}`,
      ]);
    }
    const [, key, rawValue = ''] = fieldMatch;
    if (Object.hasOwn(metadata, key)) {
      throw articleMetadataError(sourcePath, [`duplicate field ${key}`]);
    }
    const value = parseScalar(rawValue, lineNumber);
    metadata[key] = value === undefined ? [] : value;
    arrayKey = value === undefined || Array.isArray(value) ? key : null;
  }

  return {
    metadata,
    body: normalized.slice(closingIndex + 4).replace(/^\n/, ''),
  };
}

export function parseFeatureRegistry(markdown) {
  const productRows = new Map();
  const stableIds = new Map();
  for (const line of markdown.split('\n')) {
    if (!line.startsWith('| ')) continue;
    const cells = line.split('|').map(cell => cell.trim());
    if (
      cells.length === 4 &&
      ARTICLE_ID_RE.test(cells[1]) &&
      cells[1] !== 'feature-id'
    ) {
      if (stableIds.has(cells[1])) {
        throw new Error(`duplicate stable feature registry ID: ${cells[1]}`);
      }
      stableIds.set(cells[1], cells[2]);
      continue;
    }
    if (cells.length < 7) continue;
    const area = cells[1];
    const feature = cells[2];
    if (!feature || feature === 'Feature' || feature === '---') continue;
    productRows.set(feature, {
      area,
      feature,
      status: cells[3],
      access: cells[4],
      gate: cells[5],
      notes: cells[6],
    });
  }

  const features = new Map();
  for (const [id, featureName] of stableIds) {
    const row = productRows.get(featureName);
    if (!row) {
      throw new Error(
        `stable feature registry ID ${id} references missing feature: ${featureName}`
      );
    }
    if (features.has(id))
      throw new Error(`duplicate feature registry ID: ${id}`);
    features.set(id, { id, ...row });
  }
  return features;
}

export function parseProductRoutes(source) {
  const routes = new Map();
  for (const line of source.split('\n')) {
    const match = line.match(
      /^\s*([A-Z][A-Z0-9_]+):\s*(['"`])([^'"`]+)\2(?:\s+as const)?,?/
    );
    if (!match) continue;
    routes.set(match[1], match[3]);
  }
  return routes;
}

export function articleMetadataError(sourcePath, errors) {
  return new Error(
    `article metadata migration failed for ${sourcePath}:\n${errors
      .map(error => `- ${error}`)
      .join('\n')}`
  );
}

function hasValidDate(value) {
  if (typeof value !== 'string' || !ISO_DATE_RE.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.valueOf()) && date.toISOString().startsWith(value);
}

function validateStringArray(metadata, key, errors, { nonEmpty = false } = {}) {
  const value = metadata[key];
  if (!Array.isArray(value)) {
    errors.push(`${key} must be an array`);
    return;
  }
  if (nonEmpty && value.length === 0) {
    errors.push(`${key} must contain at least one value`);
  }
  if (value.some(item => typeof item !== 'string' || !item.trim())) {
    errors.push(`${key} must contain only non-empty strings`);
  }
  if (new Set(value).size !== value.length) {
    errors.push(`${key} must not contain duplicates`);
  }
}

function featureIdsFor(metadata) {
  const additionalFeatureIds = Array.isArray(metadata.additionalFeatureIds)
    ? metadata.additionalFeatureIds
    : [];
  return [metadata.featureId, ...additionalFeatureIds].filter(Boolean);
}

function routePath(productRoute) {
  if (typeof productRoute !== 'string') return productRoute;
  return productRoute.split(/[?#]/, 1)[0];
}

export function validateArticleMetadata(
  metadata,
  { features = new Map(), routes = new Map(), sourcePath = '<article>' } = {}
) {
  const errors = [];
  if (typeof metadata.id !== 'string' || !ARTICLE_ID_RE.test(metadata.id)) {
    errors.push('id is required and must be stable lowercase kebab-case');
  }
  if (typeof metadata.title !== 'string' || !metadata.title.trim()) {
    errors.push('title is required');
  }
  if (
    typeof metadata.description !== 'string' ||
    metadata.description.trim().length < 20 ||
    metadata.description.trim().length > 200
  ) {
    errors.push('description is required and must be 20-200 characters');
  }
  if (!ARTICLE_DOCUMENT_TYPES.includes(metadata.documentType)) {
    errors.push(
      metadata.documentType
        ? `invalid documentType: ${metadata.documentType}`
        : 'documentType is required'
    );
  }
  if (!ARTICLE_CATEGORIES.includes(metadata.category)) {
    errors.push(
      metadata.category
        ? `invalid category: ${metadata.category}`
        : 'category is required'
    );
  }
  if (!ARTICLE_STATUSES.includes(metadata.status)) {
    errors.push(
      metadata.status
        ? `invalid status: ${metadata.status}`
        : 'status is required'
    );
  }
  if (!ARTICLE_VERIFIERS.includes(metadata.verifiedBy)) {
    errors.push(
      metadata.verifiedBy
        ? `invalid verifiedBy: ${metadata.verifiedBy}`
        : 'verifiedBy is required'
    );
  }
  if (!Object.hasOwn(metadata, 'lastVerifiedAt')) {
    errors.push('lastVerifiedAt is required (use null when unverified)');
  } else if (
    metadata.lastVerifiedAt !== null &&
    !hasValidDate(metadata.lastVerifiedAt)
  ) {
    errors.push('lastVerifiedAt must be null or a valid YYYY-MM-DD date');
  }
  if (typeof metadata.productBacked !== 'boolean') {
    errors.push('productBacked must be true or false');
  }
  if (typeof metadata.launchPath !== 'boolean') {
    errors.push('launchPath must be true or false');
  }
  validateStringArray(metadata, 'keywords', errors, { nonEmpty: true });
  validateStringArray(metadata, 'redirectAliases', errors);
  validateStringArray(metadata, 'visualProofRefs', errors);
  validateStringArray(metadata, 'uiLabels', errors);
  validateStringArray(metadata, 'productSourceRefs', errors);
  if (metadata.additionalFeatureIds !== undefined) {
    validateStringArray(metadata, 'additionalFeatureIds', errors);
  }

  if (metadata.documentType === 'guide') {
    if (metadata.status === 'published') {
      errors.push('guide status cannot be published; certify or quarantine it');
    }
    if (metadata.productBacked === true) {
      if (typeof metadata.featureId !== 'string' || !metadata.featureId) {
        errors.push('product-backed guides require featureId');
      }
      if (
        !Array.isArray(metadata.productSourceRefs) ||
        metadata.productSourceRefs.length === 0
      ) {
        errors.push('product-backed guides require productSourceRefs');
      }
      if (!Object.hasOwn(metadata, 'productRoute')) {
        errors.push(
          'product-backed guides require productRoute (use null plus routeUnavailableReason when none exists)'
        );
      } else if (
        metadata.productRoute === null &&
        (typeof metadata.routeUnavailableReason !== 'string' ||
          !metadata.routeUnavailableReason.trim())
      ) {
        errors.push('null productRoute requires routeUnavailableReason');
      }
    }
  }

  if (metadata.productBacked === false && metadata.featureId) {
    errors.push('non-product-backed documents must not declare featureId');
  }

  for (const featureId of featureIdsFor(metadata)) {
    if (!features.has(featureId)) {
      errors.push(`unknown featureId: ${featureId}`);
    }
  }

  if (typeof metadata.productRoute === 'string') {
    const registeredRoutes = new Set(routes.values());
    if (!registeredRoutes.has(routePath(metadata.productRoute))) {
      errors.push(`unknown productRoute: ${metadata.productRoute}`);
    }
  }

  if (metadata.status === 'certified') {
    if (!hasValidDate(metadata.lastVerifiedAt)) {
      errors.push('certified articles require lastVerifiedAt');
    }
    if (!['human', 'machine'].includes(metadata.verifiedBy)) {
      errors.push('certified articles require human or machine verification');
    }
    if (
      metadata.documentType === 'guide' &&
      (!Array.isArray(metadata.visualProofRefs) ||
        metadata.visualProofRefs.length === 0)
    ) {
      errors.push('certified guides require visualProofRefs');
    }
  }

  if (['draft', 'uncertified', 'retired'].includes(metadata.status)) {
    if (metadata.lastVerifiedAt !== null) {
      errors.push(`${metadata.status} articles require lastVerifiedAt: null`);
    }
    if (metadata.verifiedBy !== 'unverified') {
      errors.push(`${metadata.status} articles require verifiedBy: unverified`);
    }
  }

  if (metadata.launchPath === true && metadata.status === 'certified') {
    if (metadata.verifiedBy !== 'human') {
      errors.push('launchPath guides require human verification');
    }
    if (
      !Array.isArray(metadata.visualProofRefs) ||
      metadata.visualProofRefs.length === 0
    ) {
      errors.push('launchPath guides require visualProofRefs');
    }
  }

  if (metadata.documentType === 'legacy') {
    if (metadata.status !== 'retired') {
      errors.push('legacy documents must use retired status');
    }
    if (metadata.productBacked !== false) {
      errors.push(
        'legacy documents must be quarantined as productBacked: false'
      );
    }
  }

  if (['reference', 'landing'].includes(metadata.documentType)) {
    if (!['draft', 'published', 'retired'].includes(metadata.status)) {
      errors.push(
        `${metadata.documentType} status must be draft, published, or retired`
      );
    }
    if (metadata.productBacked !== false) {
      errors.push(
        `${metadata.documentType} documents must be productBacked: false`
      );
    }
  }

  if (errors.length > 0) throw articleMetadataError(sourcePath, errors);
  return metadata;
}

export function isPrimaryArticle(article) {
  if (article.documentType === 'guide') return article.status === 'certified';
  if (['reference', 'landing'].includes(article.documentType)) {
    return article.status === 'published';
  }
  return false;
}

export function buildArticleConsumers(articles) {
  const primary = articles.filter(isPrimaryArticle);
  return {
    navigation: [...primary],
    search: [...primary],
    sitemap: [...primary],
    related(articleId) {
      const source = primary.find(article => article.id === articleId);
      if (!source) return [];
      return primary.filter(
        article =>
          article.id !== source.id && article.category === source.category
      );
    },
  };
}

function serialized(value) {
  return JSON.stringify(value ?? null);
}

function changed(left, right) {
  return serialized(left) !== serialized(right);
}

function matchingRouteKeys(productRoute, beforeRoutes, afterRoutes) {
  const path = routePath(productRoute);
  return [...beforeRoutes.entries()]
    .filter(([, value]) => value === path)
    .filter(([key, value]) => afterRoutes.get(key) !== value)
    .map(([key]) => key);
}

function matchesSourcePath(changedPath, sourceRef) {
  return changedPath === sourceRef || changedPath.startsWith(`${sourceRef}/`);
}

export function findAffectedArticles({
  beforeArticles,
  afterArticles,
  beforeFeatures,
  afterFeatures,
  beforeRoutes,
  afterRoutes,
  changedPaths = [],
}) {
  const beforeById = new Map(
    beforeArticles.map(article => [article.id, article])
  );
  const afterById = new Map(
    afterArticles.map(article => [article.id, article])
  );
  const articleIds = new Set([...beforeById.keys(), ...afterById.keys()]);
  const affected = [];

  for (const articleId of [...articleIds].sort()) {
    const before = beforeById.get(articleId);
    const after = afterById.get(articleId);
    const article = after ?? before;
    if (!article || article.documentType === 'legacy') continue;
    const reasons = [];

    if (before && after) {
      const certificationBefore = {
        status: before.status,
        lastVerifiedAt: before.lastVerifiedAt,
        verifiedBy: before.verifiedBy,
        visualProofRefs: before.visualProofRefs,
      };
      const certificationAfter = {
        status: after.status,
        lastVerifiedAt: after.lastVerifiedAt,
        verifiedBy: after.verifiedBy,
        visualProofRefs: after.visualProofRefs,
      };
      if (changed(certificationBefore, certificationAfter)) {
        reasons.push('certification-state-changed');
      }
      if (changed(before.uiLabels, after.uiLabels)) {
        reasons.push('ui-label-declaration-changed');
      }
    }

    for (const featureId of featureIdsFor(article).sort()) {
      const beforeFeature = beforeFeatures.get(featureId);
      const afterFeature = afterFeatures.get(featureId);
      if (changed(beforeFeature?.status, afterFeature?.status)) {
        reasons.push(`feature-state-changed:${featureId}`);
      }
    }

    for (const routeKey of matchingRouteKeys(
      article.productRoute,
      beforeRoutes,
      afterRoutes
    ).sort()) {
      reasons.push(`product-route-changed:${routeKey}`);
    }

    for (const sourceRef of [...(article.productSourceRefs ?? [])].sort()) {
      if (changedPaths.some(path => matchesSourcePath(path, sourceRef))) {
        reasons.push(`product-source-changed:${sourceRef}`);
      }
    }

    if (reasons.length === 0) continue;
    affected.push({
      articleId,
      reasons: [...new Set(reasons)].sort(),
      needsRecertification:
        before?.status === 'certified' ||
        after?.status === 'certified' ||
        after?.status === 'stale',
    });
  }
  return affected;
}
