/**
 * Help Center visual proof asset audit (JOV-5900).
 *
 * Pure functions shared by `scripts/help-center-visual-assets.mjs` and the
 * node:test suite. The audit compares three sources of truth:
 *
 *   1. Article `visualProofRefs` frontmatter (what guides claim to show).
 *   2. Files on disk under `apps/docs/public/proof/` (what exists).
 *   3. `manifest.json` written by the Playwright capture (provenance).
 *
 * Findings are deterministic: same inputs always produce the same ordered
 * report, so repeated runs on one build certify reproducibility.
 */

export const PROOF_REF_PREFIX = 'proof/';
export const PROOF_REF_RE = /^proof\/[a-z0-9]+(-[a-z0-9]+)*\.png$/;

/**
 * Minimum accepted asset pixel dimensions at the pinned 2x device scale.
 * Full-page captures use viewport * 2 exactly; locator crops may be smaller
 * but must still exceed this floor to be legible in articles.
 */
export const MIN_ASSET_WIDTH = 640;
export const MIN_ASSET_HEIGHT = 320;

const UNSAFE_TEXT_PATTERNS = [
  { name: 'email', re: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/ },
  {
    name: 'secret-token',
    re: /\b(?:sk|pk|key|token|secret|bearer)[_-][A-Za-z0-9_-]{8,}\b/i,
  },
  {
    name: 'jwt',
    re: /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/,
  },
  {
    name: 'uuid',
    re: /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/i,
  },
];

/**
 * Return the names of unsafe patterns found in capture-plan metadata
 * (titles, alt text, routes). An empty array means the text is safe to ship.
 */
export function findUnsafeCaptureText(text) {
  if (typeof text !== 'string' || !text) return [];
  return UNSAFE_TEXT_PATTERNS.filter(({ re }) => re.test(text)).map(
    ({ name }) => name
  );
}

/** Parse PNG IHDR dimensions without external dependencies. */
export function parsePngDimensions(bytes) {
  if (!bytes || bytes.length < 24) return null;
  const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  for (let i = 0; i < PNG_MAGIC.length; i += 1) {
    if (bytes[i] !== PNG_MAGIC[i]) return null;
  }
  return {
    width: bytes.readUInt32BE(16),
    height: bytes.readUInt32BE(20),
  };
}

function finding(code, ref, detail, extra = {}) {
  return { code, ref, detail, ...extra };
}

function sortedFindings(findings) {
  return findings.sort(
    (a, b) =>
      a.code.localeCompare(b.code) ||
      String(a.ref).localeCompare(String(b.ref)) ||
      String(a.detail).localeCompare(String(b.detail))
  );
}

/**
 * Audit visual proof assets.
 *
 * @param {object} input
 * @param {Array} input.articles - registry articles with `visualProofRefs`,
 *   `status`, and `lastVerifiedAt`.
 * @param {Array} input.planEntries - capture plan entries (`articleId`, `step`).
 * @param {Map<string, {sha256: string, width: number, height: number}>} input.assets
 *   - files on disk keyed by `proof/<name>.png` ref.
 * @param {Array} input.manifestEntries - manifest entries keyed by `ref` with
 *   `capturedAt`, `gitSha`, `width`, `height`, `viewportCss`,
 *   `deviceScaleFactor`, and `captureTarget`.
 * @param {string|null} [input.currentGitSha] - build SHA being certified;
 *   when provided, manifest entries captured against another SHA are flagged.
 */
