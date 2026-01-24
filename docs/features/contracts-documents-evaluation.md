# Contracts & Documents Feature Evaluation

> Evaluated with a YC mindset: Does this solve a real problem? Is it 10x better? Can we start narrow and expand?

---

## Executive Summary

**Verdict: HIGH PRIORITY FEATURE** - Strong product-market fit potential

Jovie already has the foundational infrastructure for this feature:
- Multi-artist collaboration tracking (`artists`, `trackArtists`, `releaseArtists`)
- Payment infrastructure (Stripe, tips, subscriptions)
- Artist role taxonomy (main_artist, featured, producer, remixer, etc.)

Adding contracts/documents creates a **natural moat** and makes Jovie the source of truth for music collaborations.

---

## The Problem (Why This Matters)

### Pain Points for Independent Artists

| Problem | Current "Solution" | Pain Level |
|---------|-------------------|------------|
| **Split sheets are mandatory** but tedious | Google Docs, PDF templates, handshakes | 🔴 High |
| **Splits are often forgotten** until money arrives | Awkward conversations, disputes | 🔴 High |
| **No single source of truth** for who owns what | Scattered emails, lost contracts | 🔴 High |
| **Licensing deals are complex** | Expensive lawyers, template sites | 🟡 Medium |
| **Collaboration terms are verbal** | "We'll figure it out later" | 🔴 High |

### Why Now?

1. **AI/Streaming disruption**: More independent artists = more self-managed deals
2. **Collaboration is exploding**: Features, remixes, producer beats are the norm
3. **Distribution platforms now ask for splits**: DistroKid, TuneCore want this data
4. **Legal literacy is low**: Most artists don't know they need this until it's too late

---

## The Opportunity

### Jovie's Unique Position

```
┌─────────────────────────────────────────────────────────────┐
│                     JOVIE ALREADY HAS:                       │
├─────────────────────────────────────────────────────────────┤
│  ✅ Artist Registry (artists table)                          │
│  ✅ Track/Release Catalog (discogTracks, discogReleases)     │
│  ✅ Collaboration Roles (trackArtists with 12 role types)    │
│  ✅ Payment Rails (Stripe, tips, subscriptions)              │
│  ✅ Contact Management (creatorContacts)                     │
│  ✅ Notification System (email, SMS, push)                   │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    MISSING PIECE:                            │
│         Agreements layer connecting all of this              │
└─────────────────────────────────────────────────────────────┘
```

### Competitive Landscape

| Competitor | What They Do | Gap |
|------------|--------------|-----|
| **Disco.ac** | Collaborative project management | Enterprise, expensive, not artist-first |
| **Stem/DistroKid Splits** | Basic royalty splitting | Only works on their distribution |
| **CreateSafe** | AI-powered music contracts | Complex, legal-heavy |
| **Beatstars** | Beat licensing contracts | Beat-only, not full collaboration |
| **HelloSign/DocuSign** | Generic e-signatures | No music context, expensive |

**The gap**: No one owns the "Notion for music contracts" space - simple, artist-friendly, integrated with existing workflows.

---

## Feature Design: Start Narrow, Expand

### Phase 1: Split Sheets (MVP) 🎯

**Why start here:**
- Highest frequency use case
- Simple enough to ship fast
- Required by distributors
- Already have the data model

**User Flow:**
```
1. Artist creates/imports a track
2. Jovie auto-populates collaborators from trackArtists
3. Artist adjusts split percentages
4. All parties receive notification to review/sign
5. Signed split sheet stored and exportable
```

**Data Model Addition:**
```typescript
// New table: splitSheets
{
  id: uuid,
  trackId: uuid (FK to discogTracks),
  releaseId: uuid (FK to discogReleases, optional),
  status: 'draft' | 'pending_signatures' | 'partially_signed' | 'completed' | 'disputed',
  createdBy: uuid (FK to users),

  // Split details
  splits: jsonb, // Array of { artistId, role, percentage, signedAt, signatureData }

  // Metadata
  songTitle: string,
  writers: jsonb, // Publishing splits (can differ from master splits)
  masterOwnership: jsonb, // Master recording splits

  // Timestamps
  completedAt: timestamp,
  expiresAt: timestamp, // For drafts
}

// New table: splitSheetSignatures
{
  id: uuid,
  splitSheetId: uuid,
  artistId: uuid,
  userId: uuid (nullable - external collaborators),
  email: string,
  signedAt: timestamp,
  ipAddress: string,
  signatureData: jsonb, // Could be typed name or actual signature
}
```

