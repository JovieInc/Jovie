# Jovie Product Capabilities

This document is the canonical rich description of every Jovie feature. AI agents should reference this when generating marketing copy, support responses, onboarding content, or user-facing documentation.

For the developer-focused quick-reference table (status, flags, gates), see `docs/FEATURE_REGISTRY.md`.

## How to Read This Document

Each feature has a consistent schema:
- **One-line:** Single sentence summary for marketing and quick reference
- **Plan:** Which subscription tier(s) include this feature
- **Problem it solves:** The user pain point this addresses
- **How it works:** Brief description of mechanics
- **Key benefits:** What the user gains
- **Dashboard route:** Where the user accesses this in the app
- **Docs page:** Corresponding page on docs.jov.ie

Plan tiers: **Free** ($0/mo), **Founding Member** ($12/mo, locked in for life), **Pro** ($39/mo or $348/year), **Growth** ($99/mo or $948/year). Founding Member has identical capabilities to Pro.

---

## Smart Links & Releases

### Unlimited Smart Links
- **One-line:** A single link per release that routes each fan to their preferred streaming platform.
- **Plan:** Free+
- **Problem it solves:** Artists share music across 10+ platforms but can only put one link in their bio.
- **How it works:** Jovie creates a smart link for every release. When a fan clicks it, the link detects their device, preferred platform, and location, then routes them to the right streaming service. Links are powered by MusicFetch for automatic platform detection.
- **Key benefits:** Higher conversion from clicks to streams, one link for all platforms, no manual per-platform linking
- **Dashboard route:** /app/dashboard/links
- **Docs page:** /docs/features/releases

### Auto-Sync from Spotify
- **One-line:** Connect Spotify and Jovie imports your entire discography with smart links for every release.
- **Plan:** Free+
- **Problem it solves:** Manual release entry is tedious and error-prone. Artists want their full catalog online immediately.
- **How it works:** After connecting Spotify, Jovie imports all releases including artwork, track listings, ISRCs, and automatically creates smart links with listen buttons for every available DSP.
- **Key benefits:** Full catalog live in seconds, automatic DSP link detection, zero manual data entry
- **Dashboard route:** /app/dashboard/releases
- **Docs page:** /docs/features/releases

### Smart Deep Links
- **One-line:** Links open the native streaming app (Spotify, Apple Music, etc.) instead of a web page.
- **Plan:** Free+
- **Problem it solves:** Web-based links add friction. Fans have to navigate from browser to app to start listening.
- **How it works:** When a fan clicks a smart link, Jovie detects their device and attempts to open the release directly in the native streaming app. Falls back to web if the app isn't installed.
- **Key benefits:** Reduced friction, faster path to streaming, higher listen completion rates
- **Dashboard route:** /app/dashboard/links
- **Docs page:** /docs/features/releases

### Edit & Customize Smart Links
- **One-line:** Customize the appearance, platform ordering, and CTAs on your smart link pages.
- **Plan:** Free+
- **Problem it solves:** Different audiences have different platform preferences. Artists need control over how their links look and behave.
- **How it works:** From the dashboard, artists can reorder platform buttons, customize call-to-action text, and control which platforms appear on each smart link page.
- **Key benefits:** Brand-consistent link pages, optimized platform ordering for target audience
- **Dashboard route:** /app/dashboard/links
- **Docs page:** /docs/features/releases

### Release Pages with Listen Links per DSP
- **One-line:** Each release gets a public page with album artwork, track listing, and listen buttons for every streaming platform.
- **Plan:** Free+
- **Problem it solves:** Fans need a single destination to find a release on their preferred platform.
- **How it works:** Every release on Jovie has a dedicated public page showing artwork, track listing with durations, and buttons linking to every available streaming platform.
- **Key benefits:** Professional release presentation, every DSP represented, shareable as a single URL
- **Dashboard route:** /app/dashboard/releases
- **Docs page:** /docs/features/releases

### Short Link Redirects
- **One-line:** Compact URLs via jov.ie/r/{slug} for sharing in social media bios and posts.
- **Plan:** Free+
- **Problem it solves:** Long URLs look unprofessional and get truncated in social media posts.
- **How it works:** Every smart link gets a shortened version at jov.ie/r/{slug}. The short link redirects to the full smart link page.
- **Key benefits:** Clean sharing in character-limited contexts, trackable short URLs
- **Dashboard route:** /app/dashboard/links
- **Docs page:** /docs/features/releases

