# Investigation: Connected TV (CTV) Advertising for Jovie

## Context

Jovie is an artist profile / link-in-bio platform for creators. The idea is to explore whether Jovie could run CTV ads on behalf of its creator customers (or at least manually for featured/founder profiles). The ad concept is simple: a 16:9 still image showing a phone with a creator's profile on the left and a QR code on the right, with a URL or call-to-action text, and a song playing in the background.

**Current state:** Jovie has **zero advertising infrastructure** today. However, it already has:
- Comprehensive creator profiles (80+ fields, Spotify/music DSP integration)
- QR code generation (server-side PNG/SVG + client component)
- Analytics/pixel tracking infrastructure
- Stripe payments for monetization

---

## Key Finding: Creative Format Constraint

**CTV overwhelmingly requires video files, not static images.** Standard in-stream ad slots (pre-roll, mid-roll) require :15 or :30 video creative in MP4/MOV format at 1920x1080. A static image with audio is technically possible (encode as a video file), but is considered low-quality for the premium CTV environment.

**However, there are workarounds:**
1. **Encode a still image + audio as a :15 or :30 MP4 video** -- most DSPs will accept this as a video file. It works, but won't look as polished.
2. **Use simple motion/animation** -- add subtle movement (slow zoom on the phone, animated QR code appearance, text fade-ins) to make a static concept feel more like TV. Tools like Vibe Studio or MNTN's QuickFrame can auto-generate this.
3. **CTV Pause Ads** -- a newer format where a static image displays when viewers pause content. This is a natural fit for still creatives, but inventory is limited and not all platforms support it.

---

## Provider Comparison

### Tier 1: Best Fit for Jovie (SMB-focused, low barriers)

| Provider | Min Spend | Self-Serve | API | Agency/Reseller | Creative Help | Notes |
|----------|-----------|------------|-----|-----------------|---------------|-------|
| **Vibe.co** | $50/day (~$500 to start) | Yes | Reporting API only (v1) | Moving AWAY from resellers ("Certified Supply") | Vibe Studio: AI generates CTV-ready ads in <10 sec | Best for manual/founder use. 3000+ advertisers, 80% first-time TV. Partners with Roku, Tubi, Peacock, Fubo |
| **MNTN** | Higher (undisclosed, but SMB-friendly) | Yes | Not publicly documented | Yes (agency model) | QuickFrame integration for creative | 97% of customers never ran TV before. SMB = 15% of revenue and growing fast. $70M+ quarterly revenue |
| **tvScientific** | Flexible, lower than MNTN | Yes (self-managed access) | Self-serve platform, API details unclear | Yes | Limited | Performance-focused (CPA model). Being acquired by Pinterest (~$300-350M). May change direction |

### Tier 2: Has API, More Complex

| Provider | Min Spend | Self-Serve | API | Agency/Reseller | Notes |
|----------|-----------|------------|-----|-----------------|-------|
| **Simpli.fi** | **No minimum spend** | Yes (Autopilot AI) | **Full campaign management API** | Yes (2000+ media teams) | Best API story. 140K campaigns/month for 40K advertisers. White-label possible via custom agreement |
| **StackAdapt** | Moderate | Yes | API available | Yes (agency DSP) | Multi-channel DSP with strong CTV. Good for agencies |

### Tier 3: Enterprise / Too Complex for Now

| Provider | Why Not (Yet) |
|----------|---------------|
| **The Trade Desk** | Enterprise-oriented, high minimums (negotiated), complex onboarding |
| **Amazon DSP** | Requires significant spend commitment, complex |
| **Tatari** | More focused on larger brands, linear+CTV convergence |
| **Madhive** | White-label DSP for local media companies -- interesting but heavy lift |
| **Roku/Samsung/LG Ads** | Direct publisher platforms, not designed for reseller use |

---

## Recommendations

### Option A: Manual / Founder Profile (Start Here)
**Use Vibe.co** to manually run CTV ads for select creator profiles.

- **Why:** $50/day minimum, self-serve dashboard, go live in 5 minutes, no contracts
- **Creative:** Use Vibe Studio to auto-generate a :15 video from a still image concept (phone + QR code + song audio)
- **Targeting:** Geo-target by city/market, target by music genre interest
- **Cost:** ~$500-1000 for a test campaign
- **Effort:** No engineering work needed. Marketing team can do this manually through Vibe's dashboard
- **Limitation:** No programmatic API for campaign creation (only reporting API), so can't automate at scale

### Option B: Programmatic / At Scale (Future)
**Use Simpli.fi** for automated CTV ad buying on behalf of customers.

- **Why:** Full campaign management API, no minimum spend, pay-as-you-go, 2000+ agency partners
- **How it works:** Jovie would integrate Simpli.fi's API to programmatically create campaigns, upload creatives, set targeting, and manage budgets per creator
- **Creative pipeline:** Auto-generate :15 MP4 videos from creator profile data (phone mockup + QR code + track audio) using server-side video generation (e.g., Remotion, FFmpeg)
- **Effort:** Significant engineering work -- API integration, creative generation pipeline, billing/payment flow
- **Contact:** Reach out to Simpli.fi sales for API access and agency/white-label terms

### Option C: Hybrid Approach
Start with **Vibe.co manually** (Option A) to validate the concept, then build toward **Simpli.fi API integration** (Option B) once you've proven ROI and demand.

---

## Creative Concept: What the Ad Would Look Like

```
+--------------------------------------------------+
|                                                  |
|   [Phone Mockup]          [QR Code]              |
|   showing artist          "Scan to listen"       |
|   profile with                                   |
|   photo, name,            jovie.fm/artistname    |
|   streaming links                                |
|                           "Never miss a release" |
|                                                  |
+--------------------------------------------------+
  Background: Artist's song playing
  Duration: :15 or :30
  Format: 1920x1080 MP4
```

**To make this work as a proper CTV ad (not just a static image):**
- Add subtle motion: phone slides in from left, QR code fades in, text animates
- Use 2-3 seconds of branding intro/outro
- Include a spoken CTA or text overlay with the URL
- Song plays throughout as background music (need licensing consideration)

---

## Open Questions for You

1. **Budget:** What's the budget range for a pilot? ($500 test vs. $5K+ real campaign)
2. **Scale:** Is this for a handful of featured/founder profiles, or do you want every creator to be able to opt-in?
3. **Music licensing:** Using the artist's own song as background audio is natural, but CTV platforms may require proof of rights. Since these are the artists' own profiles, this should be straightforward but worth confirming.
4. **Who manages it?** Should this be fully automated (engineering build) or is manual campaign management through a dashboard acceptable for now?

---

## Verification / Next Steps

1. **Immediate:** Sign up for a free Vibe.co account and explore the dashboard
2. **Test creative:** Create a sample :15 MP4 with a phone mockup + QR code + song audio using Canva, CapCut, or similar
3. **Run a pilot:** Launch a $500 test campaign on Vibe.co for one featured creator profile
4. **Measure:** Track QR code scans and profile visits using Jovie's existing analytics
5. **If successful:** Contact Simpli.fi for API access and begin scoping the programmatic integration
