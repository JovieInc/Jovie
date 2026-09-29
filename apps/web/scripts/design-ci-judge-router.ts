/**
 * JOV-INV-040: Design CI batch judge router (JOV-6944).
 *
 * Enumerates the certifiable units that already exist in code (screen
 * registry, marketing component registry, app-screen registry) and the
 * adopted invariant registry, computes which invariants are applicable to
 * which units, and routes each applicable cell to exactly one judge:
 * deterministic (existing invariant enforcement), Jev (text/structured
 * evaluator), visual (rendered/pixel evaluator), or human. A cell whose
 * judge cannot be determined from existing registry metadata is marked
 * `insufficient` rather than guessed.
 *
 * This module proves discovery, applicability, and routing, and can
 * persist through the real `jovie.certification/v1` registry (see
 * fingerprintCells/persistCells below). It does not yet dispatch real
 * per-unit judge evaluation into the matrix itself — every cell's state
 * stays `insufficient` here by construction. That each judge route's real
 * mechanism can genuinely fail is proven directly against the real
 * judges (scripts/invariants/overlay-layer-contract.mjs, design-surfaces.mjs,
 * jev-shadow.mjs) in design-ci-judge-router-evaluation.test.ts, not by a
 * dispatcher owned by this file.
 *
 *   tsx scripts/design-ci-judge-router.ts [--json] [--persist [--base-url <url>]]
 */
import { createHash } from 'node:crypto';
import { dirname, resolve as resolvePath } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  APP_SCREEN_COMPONENT_REGISTRY,
  APP_SCREEN_REGISTRY,
} from '../data/appScreens/registry';
import { MARKETING_COMPONENT_REGISTRY } from '../data/marketing/componentRegistry';

/**
 * `fileURLToPath(import.meta.url)` takes the plain string `import.meta.url`
 * (spec-guaranteed a string, never a URL instance), so it never touches a
 * global `URL` constructor. Deliberately not `new URL('../..', import.meta.url)`
 * — under Vitest's jsdom test environment the global `URL` is jsdom's own
 * polyfill, not Node's, and passing that instance into `fileURLToPath` throws
 * "The URL must be of scheme file". `scripts/invariants/registry.mjs`'s own
 * default `repoRoot` hits exactly this when dynamically imported under a
 * jsdom test run, so this module always passes its own safely-derived
 * `REPO_ROOT` explicitly rather than relying on that default.
 */
export const REPO_ROOT = resolvePath(
  dirname(fileURLToPath(import.meta.url)),
  '../../..'
);

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** One of the four judge kinds this router can name, or `insufficient` when
 * no existing registry metadata proves which judge applies. Never guessed. */
export type JudgeRoute =
  | 'deterministic'
  | 'jev'
  | 'visual'
  | 'human'
  | 'insufficient';

/**
 * A cell's persisted state is always one of these three. `insufficient`
 * covers two distinct reasons (see `InsufficientReason`): the judge itself
 * is unknown, or a known judge simply has not evaluated this cell yet. This
 * module never produces `pass`/`fail` — that requires real evaluation,
 * which is out of scope for slice 1.
 */
export type CellState = 'pass' | 'fail' | 'insufficient';

export type InsufficientReason = 'unroutable-judge' | 'not-yet-evaluated';

export type UnitKind =
  | 'screen'
  | 'marketing-component'
  | 'app-screen'
  | 'app-component';

export interface CertifiableUnit {
  readonly id: string;
  readonly kind: UnitKind;
  /** The id as it appears in its owning registry (e.g. `web.homepage`, `shell.footer`). */
  readonly sourceId: string;
  readonly sources: readonly string[];
  readonly products: readonly string[];
  readonly surfaceTags: readonly string[];
}

export interface RoutedInvariantRow {
  /** `JOV-INV-038#dominant-first-hierarchy` for an exploded sub-rule, else the bare invariant id. */
  readonly rowId: string;
  readonly invariantId: string;
  readonly ruleId: string | null;
  readonly title: string;
  readonly products: readonly string[];
  readonly surfaces: readonly string[];
  readonly route: JudgeRoute;
  /** Which existing registry fields produced `route`, for review/debugging. */
  readonly routeEvidence: readonly string[];
  /**
   * The raw policy/rule value this row was routed from, kept only so the
   * `--persist` path can fingerprint "has this invariant's rubric changed"
   * without re-fetching the whole registry. Not used by routing itself.
   */
  readonly policyFingerprintSource?: unknown;
}

