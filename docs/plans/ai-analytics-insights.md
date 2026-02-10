# AI-Powered Analytics Insights

> "Your audience in Berlin grew 40% — consider booking a show there"
> Turns data into action.

## 1. Vision & Goals

**Primary Goal:** Surface AI-generated, actionable insights from existing analytics data to help artists make smarter decisions about touring, promotion, content, and fan engagement.

**Success Metrics:**
- Artists act on 30%+ of generated insights (dismiss < 50%)
- Average time-to-first-insight < 2 seconds (cached) or < 15 seconds (fresh generation)
- Insights correlate with actual data trends (no hallucinated metrics)

**Non-Goals (v1):**
- Predictive analytics / forecasting
- Cross-artist benchmarking
- Real-time streaming insight generation
- Integration with external data sources (Spotify for Artists API, etc.)

---

## 2. Data Sources & Signals

All insight generation draws from existing Jovie data. No new data collection required for v1.

### 2.1 Primary Data Sources

| Source Table | Key Columns | Insight Signal |
|---|---|---|
| `click_events` | city, country, linkType, referrer, createdAt, isBot | Geographic trends, platform preferences, traffic sources |
| `audience_members` | geoCity, geoCountry, engagementScore, intentLevel, visits, type | Audience composition, engagement quality, growth |
| `notification_subscriptions` | channel, email, city, countryCode, createdAt, unsubscribedAt | Subscriber growth/churn, geographic distribution |
| `tips` | amountCents, currency, createdAt, contactEmail | Revenue trends, tipping patterns, fan generosity |
| `tour_dates` | city, country, latitude, longitude, startDate, ticketStatus | Tour coverage, geographic gaps |
| `discog_releases` | releaseDate, spotifyPopularity, releaseType | Content performance, release momentum |
| `social_links` | platform, clicks, isActive | Platform engagement, link performance |
| `pixel_events` | eventType, eventData (UTM params), sessionId | Campaign effectiveness, conversion funnels |
| `email_engagement` | emailType, eventType, metadata (city, deviceType) | Email campaign performance |

### 2.2 Derived Metrics (Computed at Query Time)

| Metric | Computation | Used For |
|---|---|---|
| **City Growth Rate** | `(clicks_current_period - clicks_previous_period) / clicks_previous_period * 100` | Geographic growth insights |
| **Subscriber Velocity** | `new_subscribers_this_period / days_in_period` | Subscriber momentum |
| **Engagement Density** | `high_intent_audience / total_audience * 100` | Audience quality shifts |
| **Platform CTR** | `clicks_per_link / total_profile_views * 100` | Platform preference insights |
| **Revenue per City** | `sum(tips.amountCents) GROUP BY city` | Revenue geography insights |
| **Tour Gap Score** | `audience_density_rank - tour_coverage_rank` (cities with fans but no shows) | Tour recommendation |
| **Capture Rate Trend** | `(subscribers / unique_visitors) * 100` compared across periods | Conversion optimization |
| **Referrer Momentum** | `referrer_clicks_this_period / referrer_clicks_last_period` | Traffic source insights |

---

## 3. Insight Taxonomy

### 3.1 Insight Categories

```
insight_category
├── geographic     # City/country audience trends
├── growth         # Subscriber, visitor, engagement growth
├── content        # Release performance, link CTR
├── revenue        # Tipping patterns, revenue geography
├── tour           # Tour gap analysis, show recommendations
├── platform       # Traffic source and social platform trends
├── engagement     # Audience quality, intent level shifts
└── timing         # Optimal posting/engagement windows
```

### 3.2 Insight Types (Concrete)