### Vanity URLs
- **One-line:** Custom slugs for releases and content (e.g., jov.ie/{username}/my-album).
- **Plan:** Free+
- **Problem it solves:** Auto-generated slugs aren't memorable or brandable.
- **How it works:** Artists can set custom slugs for any release, creating clean, memorable URLs for marketing.
- **Key benefits:** Memorable URLs for marketing campaigns, professional appearance
- **Dashboard route:** /app/dashboard/links
- **Docs page:** /docs/features/releases

### Auto DSP Detection & Linking
- **One-line:** Jovie automatically finds your releases across all major streaming platforms and creates the links.
- **Plan:** Free+
- **Problem it solves:** Manually finding and adding links for each platform across every release is time-consuming and error-prone.
- **How it works:** MusicFetch integration scans all major DSPs to find matching releases and populates listening links automatically. Supports Spotify, Apple Music, YouTube Music, Amazon Music, Tidal, Deezer, and SoundCloud.
- **Key benefits:** Zero manual link entry, comprehensive platform coverage, automatic updates when new platforms are matched
- **Dashboard route:** /app/dashboard/releases
- **Docs page:** /docs/features/releases

### Manual Release Creation
- **One-line:** Create releases manually for content not yet on streaming platforms.
- **Plan:** Free+
- **Problem it solves:** Pre-release music or non-DSP content needs a home before it hits streaming platforms.
- **How it works:** Artists create a release by entering core metadata first (title, date, artwork, genres, explicit flag), then land in the release drawer to add and manage platform links.
- **Key benefits:** Covers content gaps before DSP availability, supports non-music content, keeps link editing in the same drawer used after creation
- **Dashboard route:** /app/dashboard/releases
- **Docs page:** /docs/features/releases

### Pre-Release & Countdown Pages
- **One-line:** Landing pages for upcoming releases with countdown timers and pre-save buttons.
- **Plan:** Pro+
- **Problem it solves:** Artists need to build anticipation and capture interest before a release drops.
- **How it works:** Create a landing page for an upcoming release with a countdown timer to the release date. Fans can pre-save on Spotify and Apple Music. Jovie handles the OAuth flow and automatically saves the release on launch day.
- **Key benefits:** Pre-release hype building, pre-save capture, automatic release-day saves
- **Dashboard route:** /app/dashboard/releases
- **Docs page:** /docs/features/releases

### "Use This Sound" Pages
- **One-line:** Landing pages that let influencers create short-form video content with an artist's track on TikTok, Instagram Reels, and YouTube Shorts.
- **Plan:** Free+
- **Problem it solves:** Artists want influencers and content creators to use their songs in short-form video, but there's no easy way to share the right links for each platform.
- **How it works:** Each release has a sounds page at /{username}/{slug}/sounds showing branded buttons: "Use sound on TikTok", "Use audio on Instagram", and "Use sound on YouTube". Links go directly to the platform's sound/audio page for content creation. Video provider links are populated automatically by MusicFetch. If no video links exist, the page redirects to the main smart link.
- **Key benefits:** Easy influencer sharing, drives UGC content creation, one link for all short-form video platforms
- **Dashboard route:** /app/dashboard/releases
- **Docs page:** /docs/features/releases

### Release Notifications
- **One-line:** Email fans when you drop a new release, with configurable preview and release-day notifications.
- **Plan:** Free+
- **Problem it solves:** Fans who subscribed want to know when new music drops. Manual notifications are easy to forget.
- **How it works:** Configure per-release notifications: preview (before drop) and release-day alerts. Jovie sends emails to all subscribers with a smart link to listen.
- **Key benefits:** Automated fan communication, higher day-one streams, configurable per release
- **Dashboard route:** /app/settings/notifications
- **Docs page:** /docs/features/audience

---

## Artist Profile

### Public Profile Page
- **One-line:** A smart link-in-bio at jov.ie/{username} that adapts to each visitor.
- **Plan:** Free+
- **Problem it solves:** Artists need a single destination for all their online activity — music, social, shows, merch.
- **How it works:** ISR-backed public page showing display name, avatar, bio, social links, latest releases with smart links, and tour dates. Includes sub-pages: /listen, /subscribe, /contact, /about, /tour, /tip.
- **Key benefits:** One URL for everything, professional appearance, adaptive to visitor intent
- **Dashboard route:** /app/settings/profile
- **Docs page:** /docs/features/profile