export interface MatrixCell {
  readonly rowId: string;
  readonly unitId: string;
  readonly route: JudgeRoute;
  readonly state: CellState;
  readonly insufficientReason: InsufficientReason | null;
}

export interface DesignCiJudgeMatrix {
  readonly generatedAt: string;
  readonly rows: readonly RoutedInvariantRow[];
  readonly units: readonly CertifiableUnit[];
  /** Only cells where the row's scope overlaps the unit's tags. Non-applicable
   * (invariant, unit) pairs are not represented at all — they are not a gap. */
  readonly cells: readonly MatrixCell[];
}

// ---------------------------------------------------------------------------
// Minimal shape of what we read from scripts/invariants/*.mjs. These are
// plain JS modules loaded with a runtime `await import()` (see
// `loadInvariantRegistryModule`/`loadScreenCertificationModule` below) so a
// repo-root .mjs never has to sit inside apps/web's TS project boundary —
// the same pattern `scripts/marketing-certification-producer.ts` already
// uses for `scripts/lib/linear-issue-intake.mjs`.
// ---------------------------------------------------------------------------

interface InvariantEnforcementConsumer {
  readonly name?: string;
  readonly path?: string;
}

interface InvariantDesignRule {
  readonly id: string;
  readonly classification?: string;
  readonly evaluator?: string;
  readonly evaluatorReceipt?: string;
  readonly detectors?: readonly string[];
}

interface InvariantRecord {
  readonly id: string;
  readonly title: string;
  readonly scope?: {
    readonly products?: readonly string[];
    readonly surfaces?: readonly string[];
  };
  readonly policy?: {
    readonly value?: {
      readonly rules?: readonly InvariantDesignRule[];
    };
  };
  readonly enforcementConsumers?: readonly InvariantEnforcementConsumer[];
  readonly lifecycle?: {
    readonly state?: string;
  };
}

interface InvariantRegistry {
  readonly invariants: readonly InvariantRecord[];
}

interface ScreenRegistryEntry {
  readonly id: string;
  readonly platform: string;
  readonly owner: string;
  readonly sources: readonly string[];
  readonly excluded?: boolean;
}

async function loadInvariantRegistryModule(): Promise<{
  readInvariantRegistry: (repoRoot: string) => InvariantRegistry;
}> {
  return (await import('../../../scripts/invariants/registry.mjs')) as {
    readInvariantRegistry: (repoRoot: string) => InvariantRegistry;
  };
}

async function loadScreenCertificationModule(): Promise<{
  SCREEN_REGISTRY: readonly ScreenRegistryEntry[];
  hashArtifactBytes: (artifactPath: string) => string | null;
}> {
  return (await import(
    '../../../scripts/invariants/screen-certification.mjs'
  )) as {
    SCREEN_REGISTRY: readonly ScreenRegistryEntry[];
    hashArtifactBytes: (artifactPath: string) => string | null;
  };
}

// ---------------------------------------------------------------------------
// Applicability: mirrors scripts/invariants/registry.mjs's own
// contradiction-detection `intersects()`/`overlaps()` helpers (wildcard `*`
// plus array intersection). Re-implemented here as a tiny pure predicate
// rather than importing an unexported internal — same semantics, no new
// registry.
// ---------------------------------------------------------------------------

function tagsOverlap(
  left: readonly string[] | undefined,
  right: readonly string[] | undefined
): boolean {
  const a = left ?? [];
  const b = right ?? [];
  if (a.includes('*') || b.includes('*')) return true;
  return a.some(tag => b.includes(tag));
}

export function surfacesOverlap(
  row: Pick<RoutedInvariantRow, 'products' | 'surfaces'>,
  unit: Pick<CertifiableUnit, 'products' | 'surfaceTags'>
): boolean {
  return (
    tagsOverlap(row.products, unit.products) &&
    tagsOverlap(row.surfaces, unit.surfaceTags)
  );
}

