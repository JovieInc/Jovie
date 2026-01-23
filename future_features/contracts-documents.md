# Contracts & Documents Feature Evaluation

## The Problem (YC Lens)

### The Hair-on-Fire Problem

**"Who owns what?"** is the single most destructive question in independent music.

Every successful song creates a financial and legal mess:
- **Verbal agreements** from late-night studio sessions evaporate
- **Split disputes** destroy friendships and delay releases
- **Lost revenue** when distributors don't know who to pay
- **Legal costs** of $5-50k to resolve ownership disputes (more than most indie artists earn)

**Real stats:**
- 80%+ of independent artists have no written split agreements
- Average sync licensing deal falls through in 30-45 days of legal back-and-forth
- PROs (ASCAP/BMI) reject 40% of registrations due to conflicting ownership claims
- Major labels routinely reject unsigned collaborators' work

### Why Now?

1. **Independent music is booming** - 60%+ of new releases are independent
2. **Collaboration is the norm** - Average track has 3.2 credited artists
3. **Sync revenue is exploding** - $1.5B+ market, growing 20% YoY
4. **Artists are becoming businesses** - Need professional infrastructure

### Why Jovie?

Jovie has **unfair advantages** that make this a natural extension:

| Advantage | How It Helps Contracts |
|-----------|----------------------|
| **Multi-artist support** | Already tracks collaborators with roles (producer, featured, etc.) |
| **Creator contacts** | Business relationships (managers, agents) already in system |
| **Payment infrastructure** | Stripe integration ready for payment splits |
| **Identity layer** | Verified artist profiles = trusted signatories |
| **Content registry** | Tracks & releases already catalogued with ISRCs/UPCs |

---

## Market Analysis

### Competitive Landscape

| Product | Focus | Gap |
|---------|-------|-----|
| **Splice** | Beat marketplace with basic splits | Not connected to full release workflow |
| **SplitSheet.co** | Simple split sheets | PDF generator, no tracking or payments |
| **CreativesFirst** | Session contracts | Standalone, no artist platform |
| **DistroKid/TuneCore** | Distribution splits | Only handles their royalties, not all income |
| **Stem** (defunct) | Full split management | Too early, no distribution network |
| **Sound.xyz** | Web3 splits | Crypto-only, niche market |

### The Gap

**No one owns "source of truth for collaboration agreements"** that:
1. Connects to the actual content (tracks/releases)
2. Handles all income types (streaming, sync, tips, merch)
3. Provides legally-valid documentation
4. Automates payment distribution
5. Works for both Jovie users AND external collaborators

---

## Feature Definition

### Core Concept: **"Split Sheets That Actually Work"**

Transform the industry-standard split sheet from a paper form into a **living agreement** connected to real content and real money.

### Feature Components

#### 1. Split Sheets (MVP - Phase 1)
Pre-filled agreements for track/release ownership:
- Master recording ownership (sound recording)
- Publishing/composition ownership (songwriting)
- Auto-populated from existing track metadata
- PDF export for traditional workflows
- E-signature for legal validity

#### 2. Session Agreements (Phase 2)
Contracts for studio collaborations:
- Producer agreements (points, upfront, or hybrid)
- Session musician work-for-hire
- Engineering agreements
- Beat licensing (exclusive/non-exclusive)

#### 3. Licensing Deals (Phase 3)
Sync and sample licensing:
- Sync licensing agreements (TV, film, ads)
- Sample clearance documentation
- Remix agreements
- Cover song licensing

#### 4. Payment Distribution (Phase 3+)
Automatic split payouts:
- Route tips to all collaborators based on splits
- Prepare for streaming revenue distribution
- Payment scheduling and thresholds
- Tax documentation (1099s)

---

## User Stories

### Primary Personas

**Producer Paul** - Makes beats, collaborates with vocalists
> "I need to get splits in writing BEFORE we release. I've lost thousands in royalties because nothing was documented."

**Artist Amy** - Singer-songwriter, works with various producers
> "Every time I want to pitch a song for sync, lawyers ask for chain of title documentation. I have nothing."

**Manager Mike** - Manages 5 indie artists
> "I spend 10 hours a month chasing down split confirmations. It's the worst part of my job."

**Session musician Sam** - Plays on other artists' tracks
> "I get promised 'a percentage' but never see a dime. I need everything in writing."

### User Stories