**MVP Features:**
- [ ] Auto-generate split sheet from existing track data
- [ ] Manual split percentage entry (must sum to 100%)
- [ ] Email invitations to collaborators (Jovie users or external)
- [ ] Simple "I agree" signature (not fancy e-signature)
- [ ] PDF export (for distributors, labels)
- [ ] Status tracking (pending, signed, completed)

### Phase 2: Session Agreements

**For studio sessions before a song is finished:**

```typescript
// sessionAgreements table
{
  id: uuid,
  createdBy: uuid,
  sessionDate: date,
  location: string,
  projectName: string, // Working title
  status: 'active' | 'converted' | 'cancelled',

  participants: jsonb, // { artistId, role, agreedTerms }
  defaultSplitTerms: jsonb, // Pre-agreed splits

  // When song is finished, convert to split sheet
  convertedToSplitSheetId: uuid,
}
```

**Use Case:**
> "Before we hit the studio, let's agree that anything we make today is 50/50"

### Phase 3: Licensing Agreements

**For sync, samples, remixes:**

| License Type | Template Needed |
|--------------|-----------------|
| **Sync License** | Song in video/film/ad |
| **Sample Clearance** | Using someone else's sample |
| **Remix License** | Official remix permission |
| **Beat License** | Producer selling beats |
| **Feature Agreement** | Guest verse terms |

**Template System:**
```typescript
// contractTemplates table
{
  id: uuid,
  type: 'sync' | 'sample' | 'remix' | 'beat' | 'feature' | 'custom',
  name: string,
  createdBy: uuid, // null for Jovie defaults
  isPublic: boolean,

  // Template content
  sections: jsonb, // Modular contract sections
  variables: jsonb, // { variableName: 'type', required: boolean }

  // Metadata
  jurisdiction: string, // 'US', 'UK', 'EU', etc.
  version: integer,
}

// contracts table
{
  id: uuid,
  templateId: uuid,
  trackId: uuid,
  releaseId: uuid,

  parties: jsonb, // { artistId, role: 'licensor' | 'licensee', signedAt }

  // Filled-in terms
  terms: jsonb, // All variable values
  customClauses: jsonb,

  // Status
  status: 'draft' | 'negotiating' | 'pending_signatures' | 'active' | 'expired' | 'terminated',
  effectiveDate: date,
  expirationDate: date,

  // Financial terms (for tracking)
  upfrontFee: integer, // cents
  royaltyRate: decimal,
  royaltyType: 'percentage' | 'flat_per_stream' | 'flat_per_sale',
}
```

### Phase 4: Royalty Tracking & Payouts

**The endgame - becoming the financial layer:**

```typescript
// royaltyStatements table
{
  id: uuid,
  contractId: uuid,
  period: daterange,

  grossRevenue: integer, // cents
  splits: jsonb, // Calculated amounts per party

  status: 'calculated' | 'approved' | 'paid',
  paidAt: timestamp,
  stripePayoutIds: jsonb,
}
```

**Why this matters:**
- Lock-in: If Jovie handles money, artists never leave
- Revenue: Take small % of transactions
- Data: Understand true revenue in music industry

---

## YC-Style Analysis

### Is This a Real Problem?

**Evidence:**
1. Every distributor (DistroKid, TuneCore, CD Baby) now requires split information
2. ASCAP/BMI registration requires writer splits
3. The #1 cause of music lawsuits is disputed ownership
4. "Did we agree on splits?" is asked in every studio session

**Validation approach:**
- Interview 20 artists about their last collaboration
- Ask: "How did you document the split?"
- Prediction: 80%+ will say "we didn't" or "text message"

### Is Jovie 10x Better?

| Current Solution | Jovie Advantage |
|-----------------|-----------------|
| Google Docs template | Auto-fills from existing track/artist data |
| Email back-and-forth | In-app notifications, status tracking |
| Expensive legal software | Free tier, simple language |
| Verbal agreements | Timestamped, signed, legally defensible |
| Scattered across platforms | Single source of truth |

**10x factor**: Jovie already knows who collaborated on what. The split sheet writes itself.

### Can We Start Small?