| Type ID | Category | Example | Min Data Required |
|---|---|---|---|
| `city_growth` | geographic | "Your audience in Berlin grew 40% this month" | 20+ clicks from city in both periods |
| `new_market` | geographic | "You're gaining traction in Tokyo — 45 new visitors this month" | 15+ clicks from a city with <5 in previous period |
| `declining_market` | geographic | "Traffic from London dropped 30% — consider re-engaging" | 20+ clicks previously, significant decline |
| `tour_gap` | tour | "Melbourne has 200+ fans but no upcoming shows" | 50+ audience members in city, 0 tour dates |
| `tour_timing` | tour | "Your NYC show is in 3 weeks — engagement from NYC is up 60%" | Active tour date + matching city growth |
| `subscriber_surge` | growth | "Subscriber growth is up 150% — great time for a release announcement" | 10+ new subscribers, significant velocity change |
| `subscriber_churn` | growth | "5 subscribers unsubscribed this week — check your email frequency" | 3+ unsubscribes in 7 days |
| `release_momentum` | content | "Your latest single has 2x the clicks of your previous release at this point" | 2+ releases with click data |
| `platform_preference` | platform | "Spotify gets 3x more clicks than Apple Music — focus promotion there" | 50+ total music link clicks |
| `referrer_surge` | platform | "Instagram is driving 5x more traffic this month" | 20+ referrer clicks, significant growth |
| `tip_hotspot` | revenue | "Fans in Austin tip 2x the average — consider merch or VIP there" | 5+ tips with city data |
| `engagement_quality` | engagement | "40% of your audience is now high-intent — up from 25%" | 50+ audience members with intent levels |
| `peak_activity` | timing | "Your profile gets the most traffic on Fridays 6-9 PM" | 100+ events with temporal spread |
| `capture_rate_change` | growth | "Your visitor-to-subscriber rate improved to 8.5% — up from 5.2%" | 50+ unique visitors, 5+ subscribers |
| `device_shift` | engagement | "65% of your audience is now mobile — ensure your profile is optimized" | 100+ events with device data |

### 3.3 Priority Levels

| Priority | Criteria | Display |
|---|---|---|
| **high** | Actionable + time-sensitive (tour gap, surge, churn) | Prominent card, notification badge |
| **medium** | Actionable but not urgent (platform preference, engagement quality) | Standard card |
| **low** | Informational (device shift, peak activity) | Compact card, expandable |

### 3.4 Confidence Scoring

Each insight gets a confidence score (0.0 - 1.0) based on:

```
confidence = base_confidence * data_volume_factor * trend_consistency_factor

where:
  base_confidence   = type-specific (e.g., 0.9 for simple growth, 0.7 for timing patterns)
  data_volume_factor = min(1.0, data_points / required_minimum * 1.5)
  trend_consistency  = 1.0 if monotonic, 0.8 if noisy, 0.6 if contradictory
```

Insights below 0.5 confidence are not shown.

---

## 4. Database Schema

### 4.1 New Enums

```typescript
// In apps/web/lib/db/schema/enums.ts

export const insightCategoryEnum = pgEnum('insight_category', [
  'geographic',
  'growth',
  'content',
  'revenue',
  'tour',
  'platform',
  'engagement',
  'timing',
]);

export const insightTypeEnum = pgEnum('insight_type', [
  'city_growth',
  'new_market',
  'declining_market',
  'tour_gap',
  'tour_timing',
  'subscriber_surge',
  'subscriber_churn',
  'release_momentum',
  'platform_preference',
  'referrer_surge',
  'tip_hotspot',
  'engagement_quality',
  'peak_activity',
  'capture_rate_change',
  'device_shift',
]);

export const insightPriorityEnum = pgEnum('insight_priority', [
  'high',
  'medium',
  'low',
]);

export const insightStatusEnum = pgEnum('insight_status', [
  'active',
  'dismissed',
  'acted_on',
  'expired',
]);

export const insightRunStatusEnum = pgEnum('insight_run_status', [
  'pending',
  'processing',
  'completed',
  'failed',
]);
```

### 4.2 New Tables