// ---------------------------------------------------------------------------
// Unit enumeration
// ---------------------------------------------------------------------------

/**
 * Path-prefix -> surface tags. Additive: every matching prefix contributes
 * its tags; `apps/web/` always contributes `web` as a floor. Derived only
 * from source paths and the screen registry's own `platform` field, both
 * already-existing metadata — never a per-unit guess.
 */
const PATH_SURFACE_TAG_RULES: ReadonlyArray<{
  readonly prefix: string;
  readonly tags: readonly string[];
}> = [
  { prefix: 'apps/web/app/(marketing)/', tags: ['marketing', 'public-web'] },
  { prefix: 'apps/web/app/(home)/', tags: ['marketing', 'public-web'] },
  { prefix: 'apps/web/app/waitlist', tags: ['marketing', 'public-web'] },
  { prefix: 'apps/web/app/artists', tags: ['marketing', 'public-web'] },
  { prefix: 'apps/web/app/brand', tags: ['marketing', 'public-web'] },
  {
    prefix: 'apps/web/app/(dynamic)/legal/',
    tags: ['marketing', 'public-web'],
  },
  { prefix: 'apps/web/app/investor-portal/', tags: ['public-web'] },
  { prefix: 'apps/web/app/app/(shell)/', tags: ['web-app', 'app-shell'] },
  {
    prefix: 'apps/web/components/marketing/',
    tags: ['marketing', 'public-web'],
  },
  { prefix: 'apps/web/components/site/', tags: ['marketing', 'public-web'] },
  { prefix: 'packages/ui/', tags: ['packages-ui'] },
];

function deriveSurfaceTags(sources: readonly string[]): string[] {
  const tags = new Set<string>();
  for (const source of sources) {
    if (source.startsWith('apps/web/')) tags.add('web');
    if (source.startsWith('apps/macos/')) tags.add('macos-electron');
    if (source.startsWith('apps/ios/')) tags.add('ios');
    for (const rule of PATH_SURFACE_TAG_RULES) {
      if (source.startsWith(rule.prefix))
        for (const t of rule.tags) tags.add(t);
    }
  }
  return [...tags];
}

function screenPlatformTags(platform: string): string[] {
  if (platform === 'macos-electron') return ['macos-electron'];
  if (platform === 'ios') return ['ios'];
  return [];
}

async function enumerateScreenUnits(): Promise<CertifiableUnit[]> {
  const { SCREEN_REGISTRY } = await loadScreenCertificationModule();
  return SCREEN_REGISTRY.filter(entry => !entry.excluded).map(entry => ({
    id: `screen:${entry.id}`,
    kind: 'screen' as const,
    sourceId: entry.id,
    sources: entry.sources,
    products: ['Jovie'],
    surfaceTags: [
      ...screenPlatformTags(entry.platform),
      ...deriveSurfaceTags(entry.sources),
    ],
  }));
}

function marketingEntrySource(entry: {
  readonly resolvedSource?: string | null;
  readonly source?: string | null;
}): string | null {
  return entry.resolvedSource ?? entry.source ?? null;
}

function enumerateMarketingUnits(): CertifiableUnit[] {
  return MARKETING_COMPONENT_REGISTRY.map(entry => {
    const source = marketingEntrySource(entry);
    const sources = source ? [source] : [];
    return {
      id: `marketing-component:${entry.id}`,
      kind: 'marketing-component' as const,
      sourceId: entry.id,
      sources,
      products: ['Jovie'],
      surfaceTags: ['marketing', 'public-web', ...deriveSurfaceTags(sources)],
    };
  });
}

function enumerateAppScreenUnits(): CertifiableUnit[] {
  const screens: CertifiableUnit[] = APP_SCREEN_REGISTRY.map(entry => ({
    id: `app-screen:${entry.id}`,
    kind: 'app-screen' as const,
    sourceId: entry.id,
    sources: [entry.source],
    products: ['Jovie'],
    surfaceTags: ['web-app', 'app-shell', ...deriveSurfaceTags([entry.source])],
  }));
  const components: CertifiableUnit[] = APP_SCREEN_COMPONENT_REGISTRY.map(
    entry => ({
      id: `app-component:${entry.id}`,
      kind: 'app-component' as const,
      sourceId: entry.id,
      sources: [entry.source],
      products: ['Jovie'],
      surfaceTags: [
        'web-app',
        'app-shell',
        ...deriveSurfaceTags([entry.source]),
      ],
    })
  );
  return [...screens, ...components];
}

