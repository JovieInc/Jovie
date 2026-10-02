import { createHash } from 'node:crypto';

import type { LaunchRecord } from './index';

export const PRESS_KIT_GENERATION_VERSION = 'press-kit/v1' as const;
export const PRESS_KIT_MAX_ATTEMPTS = 3;

/**
 * Press kit preparation for launches (JOV-7472).
 *
 * Every launch gets a preparation attempt. The kit belongs to the launch —
 * never keyed by work alone, since one work may have several launches.
 * Drafts are generated only from authorized, attributable source facts;
 * missing facts produce a partial draft plus precise gaps, never invented
 * content. Generated drafts are private by default: publication, recipient
 * access, embargo and sends stay on the existing share/permission surfaces.
 */

export type PressKitState =
  | 'preparing'
  | 'ready'
  | 'needs_input'
  | 'failed'
  | 'out_of_date';

export type PressKitAssetKind = 'artwork' | 'press_photo' | 'preview' | 'logo';

export type PressKitGapKind =
  | 'work_title'
  | 'availability'
  | 'identity_name'
  | 'boilerplate'
  | 'press_contact'
  | 'destination'
  | 'artwork';

export interface PressKitGap {
  readonly kind: PressKitGapKind;
  /** Precise description of the missing fact needed for the output. */
  readonly detail: string;
}

export interface PressKitAssetInput {
  readonly assetId: string;
  readonly kind: PressKitAssetKind;
  readonly uri: string;
  readonly title?: string;
  readonly credits?: string;
  readonly usageNotes?: string;
  /**
   * Only assets explicitly licensed/authorized for press may be selected.
   * A private file entering generation context is never published.
   */
  readonly licensedForPress: boolean;
  /** Set when rights were withdrawn after a previous selection. */
  readonly rightsWithdrawn?: boolean;
}

export interface PressKitDestination {
  readonly label: string;
  readonly url: string;
}

export interface PressKitWorkFacts {
  readonly workId: string;
  readonly title?: string;
  readonly releaseDate?: string;
  /** True when the work is publicly available now; false when scheduled. */
  readonly availableNow?: boolean;
  readonly destinations?: readonly PressKitDestination[];
}

export interface PressKitContact {
  readonly name: string;
  readonly email?: string;
}

export interface PressKitIdentityFacts {
  readonly identityId: string;
  readonly name?: string;
  /** Reuses the canonical Identity-level biography; never a second source. */
  readonly bio?: string;
  readonly boilerplate?: string;
  readonly pressContact?: PressKitContact;
}

export interface PressKitQuote {
  readonly text: string;
  readonly attribution: string;
  /**
   * Unapproved draft text is never rendered as an attributed quotation;
   * only approved quotes may appear in publishable output.
   */
  readonly approved: boolean;
}

export interface PressKitFacts {
  readonly tenantId: string;
  readonly launch: LaunchRecord;
  readonly work?: PressKitWorkFacts;
  readonly identity?: PressKitIdentityFacts;
  readonly assets?: readonly PressKitAssetInput[];
  readonly quotes?: readonly PressKitQuote[];
}

export type PressKitSectionKey =
  | 'headline'
  | 'lede'
  | 'body'
  | 'availability'
  | 'boilerplate'
  | 'contact';

export interface PressKitSection {
  readonly key: PressKitSectionKey;
  /** Empty when the fact was missing; the gap list explains why. */
  readonly body: string;
  /** Attributable source refs this text was generated from. */
  readonly sourceRefs: readonly string[];
  /** True once a user edited the section; refreshes preserve it. */
  readonly userEdited: boolean;
}

export interface PressReleaseDraft {
  readonly sections: readonly PressKitSection[];
  /** Quotes approved for inclusion; draft text stays in `pendingQuotes`. */
  readonly quotes: readonly PressKitQuote[];
  /** Proposed quote text awaiting approval — never attributed as real. */
  readonly pendingQuotes: readonly PressKitQuote[];
}

export interface PressKitRevision {
  readonly revision: number;
  readonly createdAt: string;
  /** Actor that produced it: generation version or editor id. */
  readonly actor: string;
  readonly note: string;
}

export interface PressKitConflict {
  readonly section: PressKitSectionKey;
  /** Source fingerprint changed but the section has user edits. */
  readonly detail: string;
}