```typescript
// New file: apps/web/lib/db/schema/insights.ts

export const aiInsights = pgTable('ai_insights', {
  id: uuid('id').primaryKey().defaultRandom(),
  creatorProfileId: uuid('creator_profile_id')
    .notNull()
    .references(() => creatorProfiles.id, { onDelete: 'cascade' }),

  // Classification
  insightType: insightTypeEnum('insight_type').notNull(),
  category: insightCategoryEnum('category').notNull(),
  priority: insightPriorityEnum('priority').notNull().default('medium'),

  // Content (AI-generated)
  title: text('title').notNull(),           // "Your audience in Berlin grew 40%"
  description: text('description').notNull(), // Longer context paragraph
  actionSuggestion: text('action_suggestion'), // "Consider booking a show there"

  // Data backing
  confidence: numeric('confidence', { precision: 3, scale: 2 }).notNull(), // 0.00 - 1.00
  dataSnapshot: jsonb('data_snapshot').notNull().default({}), // Raw metrics backing this insight

  // Time context
  periodStart: timestamp('period_start', { withTimezone: true }).notNull(),
  periodEnd: timestamp('period_end', { withTimezone: true }).notNull(),
  comparisonPeriodStart: timestamp('comparison_period_start', { withTimezone: true }),
  comparisonPeriodEnd: timestamp('comparison_period_end', { withTimezone: true }),

  // Lifecycle
  status: insightStatusEnum('status').notNull().default('active'),
  dismissedAt: timestamp('dismissed_at', { withTimezone: true }),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),

  // Metadata
  generationRunId: uuid('generation_run_id')
    .references(() => insightGenerationRuns.id, { onDelete: 'set null' }),
  metadata: jsonb('metadata').notNull().default({}),

  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  // Primary lookup: active insights for a creator, newest first
  index('idx_ai_insights_creator_active').on(
    table.creatorProfileId, table.status, table.createdAt
  ),
  // Expiration cleanup
  index('idx_ai_insights_expires_at').on(table.expiresAt),
  // Priority sorting
  index('idx_ai_insights_creator_priority').on(
    table.creatorProfileId, table.priority, table.createdAt
  ),
  // Dedup: prevent duplicate insight types in same period
  uniqueIndex('idx_ai_insights_dedup').on(
    table.creatorProfileId, table.insightType, table.periodStart, table.periodEnd
  ),
]);

export const insightGenerationRuns = pgTable('insight_generation_runs', {
  id: uuid('id').primaryKey().defaultRandom(),
  creatorProfileId: uuid('creator_profile_id')
    .notNull()
    .references(() => creatorProfiles.id, { onDelete: 'cascade' }),

  // Run metadata
  status: insightRunStatusEnum('status').notNull().default('pending'),
  insightsGenerated: integer('insights_generated').notNull().default(0),
  dataPointsAnalyzed: integer('data_points_analyzed').notNull().default(0),

  // AI usage tracking
  modelUsed: text('model_used'),
  promptTokens: integer('prompt_tokens'),
  completionTokens: integer('completion_tokens'),
  durationMs: integer('duration_ms'),

  // Error handling
  error: text('error'),

  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('idx_insight_runs_creator').on(table.creatorProfileId, table.createdAt),
  index('idx_insight_runs_status').on(table.status),
]);
```

### 4.3 Schema Relationships

```
creator_profiles (1) ──→ (N) ai_insights
creator_profiles (1) ──→ (N) insight_generation_runs
insight_generation_runs (1) ──→ (N) ai_insights (via generationRunId)
```

---

## 5. Architecture

### 5.1 System Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    Frontend (React)                       │
│                                                           │
│  ┌──────────────┐  ┌──────────────┐  ┌────────────────┐ │
│  │ InsightsPanel │  │ InsightCard  │  │ SummaryWidget  │ │
│  │ (Full Page)   │  │ (Individual) │  │ (Dashboard)    │ │
│  └──────┬───────┘  └──────┬───────┘  └───────┬────────┘ │
│         │                  │                   │          │
│  ┌──────┴──────────────────┴───────────────────┴───────┐ │
│  │           useInsightsQuery (TanStack Query)          │ │
│  └──────────────────────┬──────────────────────────────┘ │
└─────────────────────────┼────────────────────────────────┘
                          │ HTTP
┌─────────────────────────┼────────────────────────────────┐
│                    API Layer                               │
│                                                           │
│  ┌────────────────────┐  ┌─────────────────────────────┐ │
│  │ GET /api/insights   │  │ POST /api/insights/generate │ │
│  │ (Read cached)       │  │ (Trigger generation)        │ │
│  └────────┬───────────┘  └──────────┬──────────────────┘ │
│           │                          │                     │
│  ┌────────┴──────────────────────────┴──────────────────┐ │
│  │              Insight Service Layer                     │ │
│  │                                                       │ │
│  │  ┌─────────────────┐    ┌──────────────────────────┐ │ │
│  │  │ Data Aggregator  │───→│  AI Insight Generator    │ │ │
│  │  │ (SQL queries)    │    │  (Claude API + prompts)  │ │ │
│  │  └────────┬────────┘    └───────────┬──────────────┘ │ │
│  │           │                          │                 │ │
│  │  ┌────────┴──────────────────────────┴──────────────┐ │ │
│  │  │               PostgreSQL (Neon)                   │ │ │
│  │  │  click_events │ audience │ tips │ ai_insights     │ │ │
│  │  └──────────────────────────────────────────────────┘ │ │
│  └──────────────────────────────────────────────────────┘ │
│                                                           │
│  ┌──────────────────────────────────────────────────────┐ │
│  │  GET /api/cron/generate-insights (Scheduled)         │ │
│  └──────────────────────────────────────────────────────┘ │
└───────────────────────────────────────────────────────────┘
```

### 5.2 Data Flow

```
1. AGGREGATION (SQL)
   click_events ──┐
   audience_members ──┤
   tips ──┤              ──→ MetricSnapshot (typed JSON)
   tour_dates ──┤
   notification_subscriptions ──┤
   discog_releases ──┘