export async function enumerateUnits(): Promise<CertifiableUnit[]> {
  const screenUnits = await enumerateScreenUnits();
  return [
    ...screenUnits,
    ...enumerateMarketingUnits(),
    ...enumerateAppScreenUnits(),
  ];
}

// ---------------------------------------------------------------------------
// Invariant routing
// ---------------------------------------------------------------------------

const EXECUTABLE_EXTENSIONS = new Set([
  'mjs',
  'js',
  'ts',
  'tsx',
  'py',
  'sh',
  'yml',
]);
const VISUAL_CONSUMER_PREFIX = 'scripts/vision/';
/** Exact filename shape, not a loose substring: `jev-<name>.mjs` or
 * `jev-<name>.test.mjs`, anchored to the final path segment. */
const JEV_CONSUMER_PATTERN = /(?:^|\/)jev-[a-z0-9-]+\.(?:test\.)?mjs$/;

function consumerExtension(path: string): string {
  const dot = path.lastIndexOf('.');
  return dot === -1 ? '' : path.slice(dot + 1);
}

/**
 * Routes a plain (non-exploded) invariant from its `enforcementConsumers`.
 * Precise matches only — a path merely containing "vision" or "jev" as a
 * substring of an unrelated word must not match (see deliberate-red tests).
 */
export function routeFromEnforcementConsumers(
  consumers: readonly InvariantEnforcementConsumer[] | undefined
): { readonly route: JudgeRoute; readonly evidence: readonly string[] } {
  const paths = (consumers ?? [])
    .map(c => c.path)
    .filter((p): p is string => typeof p === 'string' && p.length > 0);

  const visualHit = paths.find(p => p.startsWith(VISUAL_CONSUMER_PREFIX));
  if (visualHit) return { route: 'visual', evidence: [visualHit] };

  const jevHit = paths.find(p => JEV_CONSUMER_PATTERN.test(p));
  if (jevHit) return { route: 'jev', evidence: [jevHit] };

  const executable = paths.filter(p =>
    EXECUTABLE_EXTENSIONS.has(consumerExtension(p))
  );
  if (executable.length > 0)
    return { route: 'deterministic', evidence: executable };

  return { route: 'insufficient', evidence: [] };
}

/**
 * Routes one exploded design-rule sub-cell (JOV-INV-038 house pattern) from
 * its own `classification` field. An unrecognized classification string is
 * `insufficient`, never guessed toward whichever route seems closest.
 */
export function routeFromRuleClassification(rule: InvariantDesignRule): {
  readonly route: JudgeRoute;
  readonly evidence: readonly string[];
} {
  if (rule.classification === 'deterministic') {
    return { route: 'deterministic', evidence: [...(rule.detectors ?? [])] };
  }
  if (rule.classification === 'visual-semantic') {
    const evidence = [rule.evaluator, rule.evaluatorReceipt].filter(
      (v): v is string => typeof v === 'string'
    );
    return { route: 'visual', evidence };
  }
  return { route: 'insufficient', evidence: [] };
}

export function enumerateInvariantRows(
  registry: InvariantRegistry
): RoutedInvariantRow[] {
  const rows: RoutedInvariantRow[] = [];
  for (const invariant of registry.invariants) {
    if (invariant.lifecycle?.state !== 'adopted') continue;
    const products = invariant.scope?.products ?? [];
    const surfaces = invariant.scope?.surfaces ?? [];
    const rules = invariant.policy?.value?.rules;
    if (Array.isArray(rules) && rules.length > 0) {
      for (const rule of rules) {
        const { route, evidence } = routeFromRuleClassification(rule);
        rows.push({
          rowId: `${invariant.id}#${rule.id}`,
          invariantId: invariant.id,
          ruleId: rule.id,
          title: `${invariant.title} — ${rule.id}`,
          products,
          surfaces,
          route,
          routeEvidence: evidence,
          policyFingerprintSource: rule,
        });
      }
      continue;
    }
    const { route, evidence } = routeFromEnforcementConsumers(
      invariant.enforcementConsumers
    );
    rows.push({
      rowId: invariant.id,
      invariantId: invariant.id,
      ruleId: null,
      title: invariant.title,
      products,
      surfaces,
      route,
      routeEvidence: evidence,
      policyFingerprintSource: invariant.policy,
    });
  }
  return rows;
}