export interface LaunchPressKit {
  readonly kitId: string;
  readonly launchId: string;
  readonly tenantId: string;
  readonly workId: string | null;
  readonly identityId: string | null;
  readonly generationVersion: typeof PRESS_KIT_GENERATION_VERSION;
  /** Fingerprint of the material source facts the draft was built from. */
  readonly sourceFingerprint: string;
  readonly state: PressKitState;
  readonly stateDetail: string | null;
  readonly gaps: readonly PressKitGap[];
  readonly draft: PressReleaseDraft;
  readonly assets: readonly PressKitAssetInput[];
  readonly conflicts: readonly PressKitConflict[];
  readonly revisions: readonly PressKitRevision[];
  /** Immutable published snapshot; never silently replaced. */
  readonly publishedRevision: number | null;
  /** Private by default; a share ref is attached only via share infra. */
  readonly shareRef: string | null;
  readonly attemptCount: number;
  readonly lastError: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

function fingerprintSource(facts: PressKitFacts): string {
  const material = {
    source: facts.launch.source,
    claims: facts.launch.claims,
    availability: facts.launch.availability,
    destination: facts.launch.destination,
    work: facts.work ?? null,
    identity: facts.identity ?? null,
    assets: (facts.assets ?? [])
      .filter(a => a.licensedForPress && !a.rightsWithdrawn)
      .map(a => ({ id: a.assetId, kind: a.kind, uri: a.uri })),
    quotes: (facts.quotes ?? []).filter(q => q.approved),
  };
  return createHash('sha256')
    .update(JSON.stringify(material))
    .digest('hex')
    .slice(0, 24);
}

export function pressKitIdFor(
  tenantId: string,
  launchId: string,
  sourceRevision: string,
  generationVersion: string = PRESS_KIT_GENERATION_VERSION
): string {
  const hash = createHash('sha256')
    .update(`${tenantId}|${launchId}|${sourceRevision}|${generationVersion}`)
    .digest('hex')
    .slice(0, 24);
  return `presskit-${hash}`;
}

const SECTION_ORDER: readonly PressKitSectionKey[] = [
  'headline',
  'lede',
  'body',
  'availability',
  'boilerplate',
  'contact',
];

function section(
  key: PressKitSectionKey,
  body: string,
  sourceRefs: readonly string[]
): PressKitSection {
  return { key, body, sourceRefs, userEdited: false };
}

function claimStatements(facts: PressKitFacts): string {
  return facts.launch.claims.map(c => c.statement).join(' ');
}

function buildDraft(
  facts: PressKitFacts,
  gaps: PressKitGap[]
): PressReleaseDraft {
  const { launch, work, identity } = facts;
  const name = identity?.name?.trim();
  const title = work?.title?.trim();
  const launchRef = `${launch.source.kind}:${launch.source.entityId}@${launch.source.revision}`;

  const push = (kind: PressKitGapKind, detail: string) =>
    gaps.push({ kind, detail });

  const headline = title
    ? `${name ? `${name} launches` : 'Launching'} ${title}`
    : '';
  if (!title) push('work_title', 'launch work has no title');
  if (!name) push('identity_name', 'authorized identity has no display name');

  const ledeParts: string[] = [];
  if (title && name) {
    ledeParts.push(`${name} announces ${title}.`);
  }
  const claims = claimStatements(facts);
  if (claims) ledeParts.push(claims);

  const availabilityText = work?.availableNow
    ? `${title ?? 'The work'} is available now.`
    : work?.releaseDate
      ? `${title ?? 'The work'} is scheduled for ${work.releaseDate}.`
      : '';
  if (!availabilityText) {
    push(
      'availability',
      'no verified release date or availability for the work'
    );
  }

  const boilerplate =
    identity?.boilerplate?.trim() ?? identity?.bio?.trim() ?? '';
  if (!boilerplate) {
    push('boilerplate', 'identity has no approved bio or boilerplate');
  }

  const contact = identity?.pressContact;
  const contactText = contact
    ? `Press contact: ${contact.name}${contact.email ? ` (${contact.email})` : ''}`
    : '';
  if (!contact) push('press_contact', 'no authorized press contact on file');

  if (!launch.destination && !work?.destinations?.length) {
    push('destination', 'no canonical destination for the launch');
  }
  const hasArtwork = (facts.assets ?? []).some(
    a => a.kind === 'artwork' && a.licensedForPress && !a.rightsWithdrawn
  );
  if (!hasArtwork) {
    push('artwork', 'no press-licensed cover or product artwork selected');
  }

  const approved = (facts.quotes ?? []).filter(q => q.approved);
  const pending = (facts.quotes ?? []).filter(q => !q.approved);

  const bodies: Record<PressKitSectionKey, PressKitSection> = {
    headline: section('headline', headline, [launchRef]),
    lede: section('lede', ledeParts.join(' '), [launchRef]),
    body: section(
      'body',
      launch.job
        ? `${launch.job.charAt(0).toUpperCase()}${launch.job.slice(1)}.`
        : '',
      [launchRef]
    ),
    availability: section('availability', availabilityText, [launchRef]),
    boilerplate: section('boilerplate', boilerplate, [
      identity ? `identity:${identity.identityId}` : launchRef,
    ]),
    contact: section('contact', contactText, [
      contact ? `identity:${identity?.identityId}` : launchRef,
    ]),
  };

  return {
    sections: SECTION_ORDER.map(k => bodies[k]),
    quotes: approved,
    pendingQuotes: pending,
  };
}

function selectAssets(
  input: readonly PressKitAssetInput[] | undefined
): PressKitAssetInput[] {
  return (input ?? []).filter(a => a.licensedForPress && !a.rightsWithdrawn);
}

function stateFor(gaps: readonly PressKitGap[]): PressKitState {
  const blocking: readonly PressKitGapKind[] = [
    'work_title',
    'availability',
    'identity_name',
  ];
  return gaps.some(g => blocking.includes(g.kind)) ? 'needs_input' : 'ready';
}

export interface PressKitViewAction {
  readonly id: 'review_press_kit' | 'view_press_release' | 'open_launch';
  readonly enabled: boolean;
}

/** Read-model projection consumed by the work inspector (JOV-7471). */
export interface PressKitReadinessView {
  readonly launchId: string;
  readonly kitId: string;
  readonly state: PressKitState;
  readonly currentRevision: number;
  readonly publishedRevision: number | null;
  readonly gaps: readonly PressKitGap[];
  readonly actions: readonly PressKitViewAction[];
}

export function pressKitViewForLaunch(
  kit: LaunchPressKit
): PressKitReadinessView {
  const ready = kit.state === 'ready' || kit.state === 'needs_input';
  return {
    launchId: kit.launchId,
    kitId: kit.kitId,
    state: kit.state,
    currentRevision: kit.revisions[kit.revisions.length - 1]?.revision ?? 0,
    publishedRevision: kit.publishedRevision,
    gaps: kit.gaps,
    actions: [
      { id: 'review_press_kit', enabled: ready },
      { id: 'view_press_release', enabled: ready },
      { id: 'open_launch', enabled: true },
    ],
  };
}

/**
 * In-memory press-kit registry. Idempotent on
 * (tenant, launch, source revision, generation version): retries and
 * replays of the same preparation return the existing kit and never
 * duplicate content or URLs.
 */
export class InMemoryPressKitRegistry {
  private readonly kits = new Map<string, LaunchPressKit>();
  private readonly byLaunch = new Map<string, string>();