2. ANALYSIS (Claude AI)
   MetricSnapshot ──→ Structured Prompt ──→ Claude API ──→ InsightResult[]

3. STORAGE
   InsightResult[] ──→ validate & dedup ──→ INSERT ai_insights

4. DELIVERY
   ai_insights ──→ GET /api/insights ──→ useInsightsQuery ──→ InsightsPanel
```

---

## 6. Service Layer Design

### 6.1 Data Aggregator

**File:** `apps/web/lib/services/insights/data-aggregator.ts`

Responsible for computing all derived metrics in a single consolidated SQL query (following the existing CTE pattern in `getUserDashboardAnalytics`).

```typescript
interface MetricSnapshot {
  // Period context
  period: { start: Date; end: Date };
  comparisonPeriod: { start: Date; end: Date };

  // Geographic
  geographic: {
    currentTopCities: { city: string; country: string; count: number }[];
    previousTopCities: { city: string; country: string; count: number }[];
    cityGrowthRates: { city: string; country: string; currentCount: number; previousCount: number; growthPct: number }[];
    newCities: { city: string; country: string; count: number }[];  // appeared this period
    decliningCities: { city: string; country: string; declinePct: number }[];
  };

  // Traffic
  traffic: {
    totalClicksCurrent: number;
    totalClicksPrevious: number;
    uniqueVisitorsCurrent: number;
    uniqueVisitorsPrevious: number;
    profileViewsCurrent: number;
    profileViewsPrevious: number;
  };

  // Subscribers
  subscribers: {
    newSubscribersCurrent: number;
    newSubscribersPrevious: number;
    unsubscribesCurrent: number;
    unsubscribesPrevious: number;
    totalActive: number;
    subscriberCities: { city: string; count: number }[];
  };

  // Revenue
  revenue: {
    totalTipsCurrent: number;  // cents
    totalTipsPrevious: number;
    tipCountCurrent: number;
    tipCountPrevious: number;
    tipsByCity: { city: string; totalCents: number; count: number }[];
    averageTipCurrent: number;
    averageTipPrevious: number;
  };

  // Content
  content: {
    clicksByLinkType: { linkType: string; current: number; previous: number }[];
    clicksByPlatform: { platform: string; current: number; previous: number }[];
    recentReleases: { id: string; title: string; releaseDate: string; clickCount: number }[];
  };

  // Tour
  tour: {
    upcomingShows: { city: string; country: string; date: string; venueName: string }[];
    audienceCitiesWithoutShows: { city: string; country: string; audienceCount: number }[];
  };

  // Engagement
  engagement: {
    intentDistributionCurrent: { level: string; count: number }[];
    intentDistributionPrevious: { level: string; count: number }[];
    deviceDistribution: { deviceType: string; count: number }[];
    captureRateCurrent: number;  // subscribers / unique visitors * 100
    captureRatePrevious: number;
  };

  // Referrers
  referrers: {
    topReferrersCurrent: { referrer: string; count: number }[];
    topReferrersPrevious: { referrer: string; count: number }[];
    referrerGrowthRates: { referrer: string; growthPct: number }[];
  };

  // Temporal
  temporal: {
    clicksByHour: { hour: number; count: number }[];
    clicksByDayOfWeek: { day: number; count: number }[];  // 0=Sunday
  };

  // Profile context
  profile: {
    displayName: string;
    genres: string[];
    spotifyFollowers: number | null;
    spotifyPopularity: number | null;
    creatorType: string;
    totalAudienceMembers: number;
    totalSubscribers: number;
  };
}
```

**SQL Strategy:** Two consolidated queries using CTEs:

1. **Current period aggregation** — All metrics for `[periodStart, periodEnd]`
2. **Comparison period aggregation** — Same metrics for `[comparisonStart, comparisonEnd]`

Both follow the `dashboardQuery()` pattern with 10s timeout.

**Implementation Notes:**
- Default period: last 30 days vs. prior 30 days
- All queries filter `is_bot = false OR is_bot IS NULL`
- City data requires `WHERE city IS NOT NULL`
- Top-N limited to 15 per category (AI will select most relevant)
- Uses existing `sqlTimestamp()` helper for date parameters

### 6.2 AI Insight Generator

**File:** `apps/web/lib/services/insights/insight-generator.ts`

Uses Claude (via Anthropic SDK, same as existing chat) with structured output.

```typescript
interface InsightGeneratorInput {
  metrics: MetricSnapshot;
  existingInsights: { insightType: string; createdAt: Date }[];  // Avoid duplicates
  profileId: string;
}

