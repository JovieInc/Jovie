import 'server-only';

import { and, desc, eq, inArray } from 'drizzle-orm';
import type { CanonicalContactListRow } from '@/lib/admin/contacts';
import {
  type ContactCertificationInspection,
  type ContactEvidenceCategory,
  type ContactEvidenceDecision,
  type ContactEvidenceItem,
  deriveContactCertification,
  evidenceDigest,
  evidenceFreshness,
} from '@/lib/contacts/certification';
import { contactLifecycleStageRank } from '@/lib/contacts/lifecycle';
import { db } from '@/lib/db';
import { contactEvidenceReviews, contacts } from '@/lib/db/schema/contacts';
import {
  discogRecordings,
  discogReleases,
  providerLinks,
} from '@/lib/db/schema/content';
import {
  dspCatalogMismatches,
  dspCatalogScans,
} from '@/lib/db/schema/dsp-catalog-scan';
import { dspArtistMatches } from '@/lib/db/schema/dsp-enrichment';
import {
  profileSearchQueries,
  profileSearchResults,
  profileSearchRuns,
} from '@/lib/db/schema/profile-search';
import {
  profileSurfaceQualificationEvents,
  profileSurfaces,
} from '@/lib/db/schema/profile-surfaces';
import { creatorProfiles } from '@/lib/db/schema/profiles';
import { qualificationForIdentityDecision } from '@/lib/profile-surfaces/qualification';

const REQUIRED_COVERAGE = [
  'identity',
  'dsp',
  'catalog',
  'search',
  'reachability',
] as const;

// biome-ignore format: compact type declaration avoids inflating the hard PR line budget.
type Draft = Omit<ContactEvidenceItem, 'decision' | 'freshness' | 'observedAt' | 'revision' | 'url'> & {
  observedAt: Date | null;
  url?: string | null;
};

