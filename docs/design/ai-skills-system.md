# AI Skills System Design

> **Status:** Draft
> **Author:** AI-assisted design
> **Date:** 2026-02-09
> **Scope:** Architecture for Jovie's AI chat skill system

---

## 1. Problem Statement

Jovie's AI chat currently has a single hardcoded tool (`proposeProfileEdit`) in `apps/web/app/api/chat/route.ts`. As we add music career skills (video ad generation, voice cloning, release collaboration, pitch outreach, etc.), we need a formal architecture that:

- Keeps skills organized, testable, and independently deployable
- Handles long-running async jobs (video generation, voice cloning)
- Supports human-in-the-loop confirmation for destructive/costly actions
- Scales to 50+ skills without blowing up the LLM's context window
- Ties generated assets back to songs/releases in the database

---

## 2. Industry Research Summary

### How AI SDK handles tools today

Vercel AI SDK v6 (our current version) provides:

```typescript
import { tool } from 'ai';
import { z } from 'zod';

const myTool = tool({
  description: 'What the LLM reads to decide when to use this',
  inputSchema: z.object({ /* Zod schema */ }),
  execute: async (args, { toolCallId, messages }) => { /* run it */ },
});

// Pass as a named map to streamText
streamText({
  model,
  tools: { myTool, anotherTool },
  // stopWhen: stepCountIs(5), // multi-step agentic loops
  // prepareStep: (step) => { ... }, // dynamic tool loading per step
});
```

Key capabilities we should leverage:
- **`prepareStep`** — dynamically swap available tools per conversation step (progressive disclosure)
- **`AsyncIterable` in execute** — yield streaming progress for long-running jobs
- **`outputSchema`** — typed, validated tool outputs
- **Tool execution approval** — built-in human-in-the-loop (SDK v6)

### How Anthropic handles large tool sets

Anthropic's **Tool Search Tool** allows up to 10,000 tools by deferring tool definitions until the model needs them. Tools marked `defer_loading: true` are discovered via regex/BM25 search, reducing token usage by ~85%. We should adopt this *conceptually* — not loading all 50 skills into every prompt.

### Common patterns across the industry

| Pattern | What it solves | Our fit |
|---------|---------------|---------|
| **Skill Registry** | Central catalog with metadata, lazy loading | Yes — core of our design |
| **Domain Namespacing** | `marketing.video.generate`, `pitch.playlist.submit` | Yes — keeps skills discoverable |
| **Tiered Loading** | Always-on vs. on-demand skills | Yes — most skills are on-demand |
| **Async Job Pattern** | Long-running external API calls (Sora, ElevenLabs) | Yes — critical for video/audio |
| **Composition Pipelines** | Chain skills together (script → voice → video) | Yes — TV ad generation is a pipeline |
| **MCP Servers** | Separate tool servers per domain | Maybe later — overkill for now |

---

## 3. Proposed Architecture

### 3.1 Directory Structure

```
apps/web/
├── lib/
│   └── ai/
│       ├── skills/
│       │   ├── registry.ts              # Skill registry + loader
│       │   ├── types.ts                 # Shared types
│       │   ├── context.ts               # SkillContext (user, profile, db access)
│       │   ├── middleware.ts             # Audit logging, cost tracking, rate limiting
│       │   │
│       │   ├── profile/                 # Category: Profile Management
│       │   │   ├── propose-edit.ts      # Existing proposeProfileEdit (migrated)
│       │   │   └── bio-rewrite.ts       # Rewrite bio for DSPs
│       │   │
│       │   ├── marketing/               # Category: Marketing & Ads
│       │   │   ├── tv-ad-generator.ts   # Generate TV/streaming ads with Sora
│       │   │   ├── social-ad-generator.ts
│       │   │   ├── billboard-generator.ts
│       │   │   └── qr-code-overlay.ts
│       │   │
│       │   ├── promotion/               # Category: Promo & Outreach
│       │   │   ├── voice-promo.ts       # Clone voice for radio station drops
│       │   │   ├── playlist-pitch.ts    # Pitch to playlists
│       │   │   ├── press-pitch.ts       # Pitch to blogs/press
│       │   │   ├── radio-pitch.ts       # College radio outreach
│       │   │   └── sync-pitch.ts        # Music supervisor pitching
│       │   │
│       │   ├── collaboration/           # Category: Team & Partners
│       │   │   ├── release-team.ts      # Loop in partners on a release
│       │   │   └── asset-sharing.ts     # Share marketing assets
│       │   │
│       │   └── content/                 # Category: Content & Assets
│       │       ├── press-release.ts     # Generate/update press releases
│       │       └── epk-generator.ts     # Electronic press kit
│       │
│       └── system-prompt.ts             # System prompt builder (extracted)
```