### Artist Bio & Social Links
- **One-line:** Rich biography and social media links, auto-suggested from connected DSPs.
- **Plan:** Free+
- **Problem it solves:** Artists maintain profiles on 10+ platforms. Keeping social links updated everywhere is tedious.
- **How it works:** Bio supports rich text. Social links for Spotify, Apple Music, YouTube, TikTok, Instagram, Twitter, Facebook, Threads, SoundCloud, Bandcamp, and more are auto-suggested from DSP profiles and manually editable.
- **Key benefits:** Auto-populated from DSPs, all platforms in one place, easy to maintain
- **Dashboard route:** /app/settings/profile
- **Docs page:** /docs/features/profile

### Subscribe / Follow Page
- **One-line:** Dedicated page where fans opt in for email updates, building the artist's owned audience.
- **Plan:** Free+
- **Problem it solves:** Artists depend on platform algorithms to reach fans. Owned contact lists give direct access.
- **How it works:** Public page at /{username}/subscribe with an email capture form. Subscribers are added to the artist's audience database with engagement tracking.
- **Key benefits:** Builds owned audience, captures fan identity, enables direct communication
- **Dashboard route:** /app/dashboard/audience
- **Docs page:** /docs/features/profile

### Contact Page
- **One-line:** Professional contact form for booking inquiries, press, and business.
- **Plan:** Free+
- **Problem it solves:** Artists need a professional way to receive business inquiries separate from fan interactions.
- **How it works:** Public page at /{username}/contact with a structured contact form.
- **Key benefits:** Professional appearance, organized inquiries, separate from fan communication
- **Dashboard route:** /app/settings/profile
- **Docs page:** /docs/features/profile

### About Page
- **One-line:** Extended biography and background at /{username}/about.
- **Plan:** Free+
- **Problem it solves:** Artist bios on profile pages are brief. Some visitors want the full story.
- **How it works:** A dedicated page for long-form artist biography and background information.
- **Key benefits:** Full storytelling space, SEO benefits, professional depth
- **Dashboard route:** /app/settings/profile
- **Docs page:** /docs/features/profile

### Tour Dates (Bandsintown)
- **One-line:** Upcoming shows synced from Bandsintown with venue, date, and ticket links.
- **Plan:** Free+
- **Problem it solves:** Tour dates are scattered across ticketing sites. Fans want to see all upcoming shows in one place.
- **How it works:** Connect your Bandsintown artist name in Settings > Touring. Jovie syncs tour dates automatically, displaying venue, city, date, time, and ticket purchase links at /{username}/tour. Includes lat/long for geographic proximity features.
- **Key benefits:** Automatic sync, ticket link integration, geographic proximity, dedicated tour page
- **Dashboard route:** /app/settings/touring
- **Docs page:** /docs/features/profile/tour-dates

### Verified Badge
- **One-line:** A verification badge on artist profiles that signals legitimacy to fans, bookers, and curators.
- **Plan:** Pro+
- **Problem it solves:** In a crowded landscape, artists need signals of authenticity and professionalism.
- **How it works:** Pro and Growth plan subscribers automatically receive a verified badge that appears next to their display name on their public profile. Visible to all visitors.
- **Key benefits:** Trust signal, professional appearance, differentiation from unverified profiles
- **Dashboard route:** /app/settings/billing (upgrade to unlock)
- **Docs page:** /docs/features/profile/verified-badge

### Remove Jovie Branding
- **One-line:** Remove the "Powered by Jovie" footer from public pages for a fully white-labeled experience.
- **Plan:** Pro+
- **Problem it solves:** Artists with established brands want their profile to look fully their own.
- **How it works:** Toggle in dashboard settings removes the Jovie branding footer from all public-facing pages.
- **Key benefits:** White-labeled appearance, professional brand presentation
- **Dashboard route:** /app/settings/branding
- **Docs page:** /docs/features/profile

---

## Analytics & Insights

### Click & Visit Tracking
- **One-line:** Every profile view, source scan, link click, and fan interaction tracked with evidence-safe activity language.
- **Plan:** Free+
- **Problem it solves:** Artists have no visibility into who visits their link pages or what they do there.
- **How it works:** All interactions are tracked server-side as structured audience actions: profile views, QR or short-link source scans, smart link clicks by platform, subscribe form submissions, and tip events. Each event captures device type, IP-based location (city/country), referrer, UTM parameters, source group/link identity, and an evidence-safe verb such as "Checked Out" instead of overclaiming a listen or watch. Bot detection filters noise.
- **Key benefits:** Complete visibility into fan behavior, source attribution, clean data (bot-filtered), and activity sentences creators can understand quickly
- **Dashboard route:** /app/dashboard/analytics
- **Docs page:** /docs/features/analytics