  /**
   * Prepare a kit for a launch. Replays with unchanged material facts
   * return the existing kit; changed facts regenerate the draft in place
   * while preserving user-edited sections and published revisions.
   */
  async prepare(facts: PressKitFacts): Promise<LaunchPressKit> {
    const { launch, tenantId } = facts;
    const kitId = pressKitIdFor(
      tenantId,
      launch.launchId,
      launch.source.revision
    );
    const fingerprint = fingerprintSource(facts);
    const existing = this.kits.get(kitId);

    if (existing) {
      if (existing.sourceFingerprint === fingerprint) {
        return this.recover(existing);
      }
      return this.refresh(existing, facts, fingerprint);
    }

    const gaps: PressKitGap[] = [];
    const draft = buildDraft(facts, gaps);
    const now = new Date().toISOString();
    const kit: LaunchPressKit = {
      kitId,
      launchId: launch.launchId,
      tenantId,
      workId: facts.work?.workId ?? null,
      identityId: facts.identity?.identityId ?? null,
      generationVersion: PRESS_KIT_GENERATION_VERSION,
      sourceFingerprint: fingerprint,
      state: stateFor(gaps),
      stateDetail: null,
      gaps,
      draft,
      assets: selectAssets(facts.assets),
      conflicts: [],
      revisions: [
        {
          revision: 1,
          createdAt: now,
          actor: PRESS_KIT_GENERATION_VERSION,
          note: 'automatic preparation',
        },
      ],
      publishedRevision: null,
      shareRef: null,
      attemptCount: 1,
      lastError: null,
      createdAt: now,
      updatedAt: now,
    };
    this.kits.set(kitId, kit);
    this.byLaunch.set(launch.launchId, kitId);
    return kit;
  }

  /** A previously failed attempt resumes as preparing, bounded by attempts. */
  private recover(kit: LaunchPressKit): LaunchPressKit {
    if (kit.state !== 'failed') return kit;
    if (kit.attemptCount >= PRESS_KIT_MAX_ATTEMPTS) {
      return this.patch(kit, {
        stateDetail: 'retry budget exhausted',
      });
    }
    const gaps: PressKitGap[] = [...kit.gaps];
    return this.patch(kit, {
      state: stateFor(gaps),
      stateDetail: null,
      lastError: null,
      attemptCount: kit.attemptCount + 1,
    });
  }