### 3.2 Core Types

```typescript
// lib/ai/skills/types.ts

import type { Tool } from 'ai';

/**
 * Skill categories for organization and progressive loading.
 */
export type SkillCategory =
  | 'profile'
  | 'marketing'
  | 'promotion'
  | 'collaboration'
  | 'content';

/**
 * How expensive/risky is this skill to execute?
 */
export type SkillTier =
  | 'free'       // No external API cost (profile edits, text generation)
  | 'standard'   // Low cost (email sending, text API calls)
  | 'premium'    // High cost (video generation, voice cloning)
  | 'dangerous'; // Publishes externally (social posts, DSP submissions)

/**
 * Metadata that lives alongside the AI SDK tool definition.
 */
export interface SkillDefinition {
  /** Unique identifier: 'marketing.tv-ad-generator' */
  id: string;

  /** Human-readable name for UI display */
  name: string;

  /** Category for grouping */
  category: SkillCategory;

  /** Cost/risk tier — determines confirmation requirements */
  tier: SkillTier;

  /** Whether this skill is always loaded or discovered on-demand */
  loading: 'eager' | 'lazy';

  /** Feature flag gate (Statsig) — null means always available */
  featureFlag: string | null;

  /** Subscription tier required — null means free tier */
  requiredPlan: 'free' | 'pro' | 'enterprise' | null;

  /** Keywords for skill discovery when using lazy loading */
  keywords: string[];

  /** The actual AI SDK tool — created at request time with context */
  createTool: (ctx: SkillContext) => Tool;
}
```

### 3.3 Skill Context

Every skill receives a context object with everything it needs — no global imports, no reaching into the request.

```typescript
// lib/ai/skills/context.ts

export interface SkillContext {
  /** Authenticated user ID (Clerk) */
  userId: string;

  /** Creator profile ID */
  profileId: string;

  /** Artist context data (fetched once, shared across skills) */
  artist: ArtistContext;

  /** Database access */
  db: typeof db;

  /** Abort signal from the request */
  signal: AbortSignal;

  /**
   * Store a generated asset and link it to a release.
   * Returns the asset URL and DB record ID.
   */
  storeAsset: (params: {
    releaseId?: string;
    type: 'video' | 'audio' | 'image' | 'document';
    fileName: string;
    data: Buffer | ReadableStream;
    metadata?: Record<string, unknown>;
  }) => Promise<{ url: string; assetId: string }>;
}
```

### 3.4 Skill Registry

```typescript
// lib/ai/skills/registry.ts

import type { Tool } from 'ai';
import type { SkillDefinition, SkillContext } from './types';

const skills = new Map<string, SkillDefinition>();

/**
 * Register a skill. Called at module level in each skill file.
 */
export function registerSkill(skill: SkillDefinition): void {
  if (skills.has(skill.id)) {
    throw new Error(`Duplicate skill ID: ${skill.id}`);
  }
  skills.set(skill.id, skill);
}

/**
 * Resolve skills for a request. Handles:
 * - Eager vs lazy loading
 * - Feature flag checks
 * - Plan tier gating
 */
export async function resolveSkills(
  ctx: SkillContext,
  opts?: { categories?: SkillCategory[]; query?: string }
): Promise<Record<string, Tool>> {
  const tools: Record<string, Tool> = {};

  for (const [id, skill] of skills) {
    // Always include eager skills
    if (skill.loading === 'eager') {
      tools[id] = skill.createTool(ctx);
      continue;
    }

    // For lazy skills, only include if category or query matches
    if (opts?.categories?.includes(skill.category)) {
      tools[id] = skill.createTool(ctx);
      continue;
    }

    if (opts?.query) {
      const q = opts.query.toLowerCase();
      const matches = skill.keywords.some(kw => q.includes(kw));
      if (matches) {
        tools[id] = skill.createTool(ctx);
      }
    }
  }

  return tools;
}

/**
 * Get all registered skills (for admin/debug UI).
 */
export function getAllSkills(): SkillDefinition[] {
  return Array.from(skills.values());
}
```