### Basic Analytics (30-Day Retention)
- **One-line:** 30 days of analytics data with profile views, link clicks, audience growth, and top referrers.
- **Plan:** Free
- **Problem it solves:** Artists need basic performance visibility without paying for analytics tools.
- **How it works:** Dashboard overview showing key metrics for the last 30 days: total profile views, link clicks by platform, audience growth trend, and top traffic referrers.
- **Key benefits:** Free performance visibility, essential metrics, clean dashboard
- **Dashboard route:** /app/dashboard/analytics
- **Docs page:** /docs/features/analytics

### Extended Analytics (90-Day Retention)
- **One-line:** 90 days of analytics data retention for deeper trend analysis.
- **Plan:** Pro+
- **Problem it solves:** 30-day windows are too short to spot seasonal trends or measure campaign impact.
- **How it works:** All analytics data retained for 90 days, enabling quarter-over-quarter comparison.
- **Key benefits:** Trend analysis, campaign impact measurement, seasonal pattern detection
- **Dashboard route:** /app/dashboard/analytics
- **Docs page:** /docs/features/analytics

### Full Analytics (365-Day Retention)
- **One-line:** One full year of analytics data retention.
- **Plan:** Growth
- **Problem it solves:** Serious artists need year-over-year comparisons and long-term trend data.
- **How it works:** All analytics data retained for 365 days.
- **Key benefits:** Year-over-year comparison, long-term strategy planning
- **Dashboard route:** /app/dashboard/analytics
- **Docs page:** /docs/features/analytics

### Advanced Analytics & Geographic Insights
- **One-line:** Deep geographic, device, and platform breakdowns of your audience.
- **Plan:** Pro+
- **Problem it solves:** Knowing total clicks isn't enough. Artists need to understand where fans are and how they behave.
- **How it works:** Country and city-level traffic breakdowns, device type distribution (mobile/desktop, iOS/Android), browser and OS analytics, platform preference data. Helps identify emerging markets and touring opportunities.
- **Key benefits:** Tour routing insights, market identification, audience segmentation by geography
- **Dashboard route:** /app/dashboard/analytics
- **Docs page:** /docs/features/analytics

### Self-Traffic Filtering
- **One-line:** Exclude your own visits from analytics so you see real fan data only.
- **Plan:** Pro+
- **Problem it solves:** Artists checking their own profile inflate their metrics and muddy the data.
- **How it works:** Toggle that filters the artist's own visits from all analytics dashboards and reports.
- **Key benefits:** Clean data, accurate fan metrics, reliable trend analysis
- **Dashboard route:** /app/dashboard/analytics
- **Docs page:** /docs/features/analytics

### AI-Powered Insights
- **One-line:** AI analyzes your data and generates actionable insights about engagement, geography, audience quality, and momentum.
- **Plan:** Pro+
- **Problem it solves:** Raw data is hard to interpret. Artists need actionable recommendations, not just charts.
- **How it works:** Jovie's AI runs analysis on profile data, click events, audience demographics, and engagement patterns. Generates prioritized insights (high/medium/low) across categories: engagement, geographic, device, audience quality, and momentum. Insights can be dismissed after review.
- **Key benefits:** Actionable recommendations, pattern detection humans miss, prioritized by impact
- **Dashboard route:** /app/dashboard/insights
- **Docs page:** /docs/features/analytics/ai-insights

### Ad Pixel Tracking
- **One-line:** Install Facebook, Google Analytics, and TikTok pixels on Jovie pages for retargeting.
- **Plan:** Pro+
- **Problem it solves:** Profile visitors disappear after leaving. Pixels enable retargeting them with ads.
- **How it works:** Add pixel IDs in Settings > Ad Pixels. Jovie fires page view and click events on all public pages. Supports Facebook Pixel with Conversions API (CAPI) for server-side reliability, Google Analytics measurement IDs, and TikTok Pixel. Consent-aware, with UTM parameter forwarding.
- **Key benefits:** Retargeting capability, server-side tracking (Facebook CAPI), multi-platform support
- **Dashboard route:** /app/settings/ad-pixels
- **Docs page:** /docs/features/analytics/ad-pixels

---

## Audience & Growth