  /**
   * Material source changes regenerate unedited sections. User edits are
   * preserved and surfaced as conflicts; an already published revision is
   * marked out of date rather than silently replaced.
   */
  private refresh(
    kit: LaunchPressKit,
    facts: PressKitFacts,
    fingerprint: string
  ): LaunchPressKit {
    const gaps: PressKitGap[] = [];
    const regenerated = buildDraft(facts, gaps);
    const conflicts: PressKitConflict[] = [];
    const sections = regenerated.sections.map(next => {
      const prior = kit.draft.sections.find(s => s.key === next.key);
      if (prior?.userEdited) {
        if (prior.body !== next.body) {
          conflicts.push({
            section: next.key,
            detail: 'source changed; user edit preserved pending review',
          });
        }
        return prior;
      }
      return next;
    });
    const draft: PressReleaseDraft = {
      ...regenerated,
      sections,
      quotes: regenerated.quotes,
      pendingQuotes: regenerated.pendingQuotes,
    };
    const revision: PressKitRevision = {
      revision: (kit.revisions[kit.revisions.length - 1]?.revision ?? 0) + 1,
      createdAt: new Date().toISOString(),
      actor: PRESS_KIT_GENERATION_VERSION,
      note: 'material source change',
    };
    return this.patch(kit, {
      sourceFingerprint: fingerprint,
      state: kit.publishedRevision != null ? 'out_of_date' : stateFor(gaps),
      stateDetail:
        kit.publishedRevision != null
          ? `published revision ${kit.publishedRevision} is out of date`
          : null,
      gaps,
      draft,
      assets: selectAssets(facts.assets),
      conflicts,
      revisions: [...kit.revisions, revision],
      lastError: null,
    });
  }

  /**
   * Record a generation/delivery failure. Preparation is honest: a failed
   * attempt is never reported ready.
   */
  async fail(launchId: string, error: string): Promise<LaunchPressKit> {
    const kit = this.requireByLaunch(launchId);
    return this.patch(kit, {
      state: 'failed',
      stateDetail: error,
      lastError: error,
    });
  }

  /**
   * Apply a user edit to a draft section. Edits create a new revision and
   * mark the section so later refreshes preserve it instead of overwriting.
   */
  async editSection(
    launchId: string,
    key: PressKitSectionKey,
    body: string,
    editorId: string
  ): Promise<LaunchPressKit> {
    const kit = this.requireByLaunch(launchId);
    const sections = kit.draft.sections.map(s =>
      s.key === key ? { ...s, body, userEdited: true } : s
    );
    const revision: PressKitRevision = {
      revision: (kit.revisions[kit.revisions.length - 1]?.revision ?? 0) + 1,
      createdAt: new Date().toISOString(),
      actor: editorId,
      note: `edited ${key}`,
    };
    return this.patch(kit, {
      draft: { ...kit.draft, sections },
      revisions: [...kit.revisions, revision],
    });
  }

  /**
   * Publish the current draft as an immutable revision snapshot and attach
   * an existing share reference. Missing-fact markers are refused: only a
   * draft with no blocking gaps may be published.
   */
  async publish(launchId: string, shareRef: string): Promise<LaunchPressKit> {
    const kit = this.requireByLaunch(launchId);
    if (kit.state === 'needs_input' || kit.state === 'failed') {
      throw new Error(
        `cannot publish press kit in state ${kit.state}: ${kit.stateDetail ?? 'missing facts'}`
      );
    }
    if (!shareRef) throw new Error('publish requires an existing share ref');
    const current = kit.revisions[kit.revisions.length - 1]?.revision ?? 0;
    return this.patch(kit, {
      publishedRevision: current,
      shareRef,
      state: 'ready',
      stateDetail: null,
    });
  }

  /** Revoke the share surface without touching the private draft. */
  async revokeShare(launchId: string): Promise<LaunchPressKit> {
    const kit = this.requireByLaunch(launchId);
    return this.patch(kit, { shareRef: null });
  }

  async getForLaunch(launchId: string): Promise<LaunchPressKit | null> {
    const kitId = this.byLaunch.get(launchId);
    return kitId ? (this.kits.get(kitId) ?? null) : null;
  }

  private requireByLaunch(launchId: string): LaunchPressKit {
    const kitId = this.byLaunch.get(launchId);
    const kit = kitId ? this.kits.get(kitId) : undefined;
    if (!kit) throw new Error(`no press kit for launch ${launchId}`);
    return kit;
  }

  private patch(
    kit: LaunchPressKit,
    update: Partial<LaunchPressKit>
  ): LaunchPressKit {
    const next: LaunchPressKit = {
      ...kit,
      ...update,
      updatedAt: new Date().toISOString(),
    };
    this.kits.set(kit.kitId, next);
    return next;
  }
}
