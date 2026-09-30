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
import {
  contactEvidenceReviews,
  contactProfileCertifications,
  contacts,
} from '@/lib/db/schema/contacts';
import {
  discogRecordings,
  discogReleases,
  providerLinks,
  providers,
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
  profileSurfaceIssues,
} from '@/lib/db/schema/profile-search';
import {
  profileSurfaceQualificationEvents,
  profileSurfaceSources,
  profileSurfaces,
} from '@/lib/db/schema/profile-surfaces';
import { creatorProfiles } from '@/lib/db/schema/profiles';

const REQUIRED_COVERAGE = [
  'identity',
  'dsp',
  'catalog',
  'search',
  'reachability',
] as const;

interface Draft {
  key: string;
  category: ContactEvidenceCategory;
  label: string;
  value: string;
  source: string;
  observedAt: Date | null;
  confidence: number | null;
  rationale: string;
  url?: string | null;
  correctable?: boolean;
}

const confidence = (value: string | null): number | null => {
  const parsed = value === null ? Number.NaN : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

function item(draft: Draft, now: Date): ContactEvidenceItem {
  const candidate = {
    key: draft.key,
    category: draft.category,
    value: draft.value,
    url: draft.url ?? null,
    source: draft.source,
    confidence: draft.confidence,
    rationale: draft.rationale,
  };
  return {
    ...candidate,
    label: draft.label,
    observedAt: draft.observedAt?.toISOString() ?? null,
    revision: evidenceDigest(candidate),
    freshness: evidenceFreshness(draft.observedAt, now),
    material: true,
    correctable: draft.correctable ?? false,
    decision: null,
    correction: null,
  };
}

function canonicalDrafts(contact: CanonicalContactListRow): Draft[] {
  const source = contact.identityCorrected
    ? 'founder correction'
    : contact.sources.filter(value => value !== 'contact').join(', ') ||
      'canonical CRM';
  const observedAt = contact.activityAt;
  const corrected = contact.identityCorrected;
  return [
    contact.displayName && {
      key: 'canonical:display-name',
      label: 'Display name',
      value: contact.displayName,
      correctable: true,
    },
    contact.email && {
      key: 'canonical:email',
      label: 'Email',
      value: contact.email,
    },
    contact.handle && {
      key: 'canonical:handle',
      label: 'Primary handle',
      value: `@${contact.handle}`,
      correctable: true,
    },
  ]
    .filter(Boolean)
    .map(value => ({
      ...(value as {
        key: string;
        label: string;
        value: string;
        correctable?: boolean;
      }),
      category: 'identity' as const,
      source,
      observedAt,
      confidence: corrected ? 1 : 0.9,
      rationale: 'Joined across the canonical CRM identity sources.',
    }));
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
          correction: review.correction?.value ?? null,
          freshness: 'fresh' as const,
        }
      : current;
  });
}