### Contact / Subscriber Capture
- **One-line:** Automatically build your owned fan list from every profile interaction.
- **Plan:** Free (100 contacts), Pro+ (unlimited)
- **Problem it solves:** Profile traffic vanishes into streaming apps. Artists need to capture fan identity for direct communication.
- **How it works:** Every visit captures anonymous data (device, location, referrer). Fans who subscribe provide email, building the owned contact list. Each visitor gets intent scoring (low/medium/high) and engagement scoring based on behavior. Free tier: 100 contacts. Pro+: unlimited.
- **Key benefits:** Owned audience, automatic collection, engagement scoring, intent classification
- **Dashboard route:** /app/dashboard/audience
- **Docs page:** /docs/features/audience

### Contact Export
- **One-line:** Export your contact list as CSV for use in email marketing tools, CRMs, or spreadsheets.
- **Plan:** Pro+
- **Problem it solves:** Contact data locked in one platform is less valuable than portable data.
- **How it works:** One-click CSV export of the full contact list from the dashboard.
- **Key benefits:** Data portability, integration with external tools, backup capability
- **Dashboard route:** /app/dashboard/contacts
- **Docs page:** /docs/features/audience/crm

### Fan CRM
- **One-line:** Full contact management with roles, channels, territories, and preferred contact methods.
- **Plan:** Pro+
- **Problem it solves:** Managing industry contacts (bookers, agents, press) alongside fan contacts requires organization.
- **How it works:** Contact management dashboard with role tagging (manager, booking agent, distributor, publicist), communication channels (email, phone, DM), territory assignment for regional management, and preferred contact method tracking.
- **Key benefits:** Organized professional network, territory-based management, relationship tracking
- **Dashboard route:** /app/dashboard/contacts
- **Docs page:** /docs/features/audience/crm

### Automated Follow-Ups
- **One-line:** Automatic follow-up emails to fans based on behavior.
- **Plan:** Growth (Coming Soon)
- **Problem it solves:** Manual follow-up is inconsistent and time-consuming.
- **How it works:** Coming soon. Will enable automated email sequences triggered by fan behavior.
- **Key benefits:** Consistent fan engagement, behavior-triggered communication
- **Dashboard route:** TBD
- **Docs page:** /docs/features/audience

### Catalog Monitoring
- **One-line:** Monitor your catalog across DSPs for takedowns, new placements, and changes.
- **Plan:** Growth (Coming Soon)
- **Problem it solves:** Artists don't know when their music is removed or added to playlists on DSPs.
- **How it works:** Coming soon. Will monitor catalog presence across streaming platforms.
- **Key benefits:** Awareness of catalog changes, takedown alerts, placement tracking
- **Dashboard route:** TBD
- **Docs page:** /docs/features/audience

---

## Monetization

### Tips & Payments
- **One-line:** Fans tip artists directly from profile pages via Venmo.
- **Plan:** Pro+
- **Problem it solves:** Live show energy and online appreciation have no easy monetization path.
- **How it works:** Dedicated tip page at /{username}/tip. Fans choose preset or custom amounts with optional messages. Currently via Venmo, with Stripe Connect coming. QR code at shows opens the fastest tip flow. All transactions tracked in earnings dashboard.
- **Key benefits:** Direct monetization, QR code for live shows, fan messages with tips
- **Dashboard route:** /app/dashboard/tipping
- **Docs page:** /docs/features/tips

### Earnings Dashboard
- **One-line:** Track all incoming tips, payment history, and payout status.
- **Plan:** Pro+
- **Problem it solves:** Artists need visibility into their tip revenue and payout timing.
- **How it works:** Dashboard view showing total tips received, individual transaction history with fan messages, and payout status.
- **Key benefits:** Revenue visibility, transaction history, payout tracking
- **Dashboard route:** /app/dashboard/earnings
- **Docs page:** /docs/features/tips

---

## AI Assistant

### AI Career Assistant
- **One-line:** An AI assistant that helps artists with career decisions, profile optimization, release strategy, and growth recommendations.
- **Plan:** Free (25 msgs/day), Pro (100 msgs/day), Growth (500 msgs/day)
- **Problem it solves:** Independent artists lack a manager or team to help with career decisions and strategy.
- **How it works:** Conversational AI interface that references the artist's profile data, analytics, and audience to give personalized advice. Supports multi-turn conversations with saved history. Can interpret analytics in plain language, suggest profile improvements, and plan release strategies. **This is NOT a fan-messaging tool** — it's a career assistant for the artist.
- **Key benefits:** On-demand career advice, data-informed recommendations, personalized to artist context
- **Dashboard route:** /app/chat
- **Docs page:** /docs/features/chat-ai