interface GeneratedInsight {
  insightType: InsightType;
  category: InsightCategory;
  priority: 'high' | 'medium' | 'low';
  title: string;
  description: string;
  actionSuggestion: string | null;
  confidence: number;
  dataSnapshot: Record<string, unknown>;
  expiresInDays: number;
}

async function generateInsights(input: InsightGeneratorInput): Promise<GeneratedInsight[]>
```

**Prompt Design:**

```
System: You are an analytics advisor for music artists on Jovie, a link-in-bio platform.
Analyze the provided metrics and generate actionable insights.

Rules:
- Only generate insights supported by the data (never fabricate numbers)
- Each insight must reference specific metrics from the data
- Prioritize actionable insights over informational ones
- Use the artist's name and genre context for personalization
- Keep titles under 80 characters, punchy and specific
- Descriptions should be 1-2 sentences providing context
- Action suggestions should be concrete and achievable
- Set appropriate confidence (0.5-1.0) based on data volume and trend clarity
- Set expiration: high-priority = 7 days, medium = 14 days, low = 30 days
- Do not generate insights if the data is insufficient (see minimum thresholds)
- Maximum 8 insights per generation run

Output format: JSON array of insight objects matching the GeneratedInsight schema.

User: Here are the analytics metrics for {displayName} ({creatorType}, genres: {genres}):

{JSON.stringify(metrics, null, 2)}

Previously generated insights (avoid duplicates):
{existingInsights.map(i => `- ${i.insightType} (${i.createdAt})`).join('\n')}

Generate relevant, actionable insights from this data.
```

**AI Model Config:**
- Model: `claude-sonnet-4-20250514` (fast, cost-effective for structured analysis)
- Max tokens: 4096
- Temperature: 0.3 (low creativity, high consistency)
- Response format: JSON with Zod schema validation

**Cost Estimation:**
- ~2000 input tokens (metrics) + ~1500 output tokens (insights) per run
- At $3/$15 per million tokens: ~$0.03 per generation
- With daily generation for 1000 active users: ~$30/day

### 6.3 Insight Lifecycle Manager

**File:** `apps/web/lib/services/insights/lifecycle.ts`

Handles the insight lifecycle: creation, deduplication, expiration, and status changes.

```typescript
// Create insights from generation run
async function persistInsights(
  profileId: string,
  runId: string,
  insights: GeneratedInsight[]
): Promise<number>

// Expire stale insights (called by cron)
async function expireStaleInsights(): Promise<number>

// Update insight status
async function updateInsightStatus(
  insightId: string,
  profileId: string,
  status: 'dismissed' | 'acted_on'
): Promise<void>

