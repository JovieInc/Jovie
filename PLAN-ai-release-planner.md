# AI Release Planner - Comprehensive Feature Plan

> **Epic**: AI-powered release planning, scheduling, and task management for artists
> **Branch**: `claude/ai-release-planner-pKvE3`
> **Status**: Planning Phase

---

## Executive Summary

The AI Release Planner transforms Jovie from a link-in-bio tool into a comprehensive release management platform. It provides:

1. **Smart Release Date Suggestions** - AI analyzes discography patterns, market timing, and distribution requirements
2. **Release Checklist System** - Pre-built templates with deadline tracking for every release milestone
3. **Annual Release Calendar** - Visual planning tool for the entire year
4. **Task Assignment Engine** - Foundation for AI agent automation

---

## Table of Contents

1. [Problem Statement](#problem-statement)
2. [User Stories](#user-stories)
3. [System Architecture](#system-architecture)
4. [Database Schema](#database-schema)
5. [AI Release Date Suggestion](#ai-release-date-suggestion)
6. [Release Checklist System](#release-checklist-system)
7. [Release Calendar](#release-calendar)
8. [Task Assignment & Automation](#task-assignment--automation)
9. [Implementation Phases](#implementation-phases)
10. [API Design](#api-design)
11. [UI/UX Specifications](#uiux-specifications)

---

## Problem Statement

Artists struggle with:
- **Release timing** - No data-driven approach to choosing release dates
- **Deadline management** - Missing critical milestones (artwork, mastering, submission)
- **Distribution lead times** - Unaware of 6-week+ requirements for streaming platforms
- **Annual planning** - No visibility into how releases fit together across the year
- **Task tracking** - Manual tracking of dozens of pre-release tasks

---

## User Stories

### Release Date Suggestion
```
As an artist, I want Jovie AI to suggest optimal release dates
So that I can maximize my release's visibility and avoid conflicts
```

### Release Checklist
```
As an artist, I want a checklist of all pre-release tasks with deadlines
So that I never miss critical milestones like artwork submission or mastering
```

### Annual Calendar
```
As an artist, I want to see all my planned releases on a yearly calendar
So that I can space them strategically and plan my entire year
```

### Task Assignment
```
As an artist, I want to assign tasks to team members (or AI agents)
So that I can delegate work and track progress
```

---

## System Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           AI Release Planner                                 │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────────────┐   ┌─────────────────┐   ┌─────────────────────────┐   │
│  │  Jovie AI Chat  │   │  Release        │   │  Calendar View          │   │
│  │  ─────────────  │   │  Checklist UI   │   │  ─────────────────────  │   │
│  │  • Date suggest │   │  ─────────────  │   │  • Year overview        │   │
│  │  • Planning Q&A │   │  • Task cards   │   │  • Release timeline     │   │
│  │  • Deadline     │   │  • Deadlines    │   │  • Drag-drop planning   │   │
│  │    reminders    │   │  • Assignments  │   │  • Conflict detection   │   │
│  └────────┬────────┘   └────────┬────────┘   └───────────┬─────────────┘   │
│           │                     │                        │                  │
│           └─────────────────────┼────────────────────────┘                  │
│                                 │                                           │
│  ┌──────────────────────────────▼──────────────────────────────────────┐   │
│  │                    Release Planning Engine                           │   │
│  │  ────────────────────────────────────────────────────────────────   │   │
│  │  • Discography analyzer     • Deadline calculator                   │   │
│  │  • Pattern detector         • Task template engine                  │   │
│  │  • Market timing optimizer  • Assignment router                     │   │
│  │  • Distribution scheduler   • Notification scheduler                │   │
│  └──────────────────────────────┬──────────────────────────────────────┘   │
│                                 │                                           │
│  ┌──────────────────────────────▼──────────────────────────────────────┐   │
│  │                         Data Layer                                   │   │
│  │  ────────────────────────────────────────────────────────────────   │   │
│  │  • release_plans            • release_checklist_items               │   │
│  │  • checklist_templates      • task_assignments                      │   │
│  │  • discogReleases (exist)   • calendar_events                       │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Database Schema

### New Tables

```sql
-- =============================================================================
-- RELEASE PLANNING CORE
-- =============================================================================

-- Release plans (a planned release that may not exist in discography yet)
CREATE TABLE release_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id UUID NOT NULL REFERENCES creators(id) ON DELETE CASCADE,

  -- Link to existing release (nullable - may not exist yet)
  discog_release_id UUID REFERENCES discog_releases(id) ON DELETE SET NULL,

  -- Release metadata (may differ from final release)
  working_title TEXT NOT NULL,
  release_type release_type NOT NULL DEFAULT 'single',
  target_release_date DATE NOT NULL,

  -- AI-suggested vs manual
  date_source TEXT NOT NULL CHECK (date_source IN ('ai_suggested', 'manual', 'distributor_confirmed')),
  ai_suggestion_reasoning JSONB, -- Store AI's reasoning for the date

  -- Distribution info
  distributor TEXT, -- DistroKid, TuneCore, CD Baby, etc.
  distribution_lead_days INTEGER NOT NULL DEFAULT 42, -- 6 weeks default
  submission_deadline DATE GENERATED ALWAYS AS (target_release_date - distribution_lead_days) STORED,

  -- Status tracking
  status TEXT NOT NULL DEFAULT 'planning' CHECK (status IN (
    'ideation',      -- Just an idea
    'planning',      -- Actively planning
    'in_production', -- Being created
    'submitted',     -- Sent to distributor
    'scheduled',     -- Confirmed by distributor
    'released',      -- Out now
    'cancelled'      -- Abandoned
  )),

  -- Metadata
  notes TEXT,
  metadata JSONB DEFAULT '{}',

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (creator_id, working_title, target_release_date)
);

CREATE INDEX idx_release_plans_creator ON release_plans(creator_id);
CREATE INDEX idx_release_plans_date ON release_plans(target_release_date);
CREATE INDEX idx_release_plans_status ON release_plans(status);

-- =============================================================================
-- CHECKLIST TEMPLATES
-- =============================================================================

-- Pre-built checklist templates (system + custom)
CREATE TABLE checklist_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- NULL creator_id = system template
  creator_id UUID REFERENCES creators(id) ON DELETE CASCADE,

  name TEXT NOT NULL,
  description TEXT,
  release_type release_type, -- NULL = applies to all types

  -- Template is active
  is_active BOOLEAN NOT NULL DEFAULT true,
  is_system BOOLEAN NOT NULL DEFAULT false,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Template items (the tasks that make up a template)
CREATE TABLE checklist_template_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id UUID NOT NULL REFERENCES checklist_templates(id) ON DELETE CASCADE,

  -- Task definition
  title TEXT NOT NULL,
  description TEXT,
  category TEXT NOT NULL CHECK (category IN (
    'creative',      -- Album art, music video, photos
    'production',    -- Mixing, mastering, stems
    'metadata',      -- ISRC, UPC, credits, lyrics
    'distribution',  -- Upload, submission, QC
    'marketing',     -- Press kit, social assets, ads
    'promotion',     -- Playlist pitching, PR, influencers
    'legal',         -- Contracts, splits, licensing
    'post_release'   -- Analytics review, feedback
  )),

  -- Deadline relative to release date (negative = before release)
  days_before_release INTEGER NOT NULL, -- e.g., -42 for 6 weeks before

  -- Priority and dependencies
  priority INTEGER NOT NULL DEFAULT 50 CHECK (priority BETWEEN 1 AND 100),
  depends_on UUID REFERENCES checklist_template_items(id),

  -- Ordering
  sort_order INTEGER NOT NULL DEFAULT 0,

  -- Automation flags (for future AI agents)
  is_automatable BOOLEAN NOT NULL DEFAULT false,
  automation_type TEXT, -- 'ai_agent', 'webhook', 'zapier', etc.
  automation_config JSONB,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_template_items_template ON checklist_template_items(template_id);

-- =============================================================================
-- RELEASE CHECKLIST INSTANCES
-- =============================================================================

-- Actual checklist items for a specific release plan
CREATE TABLE release_checklist_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  release_plan_id UUID NOT NULL REFERENCES release_plans(id) ON DELETE CASCADE,

  -- Template origin (nullable if custom task)
  template_item_id UUID REFERENCES checklist_template_items(id) ON DELETE SET NULL,

  -- Task details (copied from template, can be customized)
  title TEXT NOT NULL,
  description TEXT,
  category TEXT NOT NULL,

  -- Deadline (absolute date, calculated from release date)
  deadline DATE NOT NULL,

  -- Status
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN (
    'pending',
    'in_progress',
    'blocked',
    'completed',
    'skipped'
  )),
  completed_at TIMESTAMPTZ,
  completed_by UUID REFERENCES users(id),

  -- Assignment
  assigned_to UUID REFERENCES users(id),
  assigned_to_agent TEXT, -- For AI agent assignment: 'artwork_generator', 'social_scheduler', etc.

  -- Priority (1-100, higher = more important)
  priority INTEGER NOT NULL DEFAULT 50,

  -- Dependencies
  depends_on UUID REFERENCES release_checklist_items(id),
  is_blocked BOOLEAN NOT NULL DEFAULT false,
  blocked_reason TEXT,

  -- Notes and attachments
  notes TEXT,
  attachments JSONB DEFAULT '[]', -- [{url, name, type}]

  -- Metadata
  metadata JSONB DEFAULT '{}',

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_checklist_items_plan ON release_checklist_items(release_plan_id);
CREATE INDEX idx_checklist_items_status ON release_checklist_items(status);
CREATE INDEX idx_checklist_items_deadline ON release_checklist_items(deadline);
CREATE INDEX idx_checklist_items_assigned ON release_checklist_items(assigned_to);

-- =============================================================================
-- TASK ASSIGNMENTS & ACTIVITY
-- =============================================================================

-- Task activity log (comments, status changes, etc.)
CREATE TABLE checklist_item_activity (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  checklist_item_id UUID NOT NULL REFERENCES release_checklist_items(id) ON DELETE CASCADE,

  -- Actor (user or system)
  actor_user_id UUID REFERENCES users(id),
  actor_type TEXT NOT NULL CHECK (actor_type IN ('user', 'system', 'ai_agent')),
  actor_agent_name TEXT, -- If AI agent

  -- Activity type
  activity_type TEXT NOT NULL CHECK (activity_type IN (
    'created',
    'status_changed',
    'assigned',
    'unassigned',
    'commented',
    'deadline_changed',
    'attachment_added',
    'attachment_removed',
    'priority_changed',
    'blocked',
    'unblocked'
  )),

  -- Activity details
  old_value JSONB,
  new_value JSONB,
  comment TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_activity_item ON checklist_item_activity(checklist_item_id);
CREATE INDEX idx_activity_created ON checklist_item_activity(created_at);

-- =============================================================================
-- RELEASE DATE SUGGESTIONS
-- =============================================================================

-- AI-generated release date suggestions
CREATE TABLE release_date_suggestions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id UUID NOT NULL REFERENCES creators(id) ON DELETE CASCADE,
  release_plan_id UUID REFERENCES release_plans(id) ON DELETE CASCADE,

  -- Suggested date
  suggested_date DATE NOT NULL,

  -- Confidence score (0-100)
  confidence_score INTEGER NOT NULL CHECK (confidence_score BETWEEN 0 AND 100),

  -- Reasoning breakdown
  reasoning JSONB NOT NULL, -- Structured reasoning
  /*
  {
    "factors": [
      {"name": "release_pattern", "score": 85, "explanation": "You typically release on Fridays..."},
      {"name": "spacing", "score": 70, "explanation": "8 weeks since last release..."},
      {"name": "seasonality", "score": 60, "explanation": "Summer releases historically perform..."},
      {"name": "competition", "score": 50, "explanation": "No major releases that week..."}
    ],
    "alternatives": [
      {"date": "2025-04-04", "score": 78, "tradeoff": "Closer to Easter weekend"},
      {"date": "2025-04-18", "score": 72, "tradeoff": "More spacing but less momentum"}
    ]
  }
  */

  -- User response
  user_response TEXT CHECK (user_response IN ('accepted', 'rejected', 'modified', 'pending')),
  user_chosen_date DATE,
  user_feedback TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_suggestions_creator ON release_date_suggestions(creator_id);
CREATE INDEX idx_suggestions_plan ON release_date_suggestions(release_plan_id);
```

### System Checklist Template Data

```sql
-- =============================================================================
-- SEED DATA: Standard Release Checklist Template
-- =============================================================================

INSERT INTO checklist_templates (id, name, description, release_type, is_system, is_active)
VALUES
  ('00000000-0000-0000-0000-000000000001', 'Standard Single Release', 'Complete checklist for releasing a single', 'single', true, true),
  ('00000000-0000-0000-0000-000000000002', 'EP Release', 'Complete checklist for EP release', 'ep', true, true),
  ('00000000-0000-0000-0000-000000000003', 'Album Release', 'Comprehensive album release checklist', 'album', true, true);

-- Single Release Template Items
INSERT INTO checklist_template_items (template_id, title, description, category, days_before_release, priority, sort_order, is_automatable) VALUES

-- CREATIVE (Album Art & Visuals)
('00000000-0000-0000-0000-000000000001', 'Finalize album artwork', 'Complete album cover design (3000x3000 minimum, no text cutoffs)', 'creative', -56, 95, 1, false),
('00000000-0000-0000-0000-000000000001', 'Create promotional photos', 'Photoshoot for press and social media', 'creative', -49, 70, 2, false),
('00000000-0000-0000-0000-000000000001', 'Design social media assets', 'Create announcement graphics, countdown templates, story templates', 'creative', -35, 80, 3, true),
('00000000-0000-0000-0000-000000000001', 'Lyric video/visualizer', 'Create visual content for YouTube/socials (optional)', 'creative', -28, 40, 4, false),

-- PRODUCTION (Audio)
('00000000-0000-0000-0000-000000000001', 'Complete final mix', 'Approve final mix from mixing engineer', 'production', -63, 100, 10, false),
('00000000-0000-0000-0000-000000000001', 'Complete mastering', 'Approve final master (check all formats: streaming, vinyl, etc.)', 'production', -56, 100, 11, false),
('00000000-0000-0000-0000-000000000001', 'Export all deliverables', 'WAV masters, stems, instrumentals, acapellas', 'production', -49, 85, 12, false),
('00000000-0000-0000-0000-000000000001', 'Quality check audio files', 'Verify no clicks, pops, or artifacts in final masters', 'production', -49, 90, 13, false),

-- METADATA
('00000000-0000-0000-0000-000000000001', 'Register with PRO', 'Register song with ASCAP/BMI/SESAC/PRS', 'metadata', -42, 85, 20, false),
('00000000-0000-0000-0000-000000000001', 'Obtain ISRC codes', 'Get ISRC codes from distributor or registry', 'metadata', -42, 90, 21, false),
('00000000-0000-0000-0000-000000000001', 'Finalize credits & splits', 'Confirm all writer/producer credits and royalty splits', 'metadata', -42, 95, 22, false),
('00000000-0000-0000-0000-000000000001', 'Write release description', 'Compose compelling description for streaming platforms', 'metadata', -35, 60, 23, true),
('00000000-0000-0000-0000-000000000001', 'Prepare lyrics', 'Clean, formatted lyrics for streaming platforms', 'metadata', -35, 70, 24, false),

-- DISTRIBUTION
('00000000-0000-0000-0000-000000000001', 'Upload to distributor', 'Submit release to DistroKid/TuneCore/CD Baby/etc.', 'distribution', -42, 100, 30, false),
('00000000-0000-0000-0000-000000000001', 'Verify distributor QC', 'Confirm distributor accepted submission without issues', 'distribution', -35, 95, 31, false),
('00000000-0000-0000-0000-000000000001', 'Set pre-save date', 'Configure pre-save/pre-add on all platforms', 'distribution', -35, 80, 32, false),
('00000000-0000-0000-0000-000000000001', 'Submit to Spotify editorial', 'Pitch to Spotify editorial playlists (7-day minimum before release)', 'distribution', -21, 75, 33, false),
('00000000-0000-0000-0000-000000000001', 'Submit to Apple Music editorial', 'Pitch to Apple Music editorial', 'distribution', -21, 75, 34, false),

-- MARKETING
('00000000-0000-0000-0000-000000000001', 'Create press release', 'Write press release/one-sheet for media outreach', 'marketing', -28, 65, 40, true),
('00000000-0000-0000-0000-000000000001', 'Update EPK/press kit', 'Ensure electronic press kit is current', 'marketing', -28, 60, 41, false),
('00000000-0000-0000-0000-000000000001', 'Plan content calendar', 'Schedule social posts leading up to and after release', 'marketing', -21, 75, 42, true),
('00000000-0000-0000-0000-000000000001', 'Prepare email announcement', 'Draft newsletter for fan mailing list', 'marketing', -14, 70, 43, true),
('00000000-0000-0000-0000-000000000001', 'Create ad creatives', 'Design ads for Meta, TikTok, YouTube, etc.', 'marketing', -14, 55, 44, true),
('00000000-0000-0000-0000-000000000001', 'Set up smart links', 'Create Jovie smart link for release', 'marketing', -7, 85, 45, true),

-- PROMOTION
('00000000-0000-0000-0000-000000000001', 'Pitch to playlist curators', 'Reach out to independent playlist curators', 'promotion', -21, 70, 50, true),
('00000000-0000-0000-0000-000000000001', 'Send to music blogs/press', 'Distribute to music journalists and blogs', 'promotion', -14, 60, 51, false),
('00000000-0000-0000-0000-000000000001', 'Coordinate influencer posts', 'Arrange with influencers/creators for release support', 'promotion', -14, 50, 52, false),
('00000000-0000-0000-0000-000000000001', 'Submit to music supervisors', 'Send to sync licensing contacts', 'promotion', -14, 45, 53, false),

-- LEGAL
('00000000-0000-0000-0000-000000000001', 'Clear samples (if any)', 'Ensure all samples are properly cleared and documented', 'legal', -56, 100, 60, false),
('00000000-0000-0000-0000-000000000001', 'Sign collaboration agreements', 'Execute contracts with featured artists/producers', 'legal', -42, 90, 61, false),

-- POST-RELEASE
('00000000-0000-0000-0000-000000000001', 'Release day social posts', 'Publish announcement across all platforms', 'post_release', 0, 95, 70, true),
('00000000-0000-0000-0000-000000000001', 'Send fan email', 'Blast newsletter to mailing list', 'post_release', 0, 90, 71, true),
('00000000-0000-0000-0000-000000000001', 'Monitor streaming numbers', 'Track first-day streams and playlist additions', 'post_release', 1, 60, 72, true),
('00000000-0000-0000-0000-000000000001', 'Engage with fan comments', 'Respond to comments and messages', 'post_release', 1, 70, 73, false),
('00000000-0000-0000-0000-000000000001', 'Analyze first-week data', 'Review streaming, social, and engagement metrics', 'post_release', 7, 65, 74, true),
('00000000-0000-0000-0000-000000000001', 'Post-mortem review', 'Document what worked and what to improve', 'post_release', 14, 50, 75, false);
```

---

## AI Release Date Suggestion

### Algorithm Design

The AI considers multiple factors when suggesting release dates:

```typescript
interface ReleaseDateSuggestionInput {
  creator: {
    id: string;
    discography: Release[];
    announcements: Announcement[];
    genre: string[];
    audienceSize: number;
  };
  plannedRelease: {
    title: string;
    type: 'single' | 'ep' | 'album';
    currentProductionStage: string;
    desiredTimeframe?: { earliest: Date; latest: Date };
  };
  constraints: {
    distributorLeadDays: number; // Default 42 (6 weeks)
    minProductionDaysRemaining: number;
  };
}

interface ReleaseDateSuggestion {
  suggestedDate: Date;
  confidenceScore: number; // 0-100
  factors: SuggestionFactor[];
  alternatives: AlternativeDate[];
  timeline: TimelineItem[]; // Working backwards from release
}

interface SuggestionFactor {
  name: string;
  weight: number;
  score: number;
  explanation: string;
}
```

### Scoring Factors

| Factor | Weight | Description |
|--------|--------|-------------|
| **Release Pattern** | 20% | Analyze artist's historical release cadence |
| **Day of Week** | 15% | Friday is industry standard (New Music Friday) |
| **Spacing** | 20% | Optimal gap from previous release |
| **Seasonality** | 15% | Historical streaming patterns by month |
| **Genre Timing** | 10% | Genre-specific optimal times |
| **Competition** | 10% | Major releases from similar artists |
| **Distribution** | 10% | Meet distributor deadlines |

### Pattern Analysis

```typescript
function analyzeDiscographyPatterns(releases: Release[]): PatternAnalysis {
  // 1. Calculate average release cadence
  const sortedReleases = releases.sort((a, b) =>
    new Date(b.releaseDate).getTime() - new Date(a.releaseDate).getTime()
  );

  const gaps: number[] = [];
  for (let i = 0; i < sortedReleases.length - 1; i++) {
    const gap = daysBetween(
      sortedReleases[i + 1].releaseDate,
      sortedReleases[i].releaseDate
    );
    gaps.push(gap);
  }

  // 2. Identify preferred release days
  const dayDistribution = releases.reduce((acc, r) => {
    const day = new Date(r.releaseDate).getDay();
    acc[day] = (acc[day] || 0) + 1;
    return acc;
  }, {} as Record<number, number>);

  // 3. Identify seasonal patterns
  const monthDistribution = releases.reduce((acc, r) => {
    const month = new Date(r.releaseDate).getMonth();
    acc[month] = (acc[month] || 0) + 1;
    return acc;
  }, {} as Record<number, number>);

  return {
    averageGapDays: average(gaps),
    medianGapDays: median(gaps),
    preferredDayOfWeek: maxKey(dayDistribution),
    preferredMonths: topN(monthDistribution, 3),
    lastReleaseDate: sortedReleases[0]?.releaseDate,
    totalReleases: releases.length,
  };
}
```

### AI System Prompt Enhancement

```typescript
const releasePlannerSystemPrompt = `
You are Jovie, a music career assistant with expertise in release strategy.

When suggesting release dates, consider:

1. **Distribution Timeline (CRITICAL)**
   - Major distributors need 4-6 weeks minimum
   - Spotify editorial pitching needs 7+ days before release
   - Physical distribution needs 8-12 weeks

2. **Industry Standards**
   - New Music Friday (releases drop Friday at midnight local time)
   - Avoid major holidays (Christmas, Thanksgiving week)
   - Q1 (Jan-Mar) is historically slower for streaming

3. **Artist-Specific Patterns**
   - Analyze their past release cadence
   - Consider their audience time zones
   - Factor in their promotional capacity

4. **Strategic Spacing**
   - Singles: 6-8 weeks apart for sustained momentum
   - Album singles: 3-4 weeks apart leading to album
   - Post-album: 3-6 months before next project

5. **Competition Awareness**
   - Check for major releases from similar artists
   - Avoid stacking against label mates
   - Consider genre-specific busy periods

Always provide:
- A specific recommended date with confidence score
- 2-3 alternative dates with tradeoffs
- A complete timeline working backwards from release
- Specific deadline dates for each milestone
`;
```

### Sample AI Interaction

```
User: I just finished a new single and want to release it. When should I drop it?

Jovie AI: Based on your discography and current timing, here's my recommendation:

📅 **Suggested Release Date: March 21, 2025** (Friday)
Confidence: 87%

**Why this date works:**
• Your last release was January 10th - 10 weeks is optimal spacing for sustained momentum
• March 21st avoids spring break (March 14-16) when engagement dips
• It's 8 weeks away, giving comfortable time for distribution and promotion
• You historically release on Fridays and have seen 23% higher first-week streams

**Key Deadlines:**
| Milestone | Deadline | Days Out |
|-----------|----------|----------|
| Final master | Feb 7 | 42 days |
| Artwork complete | Feb 7 | 42 days |
| Submit to distributor | Feb 7 | 42 days |
| Spotify editorial pitch | Feb 21 | 28 days |
| Pre-save live | Feb 28 | 21 days |
| Press outreach | Mar 7 | 14 days |
| Social announcement | Mar 14 | 7 days |

**Alternatives:**
• March 14 (85%): Earlier, but overlaps spring break
• March 28 (82%): More buffer, but delays momentum
• April 4 (78%): Very safe, but long gap since last release

Would you like me to create a full release checklist with these deadlines?
```

---

## Release Checklist System

### UI Components

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ Release Checklist: "Summer Nights" (Single)                                 │
│ Target: March 21, 2025  •  Status: In Production  •  32% Complete           │
├─────────────────────────────────────────────────────────────────────────────┤
│ [Filter: All ▾] [Category: All ▾] [Assigned: All ▾]        [+ Add Task]    │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│ ⚠️ OVERDUE (2)                                                              │
│ ┌─────────────────────────────────────────────────────────────────────────┐│
│ │ ☐ Complete final mix                               🔴 Feb 5 (2 days ago) ││
│ │   Production • Assigned: @producer • Priority: Critical                 ││
│ └─────────────────────────────────────────────────────────────────────────┘│
│ ┌─────────────────────────────────────────────────────────────────────────┐│
│ │ ☐ Finalize album artwork                           🔴 Feb 5 (2 days ago) ││
│ │   Creative • Assigned: @designer • Priority: Critical                   ││
│ └─────────────────────────────────────────────────────────────────────────┘│
│                                                                             │
│ 📅 THIS WEEK (4)                                                            │
│ ┌─────────────────────────────────────────────────────────────────────────┐│
│ │ ☐ Complete mastering                               🟡 Feb 12            ││
│ │   Production • Unassigned • Priority: Critical                          ││
│ │   ⚠️ Blocked by: Complete final mix                                     ││
│ └─────────────────────────────────────────────────────────────────────────┘│
│ ┌─────────────────────────────────────────────────────────────────────────┐│
│ │ ☐ Register with PRO                                🟢 Feb 14            ││
│ │   Metadata • Assigned: @me • Priority: High                             ││
│ └─────────────────────────────────────────────────────────────────────────┘│
│                                                                             │
│ ✅ COMPLETED (8)                                                            │
│ ┌─────────────────────────────────────────────────────────────────────────┐│
│ │ ☑ Clear samples                                    ✓ Feb 1              ││
│ │   Legal • Completed by @me                                              ││
│ └─────────────────────────────────────────────────────────────────────────┘│
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Task Card Detail View

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ Complete final mix                                                     [X]  │
├─────────────────────────────────────────────────────────────────────────────┤
│ Status: ● In Progress              Deadline: Feb 5, 2025 (🔴 2 days ago)    │
│ Category: Production               Priority: Critical (100)                 │
│ Assigned to: @producer             Created: Jan 15, 2025                    │
├─────────────────────────────────────────────────────────────────────────────┤
│ Description:                                                                │
│ Approve final mix from mixing engineer. Check for:                          │
│ • Vocal clarity and presence                                                │
│ • Low-end balance                                                           │
│ • Stereo width and depth                                                    │
│ • Reference track comparison                                                │
├─────────────────────────────────────────────────────────────────────────────┤
│ Attachments:                                                                │
│ 📎 mix_v3_final.wav (24.5 MB)                                              │
│ 📎 reference_notes.pdf (156 KB)                                            │
├─────────────────────────────────────────────────────────────────────────────┤
│ Activity:                                                                   │
│ • Feb 6: @me commented "Still waiting on revised stems"                     │
│ • Feb 5: System marked as overdue                                           │
│ • Feb 3: @producer changed status to In Progress                            │
│ • Jan 20: @me assigned to @producer                                         │
│ • Jan 15: Task created from template                                        │
├─────────────────────────────────────────────────────────────────────────────┤
│ [Add Comment...]                                                            │
│                                                                             │
│ [Mark Complete]  [Mark Blocked]  [Reassign]  [Edit]  [Delete]              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Checklist Progress Summary

```typescript
interface ChecklistSummary {
  totalTasks: number;
  completed: number;
  inProgress: number;
  blocked: number;
  overdue: number;
  upcoming: number;

  byCategory: Record<string, CategorySummary>;
  criticalPath: ChecklistItem[]; // Items that must complete on time

  projectedCompletion: Date;
  atRisk: boolean;
  riskFactors: string[];
}
```

---

## Release Calendar

### Year View

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ 2025 Release Calendar                            [+ New Release] [AI Plan]  │
├─────────────────────────────────────────────────────────────────────────────┤
│ ◀ 2025 ▶                                                                    │
├──────────┬──────────┬──────────┬──────────┬──────────┬──────────────────────┤
│ January  │ February │ March    │ April    │ May      │ June                 │
│          │          │          │          │          │                      │
│ [10]     │          │ [21]     │          │ [16]     │                      │
│ 🎵 Waves │          │ 🎵 Summer│          │ 🎵 EP    │                      │
│ Released │          │ Nights   │          │ Launch   │                      │
│          │          │ Planning │          │ Ideation │                      │
├──────────┼──────────┼──────────┼──────────┼──────────┼──────────────────────┤
│ July     │ August   │ September│ October  │ November │ December             │
│          │          │          │          │          │                      │
│          │ [?]      │ [?]      │ [?]      │          │                      │
│          │ AI       │ AI       │ AI       │          │                      │
│          │ Suggested│ Suggested│ Suggested│          │                      │
│          │          │          │          │          │                      │
└──────────┴──────────┴──────────┴──────────┴──────────┴──────────────────────┘

Legend: 🎵 Release • [Date] • Status colors: Green=Released, Blue=Scheduled,
        Yellow=Planning, Gray=Ideation, Dashed=AI Suggested
```

### Timeline View

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ Q1-Q2 2025 Timeline                                              [Zoom: 6M] │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│ Jan    Feb    Mar    Apr    May    Jun    Jul                               │
│ ─────────────────────────────────────────────────────────────────           │
│                                                                             │
│ ████████                                                                    │
│ Waves (Released Jan 10)                                                     │
│                                                                             │
│        [======🎵●]                                                          │
│        Summer Nights (Mar 21)                                               │
│        ↑ ↑ ↑  ↑                                                             │
│        │ │ │  └─ Release day                                                │
│        │ │ └──── Pre-save (Feb 28)                                          │
│        │ └────── Editorial pitch (Feb 21)                                   │
│        └──────── Submit to distributor (Feb 7)                              │
│                                                                             │
│                         [===========================🎵●]                    │
│                         Summer EP (May 16)                                  │
│                                                                             │
│                                          [- - - - - - - -?]                 │
│                                          AI Suggested (Aug TBD)             │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### AI Annual Planning

```
User: Help me plan my releases for 2025

Jovie AI: Based on your goals and history, here's a suggested 2025 release strategy:

📊 **Your 2024 Pattern:**
• 4 singles, 1 EP
• Average 8-week spacing
• Best performers: March and September releases

📅 **Suggested 2025 Calendar:**

| Date | Release | Type | Strategy |
|------|---------|------|----------|
| Jan 10 ✓ | Waves | Single | Winter mood piece (released) |
| Mar 21 | Summer Nights | Single | Spring energy builder |
| May 16 | Sunset EP | EP (4 tracks) | Festival season positioning |
| Aug 8 | TBD | Single | Late summer vibe |
| Oct 3 | TBD | Single | Fall momentum |
| Nov 21 | TBD | Single | Pre-holiday release |

**Strategic Notes:**
• 6-8 week spacing maintains algorithmic momentum
• May EP catches festival/playlist season
• November avoids Thanksgiving week (US)
• No December release (streaming slows during holidays)

**Revenue Projection:**
Based on your 2024 growth trajectory, this calendar could yield:
• ~2.4M total streams (+35% YoY)
• ~$8,400 streaming revenue
• Optimal playlist placement windows

Would you like me to create release plans for each of these dates?
```

---

## Task Assignment & Automation

### Assignment Types

```typescript
type AssignmentTarget =
  | { type: 'user'; userId: string }
  | { type: 'team_role'; role: 'manager' | 'producer' | 'designer' | 'publicist' }
  | { type: 'ai_agent'; agentName: string; config: AgentConfig };

interface AgentConfig {
  agentType: 'artwork_generator' | 'social_scheduler' | 'email_drafter' |
             'playlist_pitcher' | 'press_release_writer' | 'analytics_reporter';
  autoApprove: boolean;
  parameters: Record<string, unknown>;
}
```

### AI Agent Automation (Future)

Tasks marked as `is_automatable` can be assigned to AI agents:

| Agent | Tasks |
|-------|-------|
| `social_scheduler` | Plan content calendar, Schedule posts |
| `email_drafter` | Prepare email announcement, Fan newsletter |
| `press_release_writer` | Create press release, Update EPK |
| `analytics_reporter` | Monitor streaming numbers, First-week analysis |
| `playlist_pitcher` | Pitch to playlist curators (draft outreach) |
| `asset_generator` | Create social media assets (with DALL-E/Midjourney) |

### Assignment Workflow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ Task Assignment Flow                                                        │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────────┐     ┌─────────────┐     ┌─────────────┐                   │
│  │   Assign    │────▶│   Notify    │────▶│   Track     │                   │
│  │   Task      │     │   Assignee  │     │   Progress  │                   │
│  └─────────────┘     └─────────────┘     └─────────────┘                   │
│        │                                        │                           │
│        ▼                                        ▼                           │
│  ┌─────────────┐                         ┌─────────────┐                   │
│  │ User?       │──Yes──▶ Email/Push      │ Overdue?    │──Yes──▶ Escalate │
│  │ AI Agent?   │──Yes──▶ Execute         │ Blocked?    │──Yes──▶ Alert    │
│  └─────────────┘        Automatically    └─────────────┘                   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Implementation Phases

### Phase 1: Foundation (Week 1-2)
- [ ] Database schema implementation
- [ ] Seed system checklist templates
- [ ] Basic CRUD for release plans
- [ ] Basic CRUD for checklist items

### Phase 2: AI Integration (Week 3-4)
- [ ] Discography pattern analyzer
- [ ] Release date suggestion algorithm
- [ ] Enhanced AI chat prompts
- [ ] Suggestion storage and feedback loop

### Phase 3: Checklist UI (Week 5-6)
- [ ] Checklist view component
- [ ] Task card component
- [ ] Deadline tracking and overdue alerts
- [ ] Category filtering and sorting

### Phase 4: Calendar (Week 7-8)
- [ ] Year view calendar
- [ ] Timeline view
- [ ] Drag-drop release planning
- [ ] AI annual planning feature

### Phase 5: Assignments (Week 9-10)
- [ ] User assignment system
- [ ] Activity logging
- [ ] Notification system for deadlines
- [ ] Basic AI agent framework

### Phase 6: Automation (Future)
- [ ] AI agent integration
- [ ] Auto-execution of tasks
- [ ] Approval workflows
- [ ] Advanced analytics

---

## API Design

### Release Plans

```typescript
// Server Actions
async function createReleasePlan(input: CreateReleasePlanInput): Promise<ReleasePlan>
async function updateReleasePlan(id: string, input: UpdateReleasePlanInput): Promise<ReleasePlan>
async function deleteReleasePlan(id: string): Promise<void>
async function getReleasePlans(creatorId: string, filters?: PlanFilters): Promise<ReleasePlan[]>
async function getReleasePlanById(id: string): Promise<ReleasePlanWithChecklist>

// AI Actions
async function suggestReleaseDate(input: SuggestDateInput): Promise<ReleaseDateSuggestion>
async function generateAnnualPlan(input: AnnualPlanInput): Promise<AnnualPlanSuggestion>
async function applyChecklistTemplate(planId: string, templateId: string): Promise<ChecklistItem[]>
```

### Checklist Items

```typescript
async function createChecklistItem(input: CreateItemInput): Promise<ChecklistItem>
async function updateChecklistItem(id: string, input: UpdateItemInput): Promise<ChecklistItem>
async function deleteChecklistItem(id: string): Promise<void>
async function updateItemStatus(id: string, status: ItemStatus): Promise<ChecklistItem>
async function assignItem(id: string, assignment: AssignmentTarget): Promise<ChecklistItem>
async function addItemComment(id: string, comment: string): Promise<Activity>
```

### Templates

```typescript
async function getChecklistTemplates(creatorId?: string): Promise<Template[]>
async function createCustomTemplate(input: CreateTemplateInput): Promise<Template>
async function duplicateTemplate(templateId: string): Promise<Template>
```

---

## UI/UX Specifications

### Navigation

```
Dashboard
├── Overview
├── Releases (existing)
├── Release Plans (NEW)      ← Primary entry point
│   ├── Calendar View
│   ├── Timeline View
│   └── List View
├── Audience
└── Settings
```

### Design Principles

1. **Progressive Disclosure**: Start simple, reveal complexity as needed
2. **AI-Assisted, Not AI-Controlled**: Suggestions, not mandates
3. **Deadline-Centric**: Always show time remaining/overdue
4. **Mobile-Ready**: Full functionality on mobile devices
5. **Batch Operations**: Select multiple tasks for bulk actions

### Color Coding

| Status | Color | Hex |
|--------|-------|-----|
| Released | Green | `#22c55e` |
| Scheduled | Blue | `#3b82f6` |
| Planning | Yellow | `#eab308` |
| Ideation | Gray | `#6b7280` |
| Overdue | Red | `#ef4444` |
| Blocked | Orange | `#f97316` |
| Completed | Muted Green | `#86efac` |

---

## Success Metrics

| Metric | Target | Measurement |
|--------|--------|-------------|
| Release plan adoption | 60% of active artists | Artists with 1+ release plan |
| Checklist completion rate | 80% | Tasks completed by deadline |
| AI suggestion acceptance | 40% | Suggested dates accepted |
| Time to release | -20% | Days from plan creation to release |
| User retention | +15% | Monthly active users |

---

## Open Questions

1. **Collaboration**: Should team members have their own accounts or be managed under artist account?
2. **Integrations**: Priority order for distributor integrations (DistroKid, TuneCore, etc.)?
3. **Pricing**: Is this a premium feature or included in all tiers?
4. **AI Costs**: Budget for additional Claude API calls per user?
5. **Mobile**: Native app or responsive web first?

---

## Appendix: Distribution Lead Times

| Distributor | Standard Lead Time | Rush Option |
|-------------|-------------------|-------------|
| DistroKid | 2-5 days | Same day ($) |
| TuneCore | 2-3 weeks | 1 week ($) |
| CD Baby | 2-4 weeks | N/A |
| AWAL | 4 weeks | N/A |
| UnitedMasters | 2-4 weeks | N/A |
| Ditto | 2-3 weeks | 24 hours ($) |
| Amuse | 2-4 weeks | 1 week ($) |
| Label (Major) | 6-8 weeks | N/A |
| Spotify Editorial | 7 days minimum | N/A |
| Apple Music Editorial | 7-14 days | N/A |

**Recommendation**: Default to 6 weeks (42 days) to account for:
- Distribution processing
- Editorial pitching windows
- Buffer for unexpected issues
- Marketing lead time

---

*Document Version: 1.0*
*Created: January 2025*
*Last Updated: January 2025*