### AI Tool Use
- **One-line:** The AI assistant can make changes to your profile, create releases, and execute suggestions directly.
- **Plan:** Free+ (all plans)
- **Problem it solves:** Getting advice is one thing; implementing it is another. Tool use bridges the gap.
- **How it works:** When the artist approves a suggestion, the AI uses tool-calling capabilities to update the bio, add social links, create releases, and make other profile changes directly through the conversation. All changes are audited with field-level tracking.
- **Key benefits:** Advice + execution in one flow, audited changes, artist approval required
- **Dashboard route:** /app/chat
- **Docs page:** /docs/features/chat-ai

---

## Integrations

### Retargeting Ads (Meta/Google/TikTok)
- **One-line:** Forward pixel events to Meta, Google, and TikTok for building retargeting audiences.
- **Plan:** Pro+
- **Problem it solves:** Profile visitors are warm leads, but without retargeting, artists can't reach them again.
- **How it works:** Configure Facebook (with CAPI), Google Analytics, and TikTok pixels. Jovie forwards page view, click, form submission, and purchase events. Supports consent management, session tracking, UTM capture, and visitor IP forwarding for ad optimization.
- **Key benefits:** Warm audience retargeting, server-side reliability (Facebook CAPI), multi-platform
- **Dashboard route:** /app/settings/retargeting-ads
- **Docs page:** /docs/features/retargeting-ads

### Bandsintown Tour Dates
- **One-line:** Automatic tour date sync from Bandsintown to your Jovie profile.
- **Plan:** Free+
- **Problem it solves:** Manually entering tour dates on multiple platforms is tedious and error-prone.
- **How it works:** Enter your Bandsintown artist name in Settings > Touring. Jovie syncs automatically. New/updated/cancelled dates reflect on your profile within minutes.
- **Key benefits:** Automatic sync, no duplicate data entry, always up to date
- **Dashboard route:** /app/settings/touring
- **Docs page:** /docs/features/profile/tour-dates

### Spotify OAuth
- **One-line:** Sign in to Jovie with your Spotify account.
- **Plan:** Flag-gated (feature_spotify_oauth, in rollout)
- **Problem it solves:** Reduces signup friction for artists who are already on Spotify.
- **How it works:** OAuth sign-in method available in the auth method selector. Currently in controlled rollout via Statsig gate.
- **Key benefits:** Faster onboarding, one-click sign-in for Spotify users
- **Dashboard route:** N/A (auth flow)
- **Docs page:** N/A

---

## Coming Soon (Growth Tier)

### A/B Testing
- **One-line:** Smart link variant testing to optimize conversion.
- **Plan:** Growth (Planned)
- **Problem it solves:** Artists don't know which link page layouts, CTAs, or platform orderings convert best.
- **How it works:** Coming soon. Will enable split testing of smart link page variants.
- **Key benefits:** Data-driven optimization, conversion rate improvement

### Automated Follow-Ups
- **One-line:** Auto-follow-up emails to fans based on behavior triggers.
- **Plan:** Growth (Planned)
- **Problem it solves:** Manual follow-up is inconsistent. Behavior-triggered emails convert better.
- **How it works:** Coming soon. Automated email sequences triggered by fan actions.
- **Key benefits:** Consistent engagement, higher conversion from triggered messages

### Catalog Monitoring
- **One-line:** Monitor your catalog across DSPs for changes, takedowns, and new placements.
- **Plan:** Growth (Planned)
- **Problem it solves:** Artists lack visibility into their catalog status across streaming platforms.
- **How it works:** Coming soon. Continuous monitoring of catalog presence across DSPs.
- **Key benefits:** Proactive awareness, takedown alerts, placement discovery

---

## Support

### Email Support
- **One-line:** Support via email at support@jov.ie.
- **Plan:** Free+
- **Docs page:** N/A

### Priority Support
- **One-line:** Faster response times for paying customers.
- **Plan:** Pro+
- **Docs page:** N/A

---

## Related Documents

- **Feature status and flags:** `docs/FEATURE_REGISTRY.md`
- **Statsig gate documentation:** `docs/STATSIG_FEATURE_GATES.md`
- **Entitlements registry (code):** `apps/web/lib/entitlements/registry.ts`
- **Pricing strategy:** `docs/company/PRICING-STRATEGY.md`
- **User-facing docs:** `apps/docs/` (live at docs.jov.ie)