// ---------------------------------------------------------------------------
// Matrix assembly
// ---------------------------------------------------------------------------

/**
 * Every cell this slice produces is `insufficient`: either the judge is
 * unknown (`unroutable-judge`) or a real judge exists but nothing has
 * evaluated this specific unit against this specific row yet
 * (`not-yet-evaluated`). Wiring an actual judge invocation and persisting a
 * real pass/fail is JOV-6944 slice 2/3.
 */
function cellFor(row: RoutedInvariantRow, unit: CertifiableUnit): MatrixCell {
  const insufficientReason: InsufficientReason =
    row.route === 'insufficient' ? 'unroutable-judge' : 'not-yet-evaluated';
  return {
    rowId: row.rowId,
    unitId: unit.id,
    route: row.route,
    state: 'insufficient',
    insufficientReason,
  };
}

export function buildCells(
  rows: readonly RoutedInvariantRow[],
  units: readonly CertifiableUnit[]
): MatrixCell[] {
  const cells: MatrixCell[] = [];
  for (const row of rows) {
    for (const unit of units) {
      if (surfacesOverlap(row, unit)) cells.push(cellFor(row, unit));
    }
  }
  return cells;
}

export async function buildDesignCiJudgeMatrix(): Promise<DesignCiJudgeMatrix> {
  const { readInvariantRegistry } = await loadInvariantRegistryModule();
  const registry = readInvariantRegistry(REPO_ROOT);
  const rows = enumerateInvariantRows(registry);
  const units = await enumerateUnits();
  const cells = buildCells(rows, units);
  return { generatedAt: new Date().toISOString(), rows, units, cells };
}

