# Artist Memory — Architecture & Roadmap

**Owner:** Maddie (CoS) → Code-Orchestrator → Coder
**Status:** Planning

## The Architecture (3-Layer Memory)

```
┌──────────────────────────────────────────────────┐
│              Jovie Artist Memory                  │
├──────────────────────────────────────────────────┤
│  Layer 1: Structured Memory (Postgres)           │
│  ┌────────────────────────────────────────────┐  │
│  │ artist_memory_facts    artist_preferences  │  │
│  │ memory_sources         moments/actions     │  │
│  │                                            │  │
│  │ "Truth. Deterministic. Queryable."         │  │
│  └────────────────────────────────────────────┘  │
├──────────────────────────────────────────────────┤
│  Layer 2: Vector Recall (pgvector in Neon)       │
│  ┌────────────────────────────────────────────┐  │
│  │ memory_documents                           │  │
│  │  - lyrics, captions, bios, press,          │  │
│  │    interviews, past posts, chat history    │  │
│  │                                            │  │
│  │ "Context. Fuzzy. Candidate retrieval."     │  │
│  └────────────────────────────────────────────┘  │
├──────────────────────────────────────────────────┤
│  Layer 3: Agent Memory (Honcho)                  │
│  ┌────────────────────────────────────────────┐  │
│  │ Artist preference memory                   │  │
│  │  - tone, taste, creative direction         │  │
│  │  - rejected/approved patterns              │  │
│  │  - collaborator dynamics                   │  │
│  │                                            │  │
│  │ "Behavior. How Jovie should act."          │  │
│  └────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────┘
```

### Mental Model

- **Postgres** = Facts Jovie must know (e.g. "Song X released June 14, 2024")
- **Vector** = Context Jovie should remember (e.g. "12 captions/photos/interviews related to Song X")
- **Honcho** = How Jovie should behave (e.g. "This artist prefers dark, cinematic, sarcastic content")

**Do not:** use vectors as truth, let Honcho own canonical facts, create separate GBrain infra per artist.

**Do:** one multi-tenant memory system scoped by `artist_id`, three layers.

---

## Existing Foundation

What already exists in the repo:

| Asset | Status |
|-------|--------|
| `artists` table (canonical registry) | Done |
| `track_artists`, `recording_artists`, `release_artists` (collaborator graph) | Done |
| Creator profiles, identity links | Done |
| pgvector in Neon | Not enabled |
| `artist_memory_facts` table | Not created |
| `artist_preferences` table | Not created |
| `memory_sources` table | Not created |
| `memory_documents` (with embeddings) | Not created |
| Honcho integration | None |
| Cloudflare Vectorize | None |

---

## Phase 1 — Structured Memory (Postgres Truth)

**Goal:** Ship the deterministic memory foundation. Artists get confirmed facts, dismissed suggestions, preferences, and a moment-tracking engine.

### Issues

| # | Issue | Description |
|---|-------|-------------|
| P1-1 | **Schema: artist_memory_facts** | Create table with: id, artist_id, subject_type, subject_id, key, value (jsonb), confidence, source, confirmed_at, dismissed_at, created_at. Drizzle schema + migration. |
| P1-2 | **Schema: artist_preferences** | Create table with: id, artist_id, preference_key, preference_value (jsonb), source, created_at, updated_at. For brand voice, content tone, visual direction, approved/rejected patterns. |
| P1-3 | **Schema: memory_sources** | Create table tracking where a memory fact originated (ingestion, manual entry, vector-suggested, artist-said, agent-inferred). Enables audit trail. |
| P1-4 | **Memory Fact CRUD API** | Server actions: createFact, confirmFact, dismissFact, getFactsByArtist, getPreferences. Auth-scoped to artist. Include fail-closed error handling. |
| P1-5 | **Moments Calendar Integration** | Wire the existing release-planning moments system into artist_memory_facts. When a moment action (approve/dismiss) happens, record it as a memory fact. |
| P1-6 | **Artist Memory Admin UI** | Basic page/panel for artist to view confirmed memories, see pending suggestions, approve/dismiss. Start simple — no design system work needed beyond existing primitives. |

### Dependencies

- `artists` table (done)
- `creator_profiles` / identity linking (done)

### Acceptance

- An artist can have 20+ confirmed facts
- Facts can be looked up by subject_type + key
- Dismissed suggestions are stored, not deleted
- All operations are sub-second on Neon

---

## Phase 2 — Vector Recall (pgvector)

**Goal:** Enable fuzzy semantic search across artist context — lyrics, captions, bios, press, interviews, past posts.

### Issues