### 3.5 Example Skill Implementation

Here's what the existing `proposeProfileEdit` looks like migrated into the skill system:

```typescript
// lib/ai/skills/profile/propose-edit.ts

import { tool } from 'ai';
import { z } from 'zod';
import { registerSkill } from '../registry';
import type { SkillContext } from '../types';

const FIELD_DESCRIPTIONS = {
  displayName: 'Display name shown on your profile',
  bio: 'Artist bio/description',
  genres: 'Music genres (comma-separated)',
} as const;

registerSkill({
  id: 'profile.propose-edit',
  name: 'Propose Profile Edit',
  category: 'profile',
  tier: 'free',
  loading: 'eager',  // Always available — core feature
  featureFlag: null,
  requiredPlan: null,
  keywords: ['edit', 'update', 'change', 'bio', 'name', 'genre'],

  createTool: (ctx: SkillContext) =>
    tool({
      description:
        'Propose a profile edit for the artist. Returns a preview that ' +
        'the user must confirm. Use when the artist asks to update their ' +
        'display name, bio, or genres.',
      inputSchema: z.object({
        field: z.enum(['displayName', 'bio', 'genres']),
        newValue: z.union([z.string(), z.array(z.string())]),
        reason: z.string().optional(),
      }),
      execute: async ({ field, newValue, reason }) => {
        const isGenres = field === 'genres';
        if (isGenres && !Array.isArray(newValue)) {
          return { success: false, error: 'Genres must be an array of strings' };
        }
        if (!isGenres && typeof newValue !== 'string') {
          return { success: false, error: `${field} must be a string` };
        }

        return {
          success: true,
          preview: {
            field,
            fieldLabel: FIELD_DESCRIPTIONS[field],
            currentValue: ctx.artist[field],
            newValue,
            reason,
          },
        };
      },
    }),
});
```

And here's a new skill — the TV Ad Generator:

```typescript
// lib/ai/skills/marketing/tv-ad-generator.ts

import { tool } from 'ai';
import { z } from 'zod';
import { registerSkill } from '../registry';
import type { SkillContext } from '../types';

registerSkill({
  id: 'marketing.tv-ad-generator',
  name: 'TV Ad Generator',
  category: 'marketing',
  tier: 'premium',
  loading: 'lazy',
  featureFlag: 'ai_video_ads',
  requiredPlan: 'pro',
  keywords: ['tv', 'ad', 'commercial', 'video', 'hulu', 'youtube', 'advertisement', 'sora'],

  createTool: (ctx: SkillContext) =>
    tool({
      description:
        'Generate TV/streaming ad videos for a song release. Creates 3-5 A/B test ' +
        'variants using animated album art or video backgrounds with the song playing, ' +
        'plus a Jovie QR code overlay. Output files are ready for Hulu Ad Manager, ' +
        'YouTube Ads, or other platforms. Assets are stored and linked to the release.',
      inputSchema: z.object({
        releaseId: z.string().describe('The release/song to promote'),
        style: z.enum(['animated-artwork', 'video-background', 'lyric-video'])
          .describe('Visual style for the ad'),
        duration: z.enum(['15s', '30s', '60s'])
          .describe('Ad duration — 15s for social, 30s for TV, 60s for YouTube'),
        variants: z.number().min(1).max(5).default(3)
          .describe('Number of A/B test variants to generate'),
        targetPlatforms: z.array(
          z.enum(['hulu', 'youtube', 'instagram', 'tiktok', 'facebook'])
        ).describe('Platforms to format the ads for (affects aspect ratio & specs)'),
        mood: z.string().optional()
          .describe('Optional mood/vibe direction for the visuals'),
      }),
      outputSchema: z.object({
        success: z.boolean(),
        variants: z.array(z.object({
          id: z.string(),
          previewUrl: z.string(),
          downloadUrl: z.string(),
          platform: z.string(),
          specs: z.object({
            width: z.number(),
            height: z.number(),
            duration: z.string(),
            format: z.string(),
          }),
        })),
        assetGroupId: z.string().describe('ID to find all assets on the releases page'),
      }),

      async *execute({ releaseId, style, duration, variants, targetPlatforms, mood }) {
        // Phase 1: Validate release exists and belongs to artist
        yield { status: 'validating', message: 'Checking release details...' };

        // Phase 2: Generate video prompts for each variant
        yield { status: 'scripting', message: `Creating ${variants} ad concepts...` };

        // Phase 3: Submit to Sora API (parallel for each variant)
        yield {
          status: 'generating',
          message: `Generating ${variants} video variants — this takes 1-2 minutes...`,
        };

        // Phase 4: Poll for completion
        // Phase 5: Add QR code overlay + song audio
        // Phase 6: Format for each target platform (aspect ratios, codecs)
        // Phase 7: Store assets linked to the release

        yield {
          status: 'complete',
          message: `Generated ${variants} ad variants for ${targetPlatforms.length} platforms.`,
          variants: [], // actual variant data
          assetGroupId: 'ag_xxx',
        };
      },
    }),
});
```