export async function getContactCertificationInspection(
  contact: CanonicalContactListRow,
  now = new Date()
): Promise<ContactCertificationInspection> {
  const [stored] = await db
    .select({ id: contacts.id })
    .from(contacts)
    .where(eq(contacts.dedupeKey, contact.dedupeKey))
    .limit(1);
  const [reviews, certifications] = await Promise.all([
    db
      .select()
      .from(contactEvidenceReviews)
      .where(eq(contactEvidenceReviews.dedupeKey, contact.dedupeKey))
      .orderBy(desc(contactEvidenceReviews.createdAt)),
    stored
      ? db
          .select()
          .from(contactProfileCertifications)
          .where(eq(contactProfileCertifications.contactId, stored.id))
          .orderBy(desc(contactProfileCertifications.certifiedAt))
          .limit(1)
      : Promise.resolve([]),
  ]);
  const drafts = canonicalDrafts(contact);
  const checked = new Set<string>(['identity']);
  const profileId = contact.creatorProfileId;

  if (profileId) {
    const [
      profiles,
      surfaces,
      dsps,
      releases,
      recordings,
      scans,
      mismatches,
      issues,
      runs,
    ] = await Promise.all([
      db
        .select()
        .from(creatorProfiles)
        .where(eq(creatorProfiles.id, profileId))
        .limit(1),
      db
        .select()
        .from(profileSurfaces)
        .where(eq(profileSurfaces.creatorProfileId, profileId)),
      db
        .select()
        .from(dspArtistMatches)
        .where(eq(dspArtistMatches.creatorProfileId, profileId)),
      db
        .select()
        .from(discogReleases)
        .where(eq(discogReleases.creatorProfileId, profileId))
        .limit(500),
      db
        .select()
        .from(discogRecordings)
        .where(eq(discogRecordings.creatorProfileId, profileId))
        .limit(1000),
      db
        .select()
        .from(dspCatalogScans)
        .where(eq(dspCatalogScans.creatorProfileId, profileId)),
      db
        .select()
        .from(dspCatalogMismatches)
        .where(eq(dspCatalogMismatches.creatorProfileId, profileId)),
      db
        .select()
        .from(profileSurfaceIssues)
        .where(eq(profileSurfaceIssues.creatorProfileId, profileId)),
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
    const surfaceIds = surfaces.map(row => row.id);
    const releaseIds = releases.map(row => row.id);
    const run = runs[0];
    const [surfaceSources, destinations, searchResults] = await Promise.all([
      surfaceIds.length
        ? db
            .select()
            .from(profileSurfaceSources)
            .where(
              and(
                inArray(profileSurfaceSources.surfaceId, surfaceIds),
                eq(profileSurfaceSources.isLive, true)
              )
            )
        : Promise.resolve([]),
      releaseIds.length
        ? db
            .select({
              id: providerLinks.id,
              name: providers.displayName,
              url: providerLinks.url,
              source: providerLinks.sourceType,
              observedAt: providerLinks.updatedAt,
            })
            .from(providerLinks)
            .innerJoin(providers, eq(providers.id, providerLinks.providerId))
            .where(inArray(providerLinks.releaseId, releaseIds))
        : Promise.resolve([]),
      run
        ? db
            .select()
            .from(profileSearchResults)
            .where(eq(profileSearchResults.runId, run.id))
            .orderBy(profileSearchResults.position)
        : Promise.resolve([]),
    ]);
    const sourceTypes = new Map<string, string[]>();
    for (const source of surfaceSources) {
      const list = sourceTypes.get(source.surfaceId) ?? [];
      list.push(source.sourceType);
      sourceTypes.set(source.surfaceId, list);
    }
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
      const sources = sourceTypes.get(row.id) ?? [];
      drafts.push({
        key: `surface:${row.id}`,
        category,
        label: row.platform.replaceAll('_', ' '),
        value: row.displayName ?? row.handle ?? row.url,
        url: row.url,
        source: sources.join(', ') || 'profile reconciliation',
        observedAt: row.lastObservedAt ?? row.lastDiscoveredAt ?? row.updatedAt,
        confidence: confidence(row.identityConfidence),
        rationale: `${sources.length || 1} live source claim${sources.length === 1 ? '' : 's'} joined this identity.`,
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
        label: row.name,
        value: row.url,
        url: row.url,
        source: row.source,
        observedAt: row.observedAt,
        confidence: 0.95,
        rationale: 'Destination is linked to a canonical release.',
      });
    }
    const profile = profiles[0];
    for (const fact of [
      ['bio', 'Public bio', profile?.bio],
      ['location', 'Location', profile?.location],
      ['genres', 'Genres', profile?.genres?.join(', ')],
    ] as const) {
      if (!fact[2] || !profile) continue;
      drafts.push({
        key: `fact:${fact[0]}`,
        category: 'facts',
        label: fact[1],
        value: fact[2],
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
    for (const row of issues.filter(value => !value.resolvedAt)) {
      drafts.push({
        key: `surface-conflict:${row.id}`,
        category: 'conflicts',
        label: row.issueType.replaceAll('_', ' '),
        value: row.primaryUrl ?? row.severity,
        url: row.primaryUrl,
        source: 'presence reconciliation',
        observedAt: row.updatedAt,
        confidence: row.severity === 'high' ? 0.9 : 0.7,
        rationale: `Unresolved ${row.severity} public-surface discrepancy.`,
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
  const certification = certifications[0];
  return deriveContactCertification({
    dedupeKey: contact.dedupeKey,
    items: applyReviews(
      drafts.map(draft => item(draft, now)),
      reviews
    ),
    sourceClassesChecked: [...checked],
    requiredSourceClasses: REQUIRED_COVERAGE,
    certifiedRevision: certification?.evidenceRevision,
    certifiedAt: certification?.certifiedAt.toISOString(),
  });
}

async function ensureContact(contact: CanonicalContactListRow) {
  const [row] = await db
    .insert(contacts)
    .values({
      dedupeKey: contact.dedupeKey,
      displayName: contact.displayName,
      emailNormalized: contact.email,
      primaryHandle: contact.handle,
      avatarUrl: contact.avatarUrl,
      stage: contact.stage,
      userId: contact.userId,
      creatorProfileId: contact.creatorProfileId,
      leadId: contact.leadId,
      waitlistEntryId: contact.waitlistEntryId,
      firstSeenAt: contact.firstSeenAt,
      lastActivityAt: contact.activityAt,
    })
    .onConflictDoUpdate({
      target: contacts.dedupeKey,
      set: {
        userId: contact.userId,
        creatorProfileId: contact.creatorProfileId,
        leadId: contact.leadId,
        waitlistEntryId: contact.waitlistEntryId,
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
    const nextStatus =
      decision === 'yes'
        ? 'qualified'
        : decision === 'no'
          ? 'rejected'
          : 'conflicting';
    await db
      .update(profileSurfaces)
      .set({
        qualificationStatus: nextStatus,
        identityConfidence:
          decision === 'yes' ? '1.00' : decision === 'no' ? '0.00' : null,
        isOfficial: decision === 'yes',
        lastVerifiedAt: decision === 'unsure' ? null : new Date(),
      })
      .where(eq(profileSurfaces.id, id));
    await db.insert(profileSurfaceQualificationEvents).values({
      surfaceId: id,
      previousStatus: surface.qualificationStatus,
      nextStatus,
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
  if (correction && !current.correctable)
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
  await db
    .insert(contactProfileCertifications)
    .values({
      contactId: contact.id,
      evidenceRevision: inspection.evidenceRevision,
      coverageSnapshot: { ...inspection.coverage },
      actorUserId: input.actorUserId,
      certifiedAt: now,
    })
    .onConflictDoNothing();
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