// ---------------------------------------------------------------------------
// Fingerprints (only computed on the --persist path; routing itself never
// needs them). Mirrors the `sha256:<hex>` shape and the sorted-key stable
// stringify already used by scripts/invariants/registry.mjs and
// certification-adapter.ts's own digest helper.
// ---------------------------------------------------------------------------

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => `${JSON.stringify(key)}:${stableStringify(item)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

function sha256Fingerprint(value: unknown): string {
  return `sha256:${createHash('sha256').update(stableStringify(value)).digest('hex')}`;
}

/**
 * Hashes the unit's actual source bytes, reusing
 * `screen-certification.mjs`'s own `hashArtifactBytes` (file or, for a
 * directory-style source such as an engineering-publication screen, every
 * file inside it in sorted order) rather than a second implementation of
 * the same file-vs-directory hashing. A source that resolves to neither a
 * file nor a directory falls back into the combined path list, still
 * deterministic, just coarser.
 */
export async function computeArtifactHash(
  unit: CertifiableUnit,
  repoRoot: string
): Promise<string> {
  const { hashArtifactBytes } = await loadScreenCertificationModule();
  const perSource = unit.sources
    .map(
      source =>
        [source, hashArtifactBytes(resolvePath(repoRoot, source))] as const
    )
    .sort(([a], [b]) => a.localeCompare(b));
  return sha256Fingerprint(perSource);
}

export function computeRubricFingerprint(row: RoutedInvariantRow): string {
  return sha256Fingerprint({
    rowId: row.rowId,
    route: row.route,
    policy: row.policyFingerprintSource ?? null,
  });
}

export interface FingerprintedCell extends MatrixCell {
  readonly evidence: readonly string[];
  readonly artifactHash: string;
  readonly rubricFingerprint: string;
  readonly inputFingerprint: string;
}

/**
 * Skip-unless-changed is ultimately enforced by the store (it compares
 * `inputFingerprint` against what it already persisted), but the
 * fingerprint itself is computed here from the unit's real source bytes
 * plus the invariant's own policy — not from anything the store owns.
 */
export async function fingerprintCells(
  matrix: DesignCiJudgeMatrix,
  repoRoot: string
): Promise<FingerprintedCell[]> {
  const rowById = new Map(matrix.rows.map(row => [row.rowId, row]));
  const unitById = new Map(matrix.units.map(unit => [unit.id, unit]));
  const artifactHashByUnit = new Map<string, string>(
    await Promise.all(
      matrix.units.map(
        async unit =>
          [unit.id, await computeArtifactHash(unit, repoRoot)] as const
      )
    )
  );
  return matrix.cells.map(cell => {
    const row = rowById.get(cell.rowId);
    const unit = unitById.get(cell.unitId);
    const artifactHash = unit ? artifactHashByUnit.get(unit.id) : undefined;
    if (!row || !unit || artifactHash === undefined) {
      throw new Error(
        `design-ci-judge-router: cell ${cell.rowId}::${cell.unitId} references a row or unit missing from this matrix.`
      );
    }
    const rubricFingerprint = computeRubricFingerprint(row);
    const inputFingerprint = sha256Fingerprint({
      artifactHash,
      rubricFingerprint,
      route: cell.route,
    });
    return {
      ...cell,
      evidence: row.routeEvidence,
      artifactHash,
      rubricFingerprint,
      inputFingerprint,
    };
  });
}

// ---------------------------------------------------------------------------
// Persistence (opt-in only — never attempted unless --persist is passed).
// The CLI never talks to Postgres directly; it posts to the same kind of
// cron-secret-authenticated internal route the JOV-6928 marketing producer
// already uses, so a missing DB in this environment is simply a missing
// route/secret to fail closed on, not a reason to invent a local fallback.
// ---------------------------------------------------------------------------

const DESIGN_CI_JUDGE_EVIDENCE_PATH =
  '/api/internal/ovie/design-ci-judge-evidence';
const PERSIST_BATCH_SIZE = 200;

interface PersistBatchResponse {
  readonly written: readonly string[];
  readonly skippedUnchanged: readonly string[];
}

export async function persistCells(
  cells: readonly FingerprintedCell[],
  options: { readonly baseUrl: string; readonly cronSecret: string | undefined }
): Promise<{ written: number; skippedUnchanged: number }> {
  if (!options.cronSecret) {
    throw new Error(
      'design-ci-judge-router --persist: CRON_SECRET is not set. Failing closed rather than silently skipping persistence — set CRON_SECRET or omit --persist.'
    );
  }
  const evaluatedAt = new Date().toISOString();
  let written = 0;
  let skippedUnchanged = 0;
  for (let i = 0; i < cells.length; i += PERSIST_BATCH_SIZE) {
    const batch = cells.slice(i, i + PERSIST_BATCH_SIZE).map(cell => ({
      cellId: `${cell.rowId}::${cell.unitId}`,
      rowId: cell.rowId,
      unitId: cell.unitId,
      route: cell.route,
      state: cell.state,
      evidence: cell.evidence,
      artifactHash: cell.artifactHash,
      rubricFingerprint: cell.rubricFingerprint,
      inputFingerprint: cell.inputFingerprint,
    }));
    let response: Response;
    try {
      response = await fetch(
        new URL(DESIGN_CI_JUDGE_EVIDENCE_PATH, options.baseUrl),
        {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            authorization: `Bearer ${options.cronSecret}`,
          },
          body: JSON.stringify({ evaluatedAt, cells: batch }),
        }
      );
    } catch (error) {
      throw new Error(
        `design-ci-judge-router --persist: could not reach ${options.baseUrl}${DESIGN_CI_JUDGE_EVIDENCE_PATH} (${String(error)}). Failing closed rather than skipping persistence silently.`
      );
    }
    const body = await response.text();
    if (!response.ok) {
      throw new Error(
        `design-ci-judge-router --persist: evidence route returned ${response.status}: ${body.slice(0, 500)}`
      );
    }
    const parsed = JSON.parse(body) as PersistBatchResponse;
    written += parsed.written.length;
    skippedUnchanged += parsed.skippedUnchanged.length;
  }
  return { written, skippedUnchanged };
}

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------

function countBy<T, K extends string>(
  items: readonly T[],
  key: (item: T) => K
) {
  const counts = new Map<K, number>();
  for (const item of items)
    counts.set(key(item), (counts.get(key(item)) ?? 0) + 1);
  return counts;
}

export function formatMatrixReport(matrix: DesignCiJudgeMatrix): string {
  const lines: string[] = [];
  lines.push(`design-ci judge matrix — generated ${matrix.generatedAt}`);
  lines.push(
    `rows=${matrix.rows.length} units=${matrix.units.length} cells=${matrix.cells.length}`
  );

  const byState = countBy(matrix.cells, c => c.state);
  const byRoute = countBy(matrix.cells, c => c.route);
  const byReason = countBy(
    matrix.cells.filter(c => c.state === 'insufficient'),
    c => c.insufficientReason ?? 'unknown'
  );

  lines.push('');
  lines.push('by state:');
  for (const state of ['pass', 'fail', 'insufficient'] as const) {
    lines.push(`  ${state}: ${byState.get(state) ?? 0}`);
  }
  lines.push('by judge route:');
  for (const route of [
    'deterministic',
    'jev',
    'visual',
    'human',
    'insufficient',
  ] as const) {
    lines.push(`  ${route}: ${byRoute.get(route) ?? 0}`);
  }
  lines.push('insufficient reasons:');
  for (const reason of ['not-yet-evaluated', 'unroutable-judge'] as const) {
    lines.push(`  ${reason}: ${byReason.get(reason) ?? 0}`);
  }

  const unroutable = matrix.rows.filter(row => row.route === 'insufficient');
  lines.push('');
  lines.push(`unroutable invariant rows (${unroutable.length}):`);
  for (const row of unroutable) {
    lines.push(`  ${row.rowId} — ${row.title}`);
  }

  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

function argValue(flag: string): string | undefined {
  const index = process.argv.indexOf(flag);
  return index === -1 ? undefined : process.argv[index + 1];
}

async function main(): Promise<void> {
  const matrix = await buildDesignCiJudgeMatrix();
  if (process.argv.includes('--json')) {
    process.stdout.write(`${JSON.stringify(matrix, null, 2)}\n`);
  } else {
    process.stdout.write(`${formatMatrixReport(matrix)}\n`);
  }
  if (matrix.rows.length === 0 || matrix.units.length === 0) {
    process.stderr.write(
      'design-ci-judge-router: empty rows or units — this is a bug, not a clean matrix.\n'
    );
    process.exitCode = 1;
    return;
  }

  // Read-only by default. Nothing below this line runs unless --persist is
  // explicitly passed, and any failure here fails closed (non-zero exit,
  // clear message) rather than silently skipping the write.
  if (!process.argv.includes('--persist')) return;

  const baseUrl =
    argValue('--base-url') ?? process.env.DESIGN_CI_JUDGE_BASE_URL;
  if (!baseUrl) {
    process.stderr.write(
      'design-ci-judge-router --persist: no --base-url given and DESIGN_CI_JUDGE_BASE_URL is not set. Failing closed rather than guessing a target.\n'
    );
    process.exitCode = 1;
    return;
  }

  const fingerprinted = await fingerprintCells(matrix, REPO_ROOT);
  try {
    const result = await persistCells(fingerprinted, {
      baseUrl,
      cronSecret: process.env.CRON_SECRET,
    });
    process.stdout.write(
      `persisted: ${result.written} written, ${result.skippedUnchanged} skipped (unchanged)\n`
    );
  } catch (error) {
    process.stderr.write(
      `${error instanceof Error ? error.message : String(error)}\n`
    );
    process.exitCode = 1;
  }
}

const isMain = process.argv[1]?.endsWith('design-ci-judge-router.ts');
if (isMain) {
  main().catch(error => {
    process.stderr.write(`design-ci-judge-router: ${String(error)}\n`);
    process.exitCode = 1;
  });
}