const confidence = (value: string | null): number | null => {
  const parsed = value === null ? Number.NaN : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

function item(draft: Draft, now: Date): ContactEvidenceItem {
  const { label, observedAt, ...rest } = draft;
  const candidate = { ...rest, url: draft.url ?? null };
  return {
    ...candidate,
    label,
    observedAt: observedAt?.toISOString() ?? null,
    revision: evidenceDigest(candidate),
    freshness: evidenceFreshness(observedAt, now),
    decision: null,
  };
}

function canonicalDrafts(contact: CanonicalContactListRow): Draft[] {
  const source = contact.identityCorrected
    ? 'founder correction'
    : contact.sources.filter(value => value !== 'contact').join(', ') ||
      'canonical CRM';
  const observedAt = contact.activityAt;
  const corrected = contact.identityCorrected;
  // biome-ignore format: compact tuple registry keeps the three canonical identity candidates together.
  const values = [['display-name', 'Display name', contact.displayName], ['email', 'Email', contact.email], ['handle', 'Primary handle', contact.handle ? `@${contact.handle}` : null]] as const;
  // biome-ignore format: compact rows keep the canonical evidence mapping auditable within the hard PR line budget.
  return values.flatMap(([key, label, value]) =>
    value
      ? [{ key: `canonical:${key}`, category: 'identity', label, value, source, observedAt, confidence: corrected ? 1 : 0.9, rationale: 'Joined across the canonical CRM identity sources.' }]
      : []
  );
}

function applyReviews(
  items: readonly ContactEvidenceItem[],
  reviews: readonly (typeof contactEvidenceReviews.$inferSelect)[]
) {
  const latest = new Map<string, (typeof reviews)[number]>();
  for (const review of reviews) {
    const key = `${review.evidenceKey}:${review.evidenceRevision}`;
    if (!latest.has(key)) latest.set(key, review);
  }
  return items.map(current => {
    const review = latest.get(`${current.key}:${current.revision}`);
    return review
      ? {
          ...current,
          decision: review.decision as ContactEvidenceDecision,
          freshness: 'fresh' as const,
        }
      : current;
  });
}

export async function getContactCertificationInspection(
  contact: CanonicalContactListRow,
  now = new Date()
): Promise<ContactCertificationInspection> {
  const reviews = await db
    .select()
    .from(contactEvidenceReviews)
    .where(eq(contactEvidenceReviews.dedupeKey, contact.dedupeKey))
    .orderBy(desc(contactEvidenceReviews.createdAt));
  const drafts = canonicalDrafts(contact);
  const checked = new Set<string>(['identity']);
  const profileId = contact.creatorProfileId;

  if (profileId) {
    // biome-ignore format: one row per independent evidence read makes the parallel fan-out auditable.
    const [profiles, surfaces, dsps, releases, recordings, scans, mismatches, runs] = await Promise.all([
      db.select().from(creatorProfiles).where(eq(creatorProfiles.id, profileId)).limit(1),
      db.select().from(profileSurfaces).where(eq(profileSurfaces.creatorProfileId, profileId)),
      db.select().from(dspArtistMatches).where(eq(dspArtistMatches.creatorProfileId, profileId)),
      db.select().from(discogReleases).where(eq(discogReleases.creatorProfileId, profileId)).limit(500),
      db.select().from(discogRecordings).where(eq(discogRecordings.creatorProfileId, profileId)).limit(1000),
      db.select().from(dspCatalogScans).where(eq(dspCatalogScans.creatorProfileId, profileId)),
      db.select().from(dspCatalogMismatches).where(eq(dspCatalogMismatches.creatorProfileId, profileId)),
      db
        .select({
          id: profileSearchRuns.id,
          provider: profileSearchRuns.provider,
          observedAt: profileSearchRuns.completedAt,
        })
        .from(profileSearchRuns)
        .innerJoin(
          profileSearchQueries,
          eq(profileSearchQueries.id, profileSearchRuns.queryId)
        )
        .where(eq(profileSearchQueries.creatorProfileId, profileId))
        .orderBy(desc(profileSearchRuns.createdAt))
        .limit(1),
    ]);
    const releaseIds = releases.map(row => row.id);
    const run = runs[0];
    // biome-ignore format: both dependent evidence reads are intentionally parallel.
    const [destinations, searchResults] = await Promise.all([releaseIds.length ? db.select().from(providerLinks).where(inArray(providerLinks.releaseId, releaseIds)) : Promise.resolve([]), run ? db.select().from(profileSearchResults).where(eq(profileSearchResults.runId, run.id)).orderBy(profileSearchResults.position) : Promise.resolve([])]);
    for (const row of dsps) {
      checked.add('dsp');
      drafts.push({
        key: `dsp:${row.id}`,
        category: 'dsp',
        label: row.providerId.replaceAll('_', ' '),
        value: row.externalArtistName ?? row.externalArtistId ?? 'Artist match',
        url: row.externalArtistUrl,
        source: row.matchSource ?? 'DSP enrichment',
        observedAt: row.updatedAt,
        confidence: confidence(row.confidenceScore),
        rationale: `${row.matchingIsrcCount} ISRC and ${row.matchingUpcCount} UPC matches across ${row.totalTracksChecked} checked tracks.`,
      });
    }
    for (const row of surfaces) {
      if (row.retiredAt || row.kind === 'jovie') continue;
      const category: ContactEvidenceCategory =
        row.kind === 'website'
          ? 'websites'
          : row.kind === 'social'
            ? 'social'
            : 'dsp';
      checked.add(category);
      if (category === 'social' || category === 'websites')
        checked.add('reachability');
      if (category === 'dsp') checked.add('dsp');
      drafts.push({
        key: `surface:${row.id}`,
        category,
        label: row.platform.replaceAll('_', ' '),
        value: row.displayName ?? row.handle ?? row.url,
        url: row.url,
        source: 'profile surface resolver',
        observedAt: row.lastObservedAt ?? row.lastDiscoveredAt ?? row.updatedAt,
        confidence: confidence(row.identityConfidence),
        rationale: `${row.qualificationStatus} surface joined to this identity.`,
      });
    }
    if (
      releases.length ||
      recordings.length ||
      scans.some(row => row.status === 'completed')
    )
      checked.add('catalog');
    for (const row of releases) {
      drafts.push({
        key: `release:${row.id}`,
        category: 'catalog',
        label: 'Release',
        value: `${row.title}${row.upc ? ` · UPC ${row.upc}` : ''}`,
        source: row.sourceType,
        observedAt: row.updatedAt,
        confidence: row.upc ? 0.97 : 0.9,
        rationale: `${row.totalTracks} canonical track${row.totalTracks === 1 ? '' : 's'}.`,
      });
    }
    for (const row of recordings) {
      drafts.push({
        key: `recording:${row.id}`,
        category: 'catalog',
        label: row.isrc ? 'Recording / ISRC' : 'Recording',
        value: `${row.title}${row.isrc ? ` · ${row.isrc}` : ''}`,
        source: row.sourceType,
        observedAt: row.updatedAt,
        confidence: row.isrc ? 0.98 : 0.85,
        rationale: row.isrc
          ? 'Stable ISRC binds this recording.'
          : 'No ISRC; identity needs review.',
      });
    }
    if (destinations.length) checked.add('destinations');
    for (const row of destinations) {
      drafts.push({
        key: `destination:${row.id}`,
        category: 'destinations',
        label: 'Provider destination',
        value: row.url,
        url: row.url,
        source: row.sourceType,
        observedAt: row.updatedAt,
        confidence: 0.95,
        rationale: 'Destination is linked to a canonical release.',
      });
    }
    const profile = profiles[0];
    const publicFacts = profile
      ? [profile.bio, profile.location, profile.genres?.join(', ')]
          .filter(Boolean)
          .join(' · ')
      : '';
    if (profile && publicFacts) {
      drafts.push({
        key: 'fact:public-profile',
        category: 'facts',
        label: 'Public profile facts',
        value: publicFacts,
        source: profile.ingestionSourcePlatform ?? 'creator profile',
        observedAt: profile.updatedAt,
        confidence: 0.85,
        rationale: 'Selected public fact from the canonical artist record.',
      });
    }
    if (run) checked.add('search');
    for (const row of searchResults) {
      drafts.push({
        key: `search:${row.id}`,
        category: 'search',
        label: `Search result #${row.position}`,
        value: row.title,
        url: row.url,
        source: run?.provider ?? 'public search',
        observedAt: run?.observedAt ?? row.createdAt,
        confidence: row.classification === 'unknown' ? 0.5 : 0.75,
        rationale: row.snippet ?? `Classified as ${row.classification}.`,
      });
    }
    for (const row of mismatches.filter(
      value => value.status !== 'dismissed'
    )) {
      drafts.push({
        key: `catalog-conflict:${row.id}`,
        category: 'conflicts',
        label: row.mismatchType.replaceAll('_', ' '),
        value: `${row.externalTrackName ?? row.isrc} · ${row.isrc}`,
        source: 'DSP catalog scan',
        observedAt: row.updatedAt,
        confidence: 0.8,
        rationale: 'Provider catalog disagrees with the canonical ISRC set.',
      });
    }
  }

  for (const sourceClass of REQUIRED_COVERAGE) {
    if (checked.has(sourceClass)) continue;
    drafts.push({
      key: `coverage:${sourceClass}`,
      category: 'coverage',
      label: `${sourceClass} coverage`,
      value: 'Not checked',
      source: 'coverage planner',
      observedAt: null,
      confidence: 0,
      rationale: 'Required outreach evidence has not been observed yet.',
    });
  }
  const certification = reviews.find(
    review => review.evidenceKey === 'profile:certification'
  );
  return deriveContactCertification({
    items: applyReviews(
      drafts.map(draft => item(draft, now)),
      reviews
    ),
    sourceClassesChecked: [...checked],
    requiredSourceClasses: REQUIRED_COVERAGE,
    certifiedRevision: certification?.evidenceRevision,
  });
}

async function ensureContact(contact: CanonicalContactListRow) {
  const links = {
    userId: contact.userId,
    creatorProfileId: contact.creatorProfileId,
    leadId: contact.leadId,
    waitlistEntryId: contact.waitlistEntryId,
  };
  const [row] = await db
    .insert(contacts)
    .values({
      dedupeKey: contact.dedupeKey,
      displayName: contact.displayName,
      emailNormalized: contact.email,
      primaryHandle: contact.handle,
      avatarUrl: contact.avatarUrl,
      stage: contact.stage,
      ...links,
      firstSeenAt: contact.firstSeenAt,
      lastActivityAt: contact.activityAt,
    })
    .onConflictDoUpdate({
      target: contacts.dedupeKey,
      set: {
        ...links,
        updatedAt: new Date(),
      },
    })
    .returning({ id: contacts.id, provenance: contacts.provenance });
  return row;
}

async function projectDecision(
  contact: CanonicalContactListRow,
  current: ContactEvidenceItem,
  decision: ContactEvidenceDecision,
  actorUserId: string | null
) {
  if (current.key.startsWith('surface:')) {
    const id = current.key.slice('surface:'.length);
    const [surface] = await db
      .select()
      .from(profileSurfaces)
      .where(
        and(
          eq(profileSurfaces.id, id),
          eq(profileSurfaces.creatorProfileId, contact.creatorProfileId ?? '')
        )
      )
      .limit(1);
    if (!surface) return;
    const next = qualificationForIdentityDecision(decision);
    await db
      .update(profileSurfaces)
      .set({
        qualificationStatus: next.status,
        identityConfidence: next.confidence,
        isOfficial: next.isOfficial,
        lastVerifiedAt: decision === 'unsure' ? null : new Date(),
      })
      .where(eq(profileSurfaces.id, id));
    await db.insert(profileSurfaceQualificationEvents).values({
      surfaceId: id,
      previousStatus: surface.qualificationStatus,
      nextStatus: next.status,
      actorType: 'founder',
      actorId: actorUserId,
      reason: `crm_${decision}`,
      evidence: {
        schema: 'contact-evidence-review/v1',
        evidenceRevision: current.revision,
      },
    });
  } else if (current.key.startsWith('dsp:')) {
    await db
      .update(dspArtistMatches)
      .set({
        status:
          decision === 'yes'
            ? 'confirmed'
            : decision === 'no'
              ? 'rejected'
              : 'suggested',
        confirmedAt: decision === 'yes' ? new Date() : null,
        confirmedBy: decision === 'yes' ? actorUserId : null,
        rejectedAt: decision === 'no' ? new Date() : null,
        rejectionReason: decision === 'no' ? 'crm_founder_rejected' : null,
      })
      .where(
        and(
          eq(dspArtistMatches.id, current.key.slice(4)),
          eq(dspArtistMatches.creatorProfileId, contact.creatorProfileId ?? '')
        )
      );
  }
}

export async function reviewContactEvidence(input: {
  contact: CanonicalContactListRow;
  evidenceKey: string;
  evidenceRevision: string;
  decision: ContactEvidenceDecision;
  correction?: string | null;
  actorUserId: string | null;
}) {
  const inspection = await getContactCertificationInspection(input.contact);
  const current = inspection.items.find(
    value =>
      value.key === input.evidenceKey &&
      value.revision === input.evidenceRevision
  );
  if (!current) return { ok: false as const, reason: 'stale' as const };
  const correction = input.correction?.trim() || null;
  if (correction && !/^canonical:(display-name|handle)$/.test(current.key))
    return { ok: false as const, reason: 'not_correctable' as const };
  const contact = await ensureContact(input.contact);
  await db.insert(contactEvidenceReviews).values({
    contactId: contact.id,
    dedupeKey: input.contact.dedupeKey,
    evidenceKey: current.key,
    evidenceRevision: current.revision,
    decision: correction ? 'no' : input.decision,
    candidateSnapshot: { ...current },
    correction: correction ? { value: correction } : null,
    actorUserId: input.actorUserId,
  });
  if (correction) {
    const field =
      current.key === 'canonical:display-name'
        ? { displayName: correction }
        : { primaryHandle: correction.replace(/^@+/, '') };
    await db
      .update(contacts)
      .set({
        ...field,
        provenance: {
          ...(contact.provenance ?? {}),
          identityCorrection: true,
        },
        updatedAt: new Date(),
      })
      .where(eq(contacts.id, contact.id));
  } else {
    await projectDecision(
      input.contact,
      current,
      input.decision,
      input.actorUserId
    );
  }
  return { ok: true as const };
}

export async function certifyContactEvidence(input: {
  contact: CanonicalContactListRow;
  evidenceRevision: string;
  actorUserId: string | null;
}) {
  const inspection = await getContactCertificationInspection(input.contact);
  if (
    inspection.evidenceRevision !== input.evidenceRevision ||
    !inspection.canCertify
  ) {
    return { ok: false as const, reason: 'not_certifiable' as const };
  }
  const contact = await ensureContact(input.contact);
  const now = new Date();
  await db.insert(contactEvidenceReviews).values({
    contactId: contact.id,
    dedupeKey: input.contact.dedupeKey,
    evidenceKey: 'profile:certification',
    evidenceRevision: inspection.evidenceRevision,
    decision: 'yes',
    candidateSnapshot: { ...inspection.coverage },
    actorUserId: input.actorUserId,
    createdAt: now,
  });
  await db
    .update(contacts)
    .set({
      stage:
        contactLifecycleStageRank(input.contact.stage) <
        contactLifecycleStageRank('certified')
          ? 'certified'
          : input.contact.stage,
      certifiedAt: now,
      certifiedByUserId: input.actorUserId,
      stageSource: 'founder',
      updatedAt: now,
    })
    .where(eq(contacts.id, contact.id));
  return { ok: true as const };
}