// Get active insights for a creator
async function getActiveInsights(
  profileId: string,
  options: { category?: string; priority?: string; limit?: number; offset?: number }
): Promise<{ insights: AiInsight[]; total: number }>
```

**Deduplication Strategy:**
- Unique constraint on `(creatorProfileId, insightType, periodStart, periodEnd)`
- Before inserting, check for active insights of same type created within 7 days
- If similar insight exists, only replace if new confidence > old confidence

---

## 7. API Design

### 7.1 Endpoints

| Method | Path | Auth | Rate Limit | Description |
|---|---|---|---|---|
| `GET` | `/api/insights` | Required | Standard | Fetch active insights (paginated) |
| `GET` | `/api/insights/summary` | Required | Standard | Top 3 insights for dashboard widget |
| `POST` | `/api/insights/generate` | Required | 1/hour/user | Trigger insight generation |
| `PATCH` | `/api/insights/[id]` | Required | Standard | Update insight status (dismiss/act) |
| `GET` | `/api/cron/generate-insights` | Cron secret | N/A | Scheduled batch generation |

### 7.2 GET /api/insights

**Query Parameters:**
```
?category=geographic,growth    # Comma-separated filter
&priority=high,medium          # Comma-separated filter
&status=active                 # Default: active
&limit=20                      # Default: 20, max: 50
&offset=0                      # Pagination offset
```

**Response:**
```json
{
  "insights": [
    {
      "id": "uuid",
      "insightType": "city_growth",
      "category": "geographic",
      "priority": "high",
      "title": "Your audience in Berlin grew 40%",
      "description": "Berlin saw 145 visitors this month, up from 103 last month. This makes it your 3rd fastest-growing city.",
      "actionSuggestion": "Consider booking a show there or running a targeted promotion.",
      "confidence": 0.87,
      "status": "active",
      "periodStart": "2026-01-10T00:00:00Z",
      "periodEnd": "2026-02-09T00:00:00Z",
      "createdAt": "2026-02-09T10:30:00Z",
      "expiresAt": "2026-02-16T10:30:00Z"
    }
  ],
  "total": 7,
  "hasMore": false
}
```

### 7.3 GET /api/insights/summary

Lightweight endpoint for dashboard widget. Returns top 3 active insights sorted by priority then recency. No pagination.

**Response:**
```json
{
  "insights": [ /* max 3 insight objects */ ],
  "totalActive": 7,
  "lastGeneratedAt": "2026-02-09T10:30:00Z"
}
```

### 7.4 POST /api/insights/generate

**Request:** No body required (generates for authenticated user).

**Response:**
```json
{
  "runId": "uuid",
  "status": "completed",
  "insightsGenerated": 5,
  "dataPointsAnalyzed": 1247,
  "durationMs": 8432
}
```

**Error cases:**
- 429: Rate limited (max 1 generation per hour)
- 422: Insufficient data (profile has < 20 click events total)

### 7.5 PATCH /api/insights/[id]

**Request:**
```json
{
  "status": "dismissed"  // or "acted_on"
}
```

### 7.6 GET /api/cron/generate-insights

Scheduled via Vercel cron (daily at 6 AM UTC).

**Logic:**
1. Query active profiles with `> 50` click events and `> 7` days of data
2. Skip profiles with a generation run in the last 20 hours
3. Process up to 100 profiles per run (staggered)
4. For each: aggregate → generate → persist
5. Also expire insights past their `expiresAt`

---

## 8. Frontend Design

### 8.1 New Components

```
components/dashboard/insights/
├── InsightsPanel.tsx          # Full insights page content
├── InsightCard.tsx            # Individual insight card
├── InsightsSummaryWidget.tsx  # Dashboard overview widget (top 3)
├── InsightsBadge.tsx          # Nav badge (count of active insights)
├── InsightCategoryIcon.tsx    # Icon per category
├── InsightActions.tsx         # Dismiss/act-on buttons
└── InsightEmptyState.tsx      # No insights yet / generate prompt
```

### 8.2 InsightsPanel (Full Page)

**Route:** `/app/insights` (new dashboard page)

**Layout:**
```
┌──────────────────────────────────────────────────────────┐
│  AI Insights                           [Generate] [Filter]│
├──────────────────────────────────────────────────────────┤
│                                                          │
│  ┌─ HIGH PRIORITY ─────────────────────────────────────┐ │
│  │ 📍 Your audience in Berlin grew 40%                 │ │
│  │    Berlin saw 145 visitors this month...            │ │
│  │    → Consider booking a show there                  │ │
│  │    Confidence: 87%        [Dismiss] [Mark as Done]  │ │
│  └────────────────────────────────────────────────────┘ │
│                                                          │
│  ┌─ HIGH PRIORITY ─────────────────────────────────────┐ │
│  │ 🎫 Melbourne has 200+ fans but no upcoming shows    │ │
│  │    ...                                              │ │
│  └────────────────────────────────────────────────────┘ │
│                                                          │
│  ┌─ MEDIUM ────────────────────────────────────────────┐ │
│  │ 🎵 Spotify gets 3x more clicks than Apple Music    │ │
│  │    ...                                              │ │
│  └────────────────────────────────────────────────────┘ │
│                                                          │
│  ┌─ LOW ───────────────────────────────────────────────┐ │
│  │ 📱 65% of your audience is now mobile               │ │
│  │    ...                                              │ │
│  └────────────────────────────────────────────────────┘ │
│                                                          │
└──────────────────────────────────────────────────────────┘
```

**Features:**
- Category filter pills (All, Geographic, Growth, Content, Revenue, Tour)
- Priority grouping (high → medium → low)
- Generate button (with cooldown timer showing time until next generation)
- Empty state for new users (encouraging them to share their profile link)

### 8.3 InsightsSummaryWidget (Dashboard)

Compact widget on the main dashboard overview showing top 3 insights.

```
┌─ AI Insights (7 active) ──────── [View All →] ─────────┐
│                                                          │
│  📍 Berlin audience grew 40% — book a show there        │
│  📈 Subscriber growth up 150% — announce something      │
│  🎵 Spotify outperforms Apple Music 3:1                  │
│                                                          │
└──────────────────────────────────────────────────────────┘
```

### 8.4 InsightsBadge (Navigation)

Small badge on the "Insights" nav item showing count of unread/active high-priority insights.

### 8.5 Category Icons

| Category | Icon | Color |
|---|---|---|
| geographic | MapPin | blue |
| growth | TrendingUp | green |
| content | Music | purple |
| revenue | DollarSign | yellow |
| tour | Ticket | orange |
| platform | Share2 | indigo |
| engagement | Users | pink |
| timing | Clock | gray |

### 8.6 TanStack Query Hook

**File:** `apps/web/lib/queries/useInsightsQuery.ts`

```typescript
// Full insights list
export function useInsightsQuery(options?: {
  category?: InsightCategory[];
  priority?: InsightPriority[];
  limit?: number;
  offset?: number;
  enabled?: boolean;
}) {
  return useQuery({
    queryKey: queryKeys.insights.list(options),
    queryFn: ({ signal }) => fetchInsights(options, signal),
    ...STANDARD_CACHE,
  });
}