export function auditVisualProofAssets({
  articles = [],
  planEntries = [],
  assets = new Map(),
  manifestEntries = [],
  currentGitSha = null,
} = {}) {
  const findings = [];
  const manifestByRef = new Map(
    manifestEntries
      .filter(entry => entry && typeof entry.ref === 'string')
      .map(entry => [entry.ref, entry])
  );

  const referencedRefs = new Map();
  for (const article of articles) {
    for (const ref of article.visualProofRefs ?? []) {
      referencedRefs.set(ref, article);
      if (!PROOF_REF_RE.test(ref)) {
        findings.push(
          finding(
            'invalid-ref',
            ref,
            `article ${article.id} references a proof asset outside the proof/ naming contract`
          )
        );
        continue;
      }
      if (!assets.has(ref)) {
        findings.push(
          finding(
            'missing-asset',
            ref,
            `article ${article.id} references an asset that was not captured`,
            { articleId: article.id }
          )
        );
      }
      for (const unsafe of findUnsafeCaptureText(ref)) {
        findings.push(
          finding(
            'unsafe-ref',
            ref,
            `article ${article.id} proof ref contains ${unsafe} content`,
            { articleId: article.id }
          )
        );
      }
    }
  }

  for (const entry of planEntries) {
    const ref = `${PROOF_REF_PREFIX}${entry.articleId}-${entry.step}.png`;
    if (!assets.has(ref)) {
      findings.push(
        finding(
          'missing-asset',
          ref,
          `capture plan entry ${entry.id} has not produced an asset`,
          { articleId: entry.articleId }
        )
      );
    }
    for (const field of ['title', 'alt']) {
      for (const unsafe of findUnsafeCaptureText(entry[field])) {
        findings.push(
          finding(
            'unsafe-plan-text',
            ref,
            `plan ${entry.id} ${field} contains ${unsafe} content`,
            { articleId: entry.articleId }
          )
        );
      }
    }
  }

  for (const [ref, asset] of assets) {
    if (!referencedRefs.has(ref)) {
      findings.push(
        finding(
          'orphaned-asset',
          ref,
          'asset exists on disk but no article references it'
        )
      );
    }
    if (
      typeof asset.width !== 'number' ||
      typeof asset.height !== 'number' ||
      asset.width < MIN_ASSET_WIDTH ||
      asset.height < MIN_ASSET_HEIGHT
    ) {
      findings.push(
        finding(
          'invalid-dimensions',
          ref,
          `asset is ${asset.width}x${asset.height}; minimum is ${MIN_ASSET_WIDTH}x${MIN_ASSET_HEIGHT}`
        )
      );
    }

    const manifest = manifestByRef.get(ref);
    if (!manifest) {
      findings.push(
        finding(
          'missing-manifest-entry',
          ref,
          'asset has no provenance entry in manifest.json'
        )
      );
      continue;
    }

    if (manifest.sha256 && asset.sha256 && manifest.sha256 !== asset.sha256) {
      findings.push(
        finding(
          'manifest-mismatch',
          ref,
          'manifest sha256 does not match the asset on disk'
        )
      );
    }

    if (
      manifest.captureTarget === 'page' &&
      manifest.viewportCss &&
      typeof manifest.deviceScaleFactor === 'number'
    ) {
      const expectedWidth =
        manifest.viewportCss.width * manifest.deviceScaleFactor;
      if (manifest.width !== expectedWidth) {
        findings.push(
          finding(
            'invalid-dimensions',
            ref,
            `page capture width ${manifest.width} does not match viewport ${manifest.viewportCss.width}@${manifest.deviceScaleFactor}x`
          )
        );
      }
    }

    const article = referencedRefs.get(ref);
    if (
      article?.lastVerifiedAt &&
      typeof manifest.capturedAt === 'string' &&
      manifest.capturedAt.slice(0, 10) < article.lastVerifiedAt
    ) {
      findings.push(
        finding(
          'stale-capture',
          ref,
          `captured at ${manifest.capturedAt} before article verification ${article.lastVerifiedAt}`,
          { articleId: article.id }
        )
      );
    }

    if (currentGitSha && manifest.gitSha && manifest.gitSha !== currentGitSha) {
      findings.push(
        finding(
          'stale-build',
          ref,
          `captured against build ${manifest.gitSha}; current build is ${currentGitSha}`
        )
      );
    }
  }

  const byHash = new Map();
  for (const [ref, asset] of assets) {
    if (!asset.sha256) continue;
    const group = byHash.get(asset.sha256) ?? [];
    group.push(ref);
    byHash.set(asset.sha256, group);
  }
  for (const [sha256, refs] of byHash) {
    if (refs.length > 1) {
      findings.push(
        finding(
          'duplicate-asset',
          refs.sort().join(' '),
          `identical content sha256 ${sha256.slice(0, 12)} used by ${refs.length} assets`
        )
      );
    }
  }

  return sortedFindings(findings);
}

/**
 * Reduce the capture plan to entries whose articles were affected by a diff.
 * `affected` is the output of `findAffectedArticles` in article-metadata.mjs.
 */
export function selectAffectedPlanEntries(planEntries, affected) {
  const affectedIds = new Set(
    (affected ?? []).map(entry => entry.articleId ?? entry.id).filter(Boolean)
  );
  return planEntries.filter(entry => affectedIds.has(entry.articleId));
}

/**
 * Build a remediation issue payload for a failed or stale capture. The caller
 * decides whether to file it; the fingerprint matches the recertification
 * convention so repeated failures update one Linear issue instead of
 * duplicating it.
 */
export function buildVisualProofIssue({ articleId, findings }) {
  const articleFindings = findings.filter(
    item => item.articleId === articleId || !item.articleId
  );
  const lines = articleFindings.map(
    item => `- \`${item.code}\` ${item.ref}: ${item.detail}`
  );
  return {
    fingerprint: `docs-visual-proof:${articleId}`,
    title: `Help Center visual proof remediation: ${articleId}`,
    body: [
      `Visual proof capture for article \`${articleId}\` produced actionable findings.`,
      '',
      ...lines,
      '',
      'Re-run the scoped capture after fixing the underlying route or selector:',
      '`pnpm --filter web docs-guide-shots -- --grep ' + articleId + '`',
    ].join('\n'),
  };
}