```
As a PRODUCER, I want to create a split sheet for a beat I made,
so that ownership is documented before I share it.

As an ARTIST, I want to propose splits to my collaborators,
so that everyone agrees before release.

As a COLLABORATOR, I want to review and sign splits from my phone,
so that I don't slow down the release.

As a MANAGER, I want to see all pending split agreements for my artists,
so that I can ensure nothing ships without documentation.

As an ARTIST, I want to export chain-of-title docs for sync pitches,
so that I don't lose licensing opportunities.

As a SESSION MUSICIAN, I want a work-for-hire agreement,
so that I get paid and the artist owns the master cleanly.
```

---

## Technical Design

### Database Schema (Drizzle/PostgreSQL)

```typescript
// New enums
export const agreementTypeEnum = pgEnum('agreement_type', [
  'split_sheet',           // Master + publishing ownership
  'producer_agreement',    // Beat/production deal
  'session_agreement',     // Work-for-hire
  'licensing_agreement',   // Sync, sample, remix
  'collaboration_agreement', // General collab terms
]);

export const agreementStatusEnum = pgEnum('agreement_status', [
  'draft',          // Being edited
  'pending',        // Sent, awaiting signatures
  'active',         // All parties signed
  'expired',        // Past validity date
  'terminated',     // Cancelled by party
  'disputed',       // Under dispute
]);

export const splitTypeEnum = pgEnum('split_type', [
  'master',         // Sound recording ownership
  'publishing',     // Composition/songwriting
  'sync',           // Sync licensing share
  'performance',    // Performance royalties
]);

export const signatureStatusEnum = pgEnum('signature_status', [
  'pending',
  'signed',
  'declined',
  'expired',
]);
```

#### Core Tables