### 3.6 Updated Chat Route

The chat route becomes thin — it delegates to the registry:

```typescript
// Simplified apps/web/app/api/chat/route.ts (relevant section)

import { resolveSkills, buildSkillContext } from '@/lib/ai/skills';

// ... auth, rate limiting, validation unchanged ...

const ctx = await buildSkillContext({ userId, profileId, signal: req.signal });
const tools = await resolveSkills(ctx, {
  query: extractLatestUserMessage(validatedMessages),
});

const result = streamText({
  model: gateway('anthropic:claude-sonnet-4-20250514'),
  system: buildSystemPrompt(ctx.artist, tools),
  messages: validatedMessages,
  tools,
  abortSignal: req.signal,
  onError: ({ error }) => { /* sentry */ },
});
```

### 3.7 System Prompt Updates

The system prompt dynamically lists available skills so the LLM knows what it can do:

```typescript
function buildSystemPrompt(artist: ArtistContext, tools: Record<string, Tool>): string {
  const skillList = Object.keys(tools)
    .map(id => `- ${id}`)
    .join('\n');

  return `${existingPrompt}

## Available Skills
You have access to the following tools. Use them when relevant:
${skillList}
`;
}
```

---

## 4. Music Career Skill Taxonomy

### Tier 1: Core (Always Loaded)

| Skill ID | Description | External APIs | Cost Tier |
|----------|-------------|---------------|-----------|
| `profile.propose-edit` | Edit display name, bio, genres | None | free |
| `profile.bio-rewrite` | AI-rewrite bio for DSPs, press kits | None (LLM only) | free |

### Tier 2: Marketing & Ads (Lazy, Pro Plan)

| Skill ID | Description | External APIs | Cost Tier |
|----------|-------------|---------------|-----------|
| `marketing.tv-ad-generator` | Generate TV/streaming ad videos (3-5 A/B variants) with song, album art/video bg, QR code | Sora 2, FFmpeg | premium |
| `marketing.social-ad-generator` | Generate social media ad creatives (IG Stories, TikTok, FB) | Sora 2 | premium |
| `marketing.billboard-generator` | Generate billboard/OOH ad creatives | Image generation API | standard |
| `marketing.asset-manager` | View, download, share all marketing assets for a release | None | free |

### Tier 3: Promotion & Outreach (Lazy, Pro Plan)

| Skill ID | Description | External APIs | Cost Tier |
|----------|-------------|---------------|-----------|
| `promotion.voice-promo` | Clone artist voice → generate radio station drops for every DJ on promo list | ElevenLabs | premium |
| `promotion.playlist-pitch` | Draft and submit playlist pitches | Email/Resend | standard |
| `promotion.press-pitch` | Pitch to blogs, press outlets, journalists | Email/Resend | standard |
| `promotion.sync-pitch` | Pitch to music supervisors for TV/film/games | Email/Resend | standard |
| `promotion.radio-pitch` | Pitch to college radio, community stations | Email/Resend | standard |
| `promotion.instore-pitch` | Pitch to in-store music providers (Mood Media, etc.) | Email/Resend | standard |

### Tier 4: Collaboration (Lazy, Free+)