**MVP scope (2-3 weeks):**
1. Add "Create Split Sheet" button to track detail page
2. Pre-fill from `trackArtists` data
3. Simple percentage input UI
4. Email notification to collaborators
5. "I agree" button for signatures
6. PDF export

**That's it.** No fancy e-signatures, no templates, no royalty tracking yet.

### What's the Moat?

1. **Data network effect**: More artists = more collaborators onboarded = more artists
2. **Integration depth**: Split sheets tied to actual tracks/releases
3. **Switching cost**: If all your contracts are in Jovie, you can't leave
4. **Trust**: Becomes the "notary" for music collaborations

---

## Revenue Potential

### Pricing Model Options

| Model | Free Tier | Pro Tier | Notes |
|-------|-----------|----------|-------|
| **Per-document** | 3 split sheets/month | Unlimited | Simple, clear value |
| **Included in Pro** | Basic splits only | Full contracts | Upsell existing subscriptions |
| **Transaction fee** | Free to create | 2.9% on payouts | Only make money when artist makes money |

**Recommendation:** Include basic split sheets in Pro tier, charge for advanced contracts/templates.

### Market Size

- ~8M independent artists globally (Spotify for Artists data)
- Average artist collaborates on 5-10 tracks/year
- If 1% of artists use Jovie for contracts at $10/month = $9.6M ARR potential

---

## Other Ideas to Explore

### 1. **AI Contract Assistant**
> "Paste any contract and I'll explain it in plain English"

- Use LLM to parse complex legal language
- Flag unusual/unfavorable terms
- Compare to industry standards

### 2. **Collaboration Marketplace**
> "Find a producer who's open to 50/50 splits"

- Artists post collaboration terms upfront
- Filter by split preference, role, genre
- Reduces negotiation friction

### 3. **Smart Contract Integration**
> "Royalties auto-split to wallets when streams come in"

- Web3 integration for automatic payments
- Transparent, immutable split records
- Appeals to crypto-native artists

### 4. **Label Dashboard**
> "Manage contracts for all your signed artists"

- B2B play for indie labels
- Bulk contract management
- Compliance tracking

### 5. **Sample Clearance Network**
> "Request to use a sample with one click"

- Connect sample owners with requesters
- Standardized licensing terms
- Track sample usage rights

### 6. **Producer Beat Vault**
> "Upload beats with pre-set licensing tiers"

- Producers set exclusive/non-exclusive terms
- Artists purchase with integrated contracts
- Competes with BeatStars

---

## Implementation Roadmap

### Week 1-2: Foundation
- [ ] Design split sheet data model
- [ ] Create `splitSheets` and `splitSheetSignatures` tables
- [ ] Build basic CRUD API for split sheets
- [ ] Simple UI for creating split from track page

### Week 3-4: Collaboration Flow
- [ ] Email notification system for collaborators
- [ ] External collaborator invite flow (non-Jovie users)
- [ ] Signature capture (simple "I agree" with timestamp)
- [ ] Status tracking and dashboard

### Week 5-6: Polish & Export
- [ ] PDF generation for split sheets
- [ ] Split sheet templates (standard terms)
- [ ] Dashboard for viewing all split sheets
- [ ] Basic analytics (unsigned, expired, completed)

### Week 7-8: Expand
- [ ] Session agreements
- [ ] Contract templates system
- [ ] Pro tier gating

---

## Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| **Legal liability** | Clear disclaimers, not legal advice, recommend lawyer for complex deals |
| **Adoption friction** | Make it dead simple, auto-fill everything possible |
| **Collaborator onboarding** | Allow external signatures via email, don't require Jovie account |
| **Feature complexity** | Start with just split sheets, resist scope creep |

---

## Success Metrics

### Leading Indicators
- Split sheets created per week
- Completion rate (draft → fully signed)
- External collaborator conversion to Jovie users

### Lagging Indicators
- Pro tier conversion lift
- User retention improvement
- NPS score change

### North Star
**"% of Jovie tracks with completed split sheets"**

---

## Conclusion

This feature is a natural extension of Jovie's existing multi-artist architecture. It solves a real, painful problem that every independent artist faces. The MVP is buildable in 2-3 weeks, and it creates significant switching costs.

**Recommendation: Prioritize for next sprint.**

The question isn't whether to build this - it's how fast we can ship the MVP and start learning from real usage.

---

*Document created: 2026-01-24*
*Status: Proposal*