```typescript
/**
 * Agreements - Master record for all contract types
 */
export const agreements = pgTable('agreements', {
  id: uuid('id').primaryKey().defaultRandom(),

  // Owner (creator of the agreement)
  creatorProfileId: uuid('creator_profile_id')
    .notNull()
    .references(() => creatorProfiles.id, { onDelete: 'cascade' }),

  // What this agreement covers
  agreementType: agreementTypeEnum('agreement_type').notNull(),
  title: text('title').notNull(),
  description: text('description'),

  // Link to content (optional - some agreements are pre-recording)
  releaseId: uuid('release_id')
    .references(() => discogReleases.id, { onDelete: 'set null' }),
  trackId: uuid('track_id')
    .references(() => discogTracks.id, { onDelete: 'set null' }),

  // Status & lifecycle
  status: agreementStatusEnum('status').notNull().default('draft'),
  effectiveDate: timestamp('effective_date'),
  expirationDate: timestamp('expiration_date'),

  // Financial terms
  advanceAmount: integer('advance_amount'),  // cents
  currency: currencyCodeEnum('currency').default('USD'),

  // Territory & rights
  territories: text('territories').array(),  // ['US', 'CA', 'WW']
  isExclusive: boolean('is_exclusive').default(true),

  // Document generation
  templateId: text('template_id'),
  generatedDocumentUrl: text('generated_document_url'),

  // Signing
  signatureDeadline: timestamp('signature_deadline'),
  fullyExecutedAt: timestamp('fully_executed_at'),

  // Metadata
  metadata: jsonb('metadata').$type<Record<string, unknown>>().default({}),
  notes: text('notes'),

  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

/**
 * Agreement Parties - All signatories to an agreement
 */
export const agreementParties = pgTable('agreement_parties', {
  id: uuid('id').primaryKey().defaultRandom(),

  agreementId: uuid('agreement_id')
    .notNull()
    .references(() => agreements.id, { onDelete: 'cascade' }),

  // Can be Jovie user or external collaborator
  artistId: uuid('artist_id')
    .references(() => artists.id, { onDelete: 'cascade' }),

  // For external parties without Jovie accounts
  externalName: text('external_name'),
  externalEmail: text('external_email'),
  externalPhone: text('external_phone'),

  // Legal entity info
  legalName: text('legal_name'),
  publisherName: text('publisher_name'),  // If represented
  proAffiliation: text('pro_affiliation'), // ASCAP, BMI, SESAC, etc.
  ipiNumber: text('ipi_number'),           // International Publisher ID

  // Role in agreement
  role: artistRoleEnum('role').notNull(),
  isInitiator: boolean('is_initiator').default(false),

  // Signature
  signatureStatus: signatureStatusEnum('signature_status').default('pending'),
  signedAt: timestamp('signed_at'),
  signatureIp: text('signature_ip'),
  signatureData: jsonb('signature_data'),  // e-signature payload

  // Notification tracking
  lastNotifiedAt: timestamp('last_notified_at'),
  notificationCount: integer('notification_count').default(0),

  metadata: jsonb('metadata').$type<Record<string, unknown>>().default({}),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

/**
 * Agreement Splits - Ownership percentages per party
 */
export const agreementSplits = pgTable('agreement_splits', {
  id: uuid('id').primaryKey().defaultRandom(),

  agreementId: uuid('agreement_id')
    .notNull()
    .references(() => agreements.id, { onDelete: 'cascade' }),

  partyId: uuid('party_id')
    .notNull()
    .references(() => agreementParties.id, { onDelete: 'cascade' }),

  splitType: splitTypeEnum('split_type').notNull(),
  percentage: decimal('percentage', { precision: 5, scale: 2 }).notNull(), // 0.00 - 100.00

  // For complex deals
  isRecoupable: boolean('is_recoupable').default(false),
  recoupmentSource: text('recoupment_source'),  // What income applies

  metadata: jsonb('metadata').$type<Record<string, unknown>>().default({}),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, table => ({
  // Splits per type should sum to 100%
  splitPercentageRange: check(
    'agreement_splits_percentage_range',
    drizzleSql`percentage >= 0 AND percentage <= 100`
  ),
  // Unique split type per party per agreement
  partyTypeUnique: uniqueIndex('agreement_splits_party_type').on(
    table.agreementId,
    table.partyId,
    table.splitType
  ),
}));

/**
 * Agreement Templates - Pre-built contract templates
 */
export const agreementTemplates = pgTable('agreement_templates', {
  id: text('id').primaryKey(),  // e.g., 'split_sheet_standard'

  name: text('name').notNull(),
  description: text('description'),
  agreementType: agreementTypeEnum('agreement_type').notNull(),

  // Template content (markdown or structured)
  templateContent: text('template_content').notNull(),
  requiredFields: jsonb('required_fields').$type<string[]>().default([]),

  // Categorization
  isPublic: boolean('is_public').default(true),
  category: text('category'),  // 'standard', 'sync', 'session', etc.
  jurisdiction: text('jurisdiction'),  // 'US', 'UK', etc.

  // Usage tracking
  useCount: integer('use_count').default(0),

  metadata: jsonb('metadata').$type<Record<string, unknown>>().default({}),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

/**
 * Agreement Activity Log - Audit trail
 */
export const agreementActivityLog = pgTable('agreement_activity_log', {
  id: uuid('id').primaryKey().defaultRandom(),

  agreementId: uuid('agreement_id')
    .notNull()
    .references(() => agreements.id, { onDelete: 'cascade' }),

  actorId: uuid('actor_id')
    .references(() => creatorProfiles.id, { onDelete: 'set null' }),

  action: text('action').notNull(),  // 'created', 'sent', 'signed', 'modified', etc.
  details: jsonb('details').$type<Record<string, unknown>>().default({}),

  ipAddress: text('ip_address'),
  userAgent: text('user_agent'),

  createdAt: timestamp('created_at').defaultNow().notNull(),
});
```

### Integration Points

#### With Existing Systems

```
┌─────────────────────────────────────────────────────────────────┐
│                         JOVIE PLATFORM                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────────┐  │
│  │   Artists    │───▶│  Agreements  │◀───│  Creator         │  │
│  │   Table      │    │   (NEW)      │    │  Contacts        │  │
│  └──────────────┘    └──────────────┘    └──────────────────┘  │
│         │                   │                     │             │
│         │                   │                     │             │
│         ▼                   ▼                     ▼             │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────────┐  │
│  │ Track/Release│    │    Tips      │    │   Stripe         │  │
│  │   Artists    │    │  (Existing)  │    │   Payments       │  │
│  └──────────────┘    └──────────────┘    └──────────────────┘  │
│                             │                     │             │
│                             └──────────┬──────────┘             │
│                                        ▼                        │
│                           ┌─────────────────────┐               │
│                           │  Payment            │               │
│                           │  Distribution (P3)  │               │
│                           └─────────────────────┘               │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### API Design

```typescript
// Dashboard APIs
POST   /api/dashboard/agreements           // Create new agreement
GET    /api/dashboard/agreements           // List my agreements
GET    /api/dashboard/agreements/:id       // Get agreement details
PATCH  /api/dashboard/agreements/:id       // Update agreement
DELETE /api/dashboard/agreements/:id       // Delete draft agreement

// Collaborator flow (no auth required - token-based)
GET    /api/agreements/:id/review/:token   // View agreement to sign
POST   /api/agreements/:id/sign/:token     // Sign agreement