| Skill ID | Description | External APIs | Cost Tier |
|----------|-------------|---------------|-----------|
| `collaboration.release-team` | Add partners (distributor, publisher, cowriters, engineer, manager, etc.) to a release | Email/Resend | standard |
| `collaboration.milestone-notify` | Notify team when release hits milestones (streaming #s, chart position, social metrics) | Email/Resend, webhooks | standard |
| `collaboration.asset-share` | Share smart link + marketing assets with the team | Email/Resend | free |

### Tier 5: Content & Bio (Lazy, Free+)

| Skill ID | Description | External APIs | Cost Tier |
|----------|-------------|---------------|-----------|
| `content.press-release` | Generate/update press releases with new song info auto-included | None (LLM) | free |
| `content.epk-generator` | Generate electronic press kit (bio, photos, press, stats) | None | free |
| `content.dsp-bio-sync` | Rewrite bio and push to DSPs (Spotify for Artists, Apple Music, etc.) | DSP APIs | standard |

---

## 5. Skill Loading Strategy

Not all 20+ skills should be in every prompt. Here's the strategy:

```
Request comes in
  │
  ├─ Always load: profile.propose-edit, profile.bio-rewrite (2 tools)
  │
  ├─ Keyword match on latest user message:
  │   "make me a tv ad" → load marketing.*
  │   "pitch to playlists" → load promotion.playlist-pitch
  │   "clone my voice" → load promotion.voice-promo
  │   "add my producer" → load collaboration.release-team
  │
  └─ If no keyword match: only eager tools are available.
      The LLM can suggest skills it knows about via the system prompt
      ("I can help you generate video ads — want me to do that?")
```

**Token budget math:**
- 2 eager tools ≈ 800 tokens
- Each lazy tool ≈ 400 tokens
- Loading 5 lazy tools on-demand ≈ 2,000 tokens
- Total worst case: ~2,800 tokens (vs. 8,000+ if all were eager)

---

## 6. Asset Pipeline & Database Integration

### New Database Tables Needed

```sql
-- Generated assets linked to releases
CREATE TABLE release_assets (
  id            TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
  release_id    TEXT REFERENCES discog_releases(id),
  profile_id    TEXT NOT NULL REFERENCES creator_profiles(id),
  skill_id      TEXT NOT NULL,           -- 'marketing.tv-ad-generator'
  type          TEXT NOT NULL,           -- 'video' | 'audio' | 'image' | 'document'
  file_name     TEXT NOT NULL,
  url           TEXT NOT NULL,
  file_size     INTEGER,
  metadata      JSONB DEFAULT '{}',      -- platform specs, variant info, etc.
  asset_group   TEXT,                    -- groups A/B variants together
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- Release team members (collaborators)
CREATE TABLE release_collaborators (
  id            TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
  release_id    TEXT NOT NULL REFERENCES discog_releases(id),
  profile_id    TEXT NOT NULL REFERENCES creator_profiles(id),
  name          TEXT NOT NULL,
  email         TEXT NOT NULL,
  role          TEXT NOT NULL,           -- 'distributor', 'publisher', 'cowriter', etc.
  permissions   TEXT[] DEFAULT '{}',     -- 'view_assets', 'view_analytics', etc.
  invited_at    TIMESTAMPTZ DEFAULT NOW(),
  accepted_at   TIMESTAMPTZ,
  smart_link_sent BOOLEAN DEFAULT FALSE
);

-- Skill execution audit log (extends existing chat_audit_log)
CREATE TABLE skill_executions (
  id            TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       TEXT NOT NULL,
  profile_id    TEXT NOT NULL REFERENCES creator_profiles(id),
  skill_id      TEXT NOT NULL,
  conversation_id TEXT REFERENCES chat_conversations(id),
  input         JSONB NOT NULL,
  output        JSONB,
  status        TEXT NOT NULL DEFAULT 'pending', -- pending, running, completed, failed
  cost_cents    INTEGER DEFAULT 0,               -- API cost tracking
  duration_ms   INTEGER,
  error         TEXT,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  completed_at  TIMESTAMPTZ
);
```

### Asset flow

```
Skill executes
  → Generates file (video/audio/image)
  → Uploads to storage (Vercel Blob / S3)
  → Creates release_assets record linked to the release
  → Returns URL to the chat UI

User visits /app/releases/[id]
  → "Marketing Assets" tab shows all generated assets
  → Download, share with team, or re-generate
```

---

## 7. Confirmation & Safety Model

Skills are gated by tier:

| Tier | Behavior | Examples |
|------|----------|---------|
| `free` | Execute immediately, no confirmation | Bio rewrite, press release draft |
| `standard` | Show preview, require "Confirm" click | Send pitch email, notify team |
| `premium` | Show preview + cost estimate, require confirmation | Generate video ($0.50/video), clone voice |
| `dangerous` | Show preview + cost + warning, double confirmation | Submit bio to DSPs, post to social media |

This maps directly to the existing confirmation pattern (`proposeProfileEdit` → confirm-edit endpoint). Each tier just adds more friction.

---

## 8. Implementation Phases

### Phase 1: Foundation (Week 1-2)
- [ ] Create `lib/ai/skills/` directory structure
- [ ] Implement `types.ts`, `context.ts`, `registry.ts`
- [ ] Migrate `proposeProfileEdit` into the skill system
- [ ] Update chat route to use registry
- [ ] Add `skill_executions` table for audit logging
- [ ] Verify no regressions in existing chat

### Phase 2: Content Skills (Week 3-4)
- [ ] `profile.bio-rewrite` — LLM-only, no external APIs
- [ ] `content.press-release` — LLM-only
- [ ] `content.epk-generator` — LLM-only
- [ ] These prove the pattern without external API complexity

### Phase 3: Collaboration (Week 5-6)
- [ ] `release_collaborators` table + migration
- [ ] `collaboration.release-team` — invite partners via Resend
- [ ] `collaboration.asset-share` — share smart link + assets
- [ ] `collaboration.milestone-notify` — webhook/email on milestones

### Phase 4: Marketing & Ads (Week 7-10)
- [ ] `release_assets` table + migration
- [ ] Asset upload pipeline (Vercel Blob or S3)
- [ ] `marketing.tv-ad-generator` — Sora 2 API integration
- [ ] `marketing.social-ad-generator` — format variants for social
- [ ] QR code overlay system
- [ ] Releases page "Marketing Assets" tab

### Phase 5: Promotion & Voice (Week 11-14)
- [ ] `promotion.voice-promo` — ElevenLabs voice cloning integration
- [ ] `promotion.playlist-pitch` — pitch drafting + sending
- [ ] `promotion.press-pitch`
- [ ] `promotion.sync-pitch`
- [ ] `promotion.radio-pitch`
- [ ] Promo list management (contacts tied to stations/playlists)

---

## 9. Key Design Decisions

### Why not MCP servers?

MCP (Model Context Protocol) is great for multi-agent setups with separate tool servers. But for Jovie:
- We're a single Next.js app, not a distributed system
- Our tools need direct DB access and auth context
- MCP adds operational complexity (separate servers, protocol overhead)
- **Decision:** Use AI SDK's native `tool()` with our own registry. Revisit MCP when/if we need cross-app tool sharing.

### Why keyword matching instead of embedding search?

For <50 skills, keyword matching is fast, deterministic, and debuggable. Embedding-based search adds latency (vector DB call), non-determinism, and infrastructure. We can switch to Anthropic's Tool Search Tool pattern or embeddings if we exceed 100 skills.

### Why `createTool(ctx)` instead of static tool definitions?

Skills need request-scoped context (user ID, profile data, abort signal). A factory function lets each skill access its context without globals or middleware hacks. This matches the pattern the AI SDK expects — tools are created per-request.

### Why streaming `execute` for long-running skills?

Video generation takes 1-2 minutes. Without streaming, the user sees nothing. The `AsyncIterable` pattern lets us yield progress updates ("Generating variant 2 of 5...") that the chat UI can render as loading states. This is built into AI SDK v6.

---

## 10. Open Questions

1. **Storage provider** — Vercel Blob (simpler, Vercel-native) vs. S3 (more control, cheaper at scale)?
2. **Cost tracking** — Do we charge per-skill-execution or bundle into the subscription plan?
3. **Promo list data model** — Where do we store the artist's list of radio stations, playlist curators, press contacts? New table or extend existing contacts?
4. **Voice cloning consent** — ElevenLabs requires explicit consent for voice cloning. What's the UX for this?
5. **DSP API access** — Spotify for Artists, Apple Music for Artists APIs are gated. Do we have access or need to apply?
6. **Rate limiting per skill** — Global chat rate limit vs. per-skill limits (e.g., max 10 video generations per day)?