| # | Issue | Description |
|---|-------|-------------|
| P2-1 | **Enable pgvector in Neon** | Run `CREATE EXTENSION vector;` migration. Add to Drizzle schema. Verify indexing works. |
| P2-2 | **Schema: memory_documents** | Create table: id, artist_id, entity_type, entity_id, source_type, title, body, embedding (vector), metadata (jsonb), created_at. Add IVFFlat or HNSW index. |
| P2-3 | **Embedding Pipeline** | Background job that takes artist content (lyrics, bios, captions, press) and generates embeddings via OpenAI/OpenRouter embeddings API. Store in memory_documents. One-shot backfill + incremental on new content. |
| P2-4 | **Similarity Search API** | Server action: `searchArtistMemory(artistId, query, limit, threshold)` → returns ranked candidates with similarity scores. Scoped to artist. |
| P2-5 | **Memory Suggestion Engine** | Use vector search results to propose memory facts for confirmation. "Vector search found 3 sources suggesting June 4. Ask artist to confirm." Feed candidates into artist_memory_facts with source='vector_suggestion' and low confidence. |
| P2-6 | **Privacy & Deletion** | Cascade deletes on artist delete. User-facing "clear vector memory" option. Delete from embedding + facts. |

### Dependencies

- Phase 1 complete (artist_memory_facts exists for confirmed candidates)
- Neon pgvector support verified

### Acceptance

- Search for "Halloween post ideas" returns relevant old captions, photos, lyrics
- Vector results feed into suggestion engine, not direct truth
- Deletion removes embeddings + associated fact candidates

---

## Phase 3 — Agent Memory (Honcho)

**Goal:** Jovie learns how each artist wants to be treated — tone, taste, creative direction, rejection patterns.

### Issues

| # | Issue | Description |
|---|-------|-------------|
| P3-1 | **Honcho Setup** | Deploy Honcho instance (self-hosted or managed). Configure multi-tenant scoping by artist_id. Auth integration. |
| P3-2 | **Honcho ↔ Postgres Sync** | Read from artist_memory_facts + artist_preferences to seed Honcho sessions. Write Honcho-learned patterns back to artist_preferences for durability. |
| P3-3 | **Agent Behavior System** | When Jovie suggests content (posts, captions, rollout plans), query Honcho for: "What tone does this artist prefer? What patterns have they rejected?" Apply preferences before generating output. |
| P3-4 | **Preference Learning Pipeline** | After each artist interaction (approve/reject/edit), feed the result to Honcho. "Artist rejected corporate-sounding caption. Prefers blunt, funny, first-person copy." |
| P3-5 | **Fallback & Fail-Open** | If Honcho is down, fall back to Postgres preferences. Never block the artist from working. |

### Dependencies

- Phase 1 complete (Postgres schema for preference storage)
- Honcho operational (need to decide self-host vs managed)

### Acceptance

- After 5-10 interactions, Jovie adjusts its tone to match artist preferences
- Rejected patterns stop appearing
- Preference state survives Honcho restart (synced to Postgres)

---

## Phase 4 — Edge Search (Cloudflare Vectorize)

**Goal:** Ultra-fast semantic retrieval at the edge for public-facing surfaces.

### Issues

| # | Issue | Description |
|---|-------|-------------|
| P4-1 | **Cloudflare Vectorize Setup** | Create Vectorize index. Configure Workers AI for embeddings at edge. |
| P4-2 | **Index Sync** | Keep pgvector and Vectorize in sync. Background job pushes new embeddings to Vectorize. Handle conflicts. |
| P4-3 | **Edge Retrieval** | Wire Cloudflare Worker to query Vectorize for public profile personalization, "related moments" lookup, fan-facing recommendations. |

### Dependencies

- Phase 2 complete (embedding pipeline exists)
- Jovie has public-facing surface that needs edge speed

### Acceptance

- Sub-50ms retrieval for public profile semantic search
- Sync lag under 60 seconds

---

## What Not To Build

- Separate GBrain instance per artist (operational pain, no benefit)
- Vectors as truth source (vectors suggest, Postgres confirms)
- Honcho as canonical fact store (Honcho learns, Postgres remembers)
- Overbuilding before Phase 1 ships and works
- Cloudflare Vectorize before pgvector proves insufficient

---

## Product Framing

**External:** "Jovie remembers your releases, collaborators, milestones, photos, and creative preferences so it can suggest the right thing at the right time."

**Internal concept:**
```
Artist Memory = facts + context + preferences + moments
             = Postgres + pgvector + Honcho + Calendar
```

---

## Proposed Linear Project: "Artist Memory"

Tracked as a Linear project with issues organized by phase. Issues labeled `artist-memory` for filtering.

### Issue Count Summary

| Phase | Issues | Estimate |
|-------|--------|----------|
| Phase 1: Structured Memory | 6 issues | ~2-3 sprints |
| Phase 2: Vector Recall | 6 issues | ~2-3 sprints |
| Phase 3: Agent Memory | 5 issues | ~2-3 sprints |
| Phase 4: Edge Search | 3 issues | ~1-2 sprints |
| **Total** | **20 issues** | **~7-11 sprints** |

### Priority Order

1. **P1-1 through P1-6** (Structured Memory) — ship first, build on what exists
2. **P2-1 through P2-6** (Vector Recall) — add fuzzy search on top of structured truth
3. **P3-1 through P3-5** (Agent Memory) — make Jovie adaptive
4. **P4-1 through P4-3** (Edge Search) — performance polish when needed