// Dashboard summary (top 3)
export function useInsightsSummaryQuery(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: queryKeys.insights.summary(),
    queryFn: ({ signal }) => fetchInsightsSummary(signal),
    ...FREQUENT_CACHE,
  });
}
```

**Query Keys:**
```typescript
// In apps/web/lib/queries/keys.ts
insights: {
  all: ['insights'] as const,
  list: (filters?: Record<string, unknown>) =>
    [...queryKeys.insights.all, 'list', ...(filters ? [filters] : [])] as const,
  summary: () => [...queryKeys.insights.all, 'summary'] as const,
  detail: (id: string) => [...queryKeys.insights.all, 'detail', id] as const,
},
```

---

## 9. Minimum Data Thresholds

Insights should only generate when there's sufficient data for meaningful analysis. Generating insights on sparse data erodes user trust.

| Condition | Threshold | Behavior if Unmet |
|---|---|---|
| Total click events | >= 20 | Skip all insights, show empty state |
| Data history | >= 7 days | Skip all insights |
| City-level insights | >= 10 clicks from city per period | Skip that city |
| Growth comparisons | >= 10 in previous period | Skip (can't compute meaningful %) |
| Subscriber insights | >= 3 subscribers total | Skip subscriber insights |
| Revenue insights | >= 3 tips total | Skip revenue insights |
| Temporal insights | >= 50 events with time data | Skip timing insights |
| Platform insights | >= 20 total link clicks | Skip platform insights |
| Tour insights | >= 1 tour date OR >= 50 audience members with geo | Skip tour insights |

---

## 10. File Manifest

### New Files

| File | Purpose |
|---|---|
| `apps/web/lib/db/schema/insights.ts` | Drizzle schema for ai_insights + insight_generation_runs |
| `apps/web/lib/services/insights/types.ts` | TypeScript types (MetricSnapshot, GeneratedInsight, etc.) |
| `apps/web/lib/services/insights/data-aggregator.ts` | SQL metric computation |
| `apps/web/lib/services/insights/insight-generator.ts` | Claude AI insight generation |
| `apps/web/lib/services/insights/lifecycle.ts` | CRUD + dedup + expiration logic |
| `apps/web/lib/services/insights/prompts.ts` | AI prompt templates |
| `apps/web/lib/services/insights/thresholds.ts` | Min data threshold constants |
| `apps/web/app/api/insights/route.ts` | GET (list) + POST (noop, redirect to generate) |
| `apps/web/app/api/insights/generate/route.ts` | POST trigger generation |
| `apps/web/app/api/insights/[id]/route.ts` | PATCH status update |
| `apps/web/app/api/insights/summary/route.ts` | GET dashboard summary |
| `apps/web/app/api/cron/generate-insights/route.ts` | Scheduled batch generation |
| `apps/web/app/app/(shell)/dashboard/insights/page.tsx` | Insights page (Server Component) |
| `apps/web/components/dashboard/insights/InsightsPanel.tsx` | Full page client component |
| `apps/web/components/dashboard/insights/InsightCard.tsx` | Individual insight card |
| `apps/web/components/dashboard/insights/InsightsSummaryWidget.tsx` | Dashboard widget |
| `apps/web/components/dashboard/insights/InsightsBadge.tsx` | Nav badge |
| `apps/web/components/dashboard/insights/InsightCategoryIcon.tsx` | Category icons |
| `apps/web/components/dashboard/insights/InsightActions.tsx` | Dismiss/act buttons |
| `apps/web/components/dashboard/insights/InsightEmptyState.tsx` | Empty state |
| `apps/web/lib/queries/useInsightsQuery.ts` | TanStack Query hooks |
| `apps/web/lib/queries/useInsightsMutation.ts` | Generate + status mutations |
| `apps/web/types/insights.ts` | Shared frontend types |

### Modified Files

| File | Change |
|---|---|
| `apps/web/lib/db/schema/enums.ts` | Add 5 new enums |
| `apps/web/lib/db/schema/index.ts` | Export `./insights` |
| `apps/web/constants/routes.ts` | Add `INSIGHTS: '/app/insights'` |
| `apps/web/lib/queries/keys.ts` | Add `insights` query key factory |
| Dashboard layout/sidebar | Add "Insights" nav item with badge |
| Dashboard overview page | Add InsightsSummaryWidget |

---

## 11. Implementation Phases

### Phase 1: Foundation (Schema + Aggregation)
1. Add enums to `enums.ts`
2. Create `insights.ts` schema
3. Export from `schema/index.ts`
4. Generate migration
5. Implement `types.ts`
6. Implement `thresholds.ts`
7. Implement `data-aggregator.ts`

### Phase 2: AI Generation Engine
1. Implement `prompts.ts`
2. Implement `insight-generator.ts`
3. Implement `lifecycle.ts`
4. Add route constant

### Phase 3: API Layer
1. `GET /api/insights`
2. `GET /api/insights/summary`
3. `POST /api/insights/generate`
4. `PATCH /api/insights/[id]`

### Phase 4: Frontend
1. Add query keys
2. `useInsightsQuery.ts` + `useInsightsMutation.ts`
3. `InsightCategoryIcon.tsx`
4. `InsightCard.tsx`
5. `InsightActions.tsx`
6. `InsightEmptyState.tsx`
7. `InsightsPanel.tsx`
8. `InsightsSummaryWidget.tsx`
9. `InsightsBadge.tsx`
10. Dashboard page (`/app/insights`)
11. Integrate summary widget into dashboard overview
12. Add nav item with badge

### Phase 5: Scheduled Generation
1. `GET /api/cron/generate-insights`
2. Configure Vercel cron schedule

---

## 12. Security & Privacy

- **No PII in insights:** Titles/descriptions reference cities and aggregate counts, never individual users
- **Rate limiting:** 1 generation per hour per user (prevent API abuse)
- **Auth required:** All endpoints require Clerk authentication
- **Row-level security:** Users can only access their own insights
- **AI output validation:** All Claude responses validated with Zod before storage
- **Cost controls:** Max 8 insights per run, max 100 profiles per cron batch
- **Data minimization:** `dataSnapshot` stores only aggregates, never raw event data

---

## 13. Performance Considerations

- **Aggregation queries:** Follow existing CTE pattern (target < 100ms)
- **AI generation:** 5-15 seconds per run (async, non-blocking)
- **Cached reads:** Insights are static once generated; `STANDARD_CACHE` (5min stale) is fine
- **Summary widget:** Separate lightweight endpoint to avoid loading all insights on dashboard
- **Pagination:** Default 20, max 50 per page
- **Expiration cron:** Batch `UPDATE` with `WHERE expires_at < NOW()`, index-backed
- **No real-time:** Insights refresh on page load, not via WebSocket/SSE

---

## 14. Future Enhancements (Post-v1)

- **Insight actions:** Deep links from insights (e.g., "Book show" → tour date creation)
- **Trend charts:** Mini sparklines in insight cards showing the underlying trend
- **Notification delivery:** Push/email for high-priority insights
- **Cross-artist benchmarks:** "Your subscriber growth is 2x the average for indie rock artists"
- **Predictive insights:** "Based on current trends, you'll hit 1000 subscribers by March"
- **Spotify for Artists integration:** Stream count data for richer content insights
- **Natural language queries:** "How is my audience in Germany doing?" → targeted insight
- **Insight reactions:** Thumbs up/down for AI quality feedback loop