// Document generation
POST   /api/dashboard/agreements/:id/generate  // Generate PDF
GET    /api/dashboard/agreements/:id/download  // Download PDF

// Templates
GET    /api/agreements/templates           // List available templates
GET    /api/agreements/templates/:id       // Get template details
```

---

## UI/UX Design

### Dashboard Integration

New sidebar section: **"Contracts"** (between Earnings and Settings)

```
Dashboard
├── Overview
├── Profile
├── Links
├── Releases
├── Analytics
├── Audience
├── Contacts
├── Earnings
├── Contracts  ← NEW
│   ├── All Agreements
│   ├── Pending Signatures
│   ├── Templates
│   └── Create New
└── Settings
```

### Key Flows

#### Flow 1: Create Split Sheet from Track

```
User viewing track in Releases
        │
        ▼
Click "Add Split Sheet" button
        │
        ▼
┌─────────────────────────────────┐
│  Track auto-populated:          │
│  "Summer Nights" by @amy        │
│                                 │
│  Track Credits (from system):   │
│  ☑ @amy - Main Artist          │
│  ☑ @producerpaul - Producer    │
│  ☐ Add collaborator...         │
└─────────────────────────────────┘
        │
        ▼
┌─────────────────────────────────┐
│  Master Recording Splits        │
│  ┌────────────────────────────┐ │
│  │ @amy           [====] 60%  │ │
│  │ @producerpaul  [===]  40%  │ │
│  └────────────────────────────┘ │
│         Total: 100% ✓          │
│                                 │
│  Publishing Splits              │
│  ┌────────────────────────────┐ │
│  │ @amy (lyrics)  [====] 70%  │ │
│  │ @producerpaul  [==]   30%  │ │
│  │   (composition)            │ │
│  └────────────────────────────┘ │
│         Total: 100% ✓          │
└─────────────────────────────────┘
        │
        ▼
Preview & Send for Signatures
        │
        ▼
Collaborators receive email/SMS
        │
        ▼
Mobile-friendly signature flow
        │
        ▼
All signed → Agreement active
```

#### Flow 2: Collaborator Signing (Mobile-First)

```
Collaborator receives link
        │
        ▼
┌─────────────────────────────────┐
│  🎵 Split Sheet for            │
│     "Summer Nights"             │
│                                 │
│  From: Amy (@amy)               │
│                                 │
│  Your splits:                   │
│  • Master: 40%                  │
│  • Publishing: 30%              │
│                                 │
│  [View Full Agreement]          │
│                                 │
│  By signing, you confirm...     │
│  ☑ I am Producer Paul          │
│  ☑ I agree to terms             │
│                                 │
│  ┌───────────────────────────┐  │
│  │     [Sign Agreement]      │  │
│  └───────────────────────────┘  │
└─────────────────────────────────┘
```

### Template Selection

```
┌─────────────────────────────────────────────────────────────┐
│  Choose Agreement Type                                      │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  📄 Split Sheet                    Most Popular            │
│     Document ownership splits for a track or release        │
│     [Use Template]                                          │
│                                                             │
│  🎛️ Producer Agreement                                      │
│     Beat sale, production deal, or co-production            │
│     [Use Template]                                          │
│                                                             │
│  🎸 Session Agreement                                       │
│     Work-for-hire for session musicians                     │
│     [Use Template]                                          │
│                                                             │
│  📺 Sync License (Coming Soon)                              │
│     License your music for TV, film, or ads                 │
│     [Notify Me]                                             │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## Implementation Phases

### Phase 1: MVP Split Sheets (4-6 weeks)

**Goal:** Basic split sheet creation, signing, and export

**Deliverables:**
- [ ] Database schema for agreements, parties, splits
- [ ] Split sheet creation UI
- [ ] Auto-populate from track credits
- [ ] Email notification to collaborators
- [ ] Mobile-friendly signing flow
- [ ] PDF generation and export
- [ ] Agreements dashboard listing

**Success Metrics:**
- 100+ split sheets created in first month
- 70%+ signature completion rate
- NPS > 40 from users who create agreements

### Phase 2: Enhanced Agreements (4-6 weeks)

**Goal:** Producer agreements, session contracts, better workflow

**Deliverables:**
- [ ] Producer agreement template
- [ ] Session/work-for-hire agreement template
- [ ] Template customization
- [ ] Reminder system for unsigned agreements
- [ ] Agreement cloning/versioning
- [ ] Bulk actions (send reminders, void agreements)

