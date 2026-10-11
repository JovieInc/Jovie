import { createHash } from 'node:crypto';
import { readFileSync, realpathSync, statSync } from 'node:fs';
import { isAbsolute, relative, resolve } from 'node:path';

export function documentDigest(content) {
  return createHash('sha256')
    .update(content.replaceAll('\r\n', '\n'))
    .digest('hex');
}

function localFile(path, root) {
  if (typeof path !== 'string' || !path || isAbsolute(path)) {
    throw new Error('Expected a repository-relative file');
  }
  const absolute = realpathSync(resolve(root, path));
  const rel = relative(realpathSync(root), absolute);
  if (
    rel.startsWith('../') ||
    isAbsolute(rel) ||
    !statSync(absolute).isFile()
  ) {
    throw new Error('Source must be a file inside the repository');
  }
  return readFileSync(absolute, 'utf8').replaceAll('\r\n', '\n');
}

// Select stable facts/sections, not whole high-churn manifests or workflows.
export function readDocumentSource(source, root) {
  const text = localFile(source.path, root);
  if (source.pointer !== undefined && source.section !== undefined)
    throw new Error('Use exactly one source selector');
  if (typeof source.pointer === 'string' && source.pointer.startsWith('/')) {
    const keys = source.pointer
      .slice(1)
      .split('/')
      .map(key => key.replaceAll('~1', '/').replaceAll('~0', '~'));
    let value = JSON.parse(text);
    for (const key of keys) {
      if (
        value === null ||
        typeof value !== 'object' ||
        !Object.hasOwn(value, key)
      ) {
        throw new Error(`Missing JSON pointer ${source.pointer}`);
      }
      value = value[key];
    }
    return JSON.stringify(value);
  }
  if (typeof source.section === 'string' && /^#{1,6} .+/.test(source.section)) {
    const lines = text.split('\n');
    const matches = lines.flatMap((line, index) =>
      line === source.section ? [index] : []
    );
    if (matches.length !== 1)
      throw new Error('Source section must resolve exactly once');
    const level = source.section.indexOf(' ');
    const start = matches[0];
    let end = start + 1;
    while (end < lines.length) {
      const heading = /^(#{1,6}) /.exec(lines[end]);
      if (heading && heading[1].length <= level) break;
      end++;
    }
    return lines.slice(start, end).join('\n').trim();
  }
  if (source.pointer !== undefined || source.section !== undefined) {
    throw new Error('Invalid source selector');
  }
  const canonicalPath = relative(
    realpathSync(root),
    realpathSync(resolve(root, source.path))
  )
    .split('\\')
    .join('/');
  if (/(^|\/)package\.json$|^\.github\/workflows\//.test(canonicalPath)) {
    throw new Error(
      'Select a manifest value or workflow fact; do not hash the whole file'
    );
  }
  return text;
}

// CODEOWNERS uses last-match wins. Unsupported patterns fail closed so a new
// ownership syntax cannot silently retain an obsolete global assignment.
export function documentOwners(file, content) {
  let owners = [];
  for (const line of content.split('\n')) {
    const fields = line.split('#')[0].trim().split(/\s+/);
    const [pattern, ...names] = fields;
    if (!pattern || pattern.startsWith('#')) continue;
    if (/[!\[\]\\]/.test(pattern)) return [];
    const anchored =
      pattern.startsWith('/') || pattern.slice(0, -1).includes('/');
    let body = pattern.replace(/^\//, '').replace(/\/$/, '');
    body = body
      .split('**/')
      .map(segment =>
        segment
          .split('**')
          .map(part =>
            part
              .split('*')
              .map(token =>
                token
                  .split('?')
                  .map(text => text.replace(/[.+^${}()|]/g, '\\$&'))
                  .join('[^/]')
              )
              .join('[^/]*')
          )
          .join('.*')
      )
      .join('(?:.*/)?');
    if (new RegExp(`${anchored ? '^' : '(^|/)'}${body}(/|$)`).test(file)) {
      owners = names.filter(
        name => name.startsWith('@') && !name.includes('#')
      );
    }
  }
  return owners;
}

export function findDocumentReviewViolations(registry, files, root) {
  const violations = [];
  const add = (kind, file, detail) =>
    violations.push({
      kind,
      file,
      remediation: `${detail} Review the document against its declared source, then update only its entry in docs/doc-freshness-registry.json. Do not bulk-refresh review hashes.`,
    });
  const reviews = registry.documentReviews;
  if (!reviews || typeof reviews !== 'object' || Array.isArray(reviews)) {
    add(
      'missing-document-reviews',
      registry.agentsMap.path,
      'Declare owner/source reviews for every top-map document.'
    );
    return violations;
  }
  let codeowners;
  try {
    codeowners = localFile('.github/CODEOWNERS', root);
  } catch {
    codeowners = '';
  }
  const required = new Set(files);
  for (const file of Object.keys(reviews)) {
    if (!required.has(file))
      add(
        'unmapped-document-review',
        file,
        'Remove or remap this orphaned review.'
      );
  }
  for (const file of files) {
    const review = reviews[file];
    if (!review || typeof review !== 'object') {
      add(
        'missing-document-review',
        file,
        'Add a per-document owner and source review.'
      );
      continue;
    }
    if (!documentOwners(file, codeowners).includes(review.owner)) {
      add(
        'invalid-document-owner',
        file,
        'Owner must be a matching CODEOWNERS owner.'
      );
    }
    let document;
    try {
      document = localFile(file, root);
    } catch {
      add('missing-review-document', file, 'Restore the mapped document.');
      continue;
    }
    if (documentDigest(document) !== review.documentSha256) {
      add(
        'stale-document-review',
        file,
        'Document content changed since its source review.'
      );
    }
    if (typeof review.claim !== 'string' || !review.claim.trim()) {
      add(
        'missing-review-claim',
        file,
        'Explain the source-backed contract reviewed; a date alone is not evidence.'
      );
    }
    if (!Array.isArray(review.sources) || review.sources.length === 0) {
      add(
        'missing-document-source',
        file,
        'Declare at least one local source.'
      );
      continue;
    }
    for (const source of review.sources) {
      try {
        if (
          !source ||
          typeof source.path !== 'string' ||
          realpathSync(resolve(root, source.path)) ===
            realpathSync(resolve(root, file))
        )
          throw new Error('A document cannot be its own source');
        const current = readDocumentSource(source, root);
        if (documentDigest(current) !== source.sha256) {
          add(
            'stale-document-source',
            file,
            `Source ${source.path} changed since review.`
          );
        }
        if (source.documentValue !== undefined) {
          // Concrete scalar claims must agree with the selected source AND the prose.
          const actual = source.pointer ? JSON.parse(current) : current.trim();
          if (
            typeof actual !== 'string' ||
            actual !== source.documentValue ||
            !document.includes(source.documentValue)
          ) {
            add(
              'document-claim-drift',
              file,
              `The documented value for ${source.path} no longer matches its source.`
            );
          }
        }
      } catch (error) {
        add(
          'invalid-document-source',
          file,
          `Cannot validate declared source: ${error.message}.`
        );
      }
    }
  }
  return violations;
}