**Success Metrics:**
- 500+ total agreements
- Reduce time-to-signature by 50%
- 3+ templates actively used

### Phase 3: Payment Distribution (6-8 weeks)

**Goal:** Connect agreements to actual money flow

**Deliverables:**
- [ ] Tip splitting based on agreements
- [ ] Collaborator payout dashboard
- [ ] Stripe Connect integration for external collaborators
- [ ] Payment history and reporting
- [ ] Tax documentation (1099 generation)

**Success Metrics:**
- $10k+ distributed through platform
- 50%+ of tips auto-split
- Zero payment disputes

### Phase 4: Licensing & Sync (8-10 weeks)

**Goal:** Professional licensing workflow

**Deliverables:**
- [ ] Sync licensing agreement templates
- [ ] Sample clearance documentation
- [ ] Remix agreement templates
- [ ] "Chain of title" export for music supervisors
- [ ] Integration with sync opportunity marketplace (future)

**Success Metrics:**
- Used in 10+ actual sync deals
- Music supervisors requesting Jovie documentation

---

## Revenue Model

### Potential Monetization

| Model | Details | Estimated Revenue |
|-------|---------|------------------|
| **Freemium** | Free: 5 agreements/mo, Pro: unlimited | $5-15/mo per Pro user |
| **Transaction Fee** | 1-2% on distributed payments | Scales with platform GMV |
| **Premium Templates** | Attorney-drafted templates | $10-50 one-time |
| **White-Label** | For labels/distributors | Enterprise pricing |

### Recommended Approach

**Phase 1-2:** Completely free to drive adoption and data
**Phase 3:** Introduce payment distribution fee (1.5% on splits)
**Phase 4:** Premium features for Pro subscribers

---

## Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| **Legal liability** | Medium | High | Clear disclaimers, "not legal advice", attorney-reviewed templates |
| **Low adoption** | Medium | High | Make it frictionless, auto-suggest from track credits |
| **Signature disputes** | Low | High | Strong audit trail, IP logging, timestamp verification |
| **Payment complexity** | Medium | Medium | Phase approach, start with tips only |
| **Scope creep** | High | Medium | Strict MVP definition, no custom contracts in P1 |

---

## Competitive Moat

### What Makes This Defensible

1. **Network Effects** - Every agreement involves 2+ people. As more artists use Jovie, collaborators are pulled in
2. **Data Moat** - Understanding collaboration patterns, common terms, dispute indicators
3. **Integration Depth** - Connected to actual content + payments (competitors have standalone tools)
4. **Trust Layer** - Verified artist identities make agreements more legitimate
5. **Switching Cost** - Historical agreements locked in platform

### Long-Term Vision

```
Today:      Split sheets & basic contracts
            ↓
Year 1:     Payment distribution for tips
            ↓
Year 2:     Streaming royalty distribution
            ↓
Year 3:     Full rights management platform
            ↓
Future:     The "Carta for Music Rights"
```

---

## Success Criteria

### Phase 1 Launch Criteria

- [ ] Core happy path works end-to-end
- [ ] Mobile signing flow < 30 seconds
- [ ] PDF export matches industry standard format
- [ ] Email deliverability > 95%
- [ ] Zero data loss or security issues

### 6-Month Goals

- 1,000+ active agreements
- 80%+ of tracks with collaborators have split sheets
- Featured in music industry press
- Partnership discussions with 2+ distributors

---

## Open Questions

1. **Legal Review** - Do templates need attorney review per jurisdiction?
2. **Disputes** - What happens when parties disagree? Mediation features?
3. **Versioning** - How to handle amendments to existing agreements?
4. **PRO Integration** - Can we auto-register with ASCAP/BMI?
5. **International** - Different requirements in UK, EU, etc.?

---

## Appendix: Industry Standard Split Sheet Fields

A standard split sheet includes:
- Song title
- Date of creation
- All contributors with:
  - Legal name
  - Artist/stage name
  - Role (writer, producer, etc.)
  - Ownership percentage
  - Publisher name (if any)
  - PRO affiliation (ASCAP, BMI, SESAC, etc.)
  - IPI/CAE number
  - Contact info
- Signatures of all parties
- Date signed

---

## References

- [Split Sheet Coalition](https://www.splitsforartists.com/)
- [ASCAP Registration Requirements](https://www.ascap.com/help/members)
- [BMI Work Registration](https://www.bmi.com/creators)
- [Music Modernization Act](https://www.copyright.gov/music-modernization/)
