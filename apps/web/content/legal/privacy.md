## Privacy Policy

_Last updated: October 2026_

This policy applies to {{LEGAL_ENTITY_NAME}} ("Jovie", "we", "us").

## Our Commitment to Privacy

Jovie exists so you can share your story with confidence. That means keeping your information safe, using it transparently, and keeping it away from data brokers. We aim for clarity, control, and fast responses whenever you need help.

## Information We Collect

### Age Requirement

Jovie is not intended for children under 13 years of age. We do not knowingly collect personal information from children under 13. If we discover that a child under 13 has provided us with personal information, we will promptly delete it. If you believe a child under 13 has provided us with personal information, please contact privacy@jov.ie.

### Account Information

When you create a profile, we collect exactly what we need to deliver the product:

- Email address and verification state (via our self-hosted Better Auth authentication)
- Artist metadata synced from Spotify (name, artist ID, profile art)
- Profile customizations such as taglines, social links, and CTA order

### Data Accessed via Google Sign-In

When you choose to sign in with Google, we access the following data through the Google OAuth API:

- **Email address**: Used to create and identify your Jovie account
- **Display name**: Used to personalize your experience and pre-fill profile fields
- **Profile picture**: Used as your default avatar (you can change this anytime)
- **Google account identifier**: Used to securely link your Google account to your Jovie profile

We request only the minimum scopes necessary for authentication. We do **not** access your Google contacts, calendar, documents, or any other Google services.

### Data Accessed via Spotify Sign-In

When you choose to sign in with Spotify, we access the following data through the Spotify OAuth API:

- **Email address**: Used to create and identify your Jovie account
- **Display name**: Used to personalize your experience and pre-fill profile fields
- **Profile picture**: Used as your default avatar (you can change this anytime)
- **Spotify user identifier**: Used to securely link your Spotify account to your Jovie profile
- **Country/region**: Used to display region-appropriate streaming links

We request only the minimum scopes necessary for authentication. We do **not** access your Spotify listening history, playlists, or playback controls unless you explicitly grant additional permissions for specific features.

### Agent Connector

Jovie has a public connector for AI assistants at https://jov.ie/api/mcp, built on the Model Context Protocol (MCP). Assistants that call Jovie, such as ChatGPT, Claude, Grok, and Meta Muse, or any other assistant that supports MCP, may use it if a user connects it. Naming an assistant here does not mean it is a partner, that it endorses Jovie, or that Jovie is listed in its directory. We do not control those assistants. What you share with an assistant is governed by that assistant's own privacy terms, not this policy.

An assistant can use the connector without a Jovie account to look up public artist identity and public release facts and to create a private, unpublished draft of an artist page, release page, and smart link. To do this we send the artist name, link, or ID, and any release link or UPC the assistant provides, to music data providers. For artist lookups these are Spotify and Apple Music. For release lookups, the link or UPC is checked against public catalogs from Apple (iTunes), Deezer, MusicBrainz, and Spotify, and, only when our fallback is switched on, a music-metadata service called MusicFetch. We make no promise about how long those providers keep what we send them; their own terms apply.

When a draft is created, we store:

- Public artist facts: artist ID, provider, name, source link, image, bio, and genres
- Public release facts for the release the assistant asked about: title, artist name, release date, artwork link, UPC, and streaming links, plus any conflicts or missing details we found
- The goal text the assistant supplied for the release launch
- Acquisition attribution fields the assistant supplied, if any: agent source, client, installation ID, referral token, session or run ID, intent, and first-touch fields (source, medium, campaign, term, content, referrer, landing path, claim ID, run ID, candidate ID, and offer version)
- A hash of the private draft token, the draft's creation and expiry times, and, once claimed, the claim time

These fields are supplied by the assistant and are not verified. At this time we store them with the draft and return them in the connector's responses. A search that does not create a draft does not create a draft record, but the attribution fields the assistant supplied are carried inside the signed draft token we return to that assistant.

#### Who can access a draft before it is claimed

An unclaimed draft is not linked to a person or a Jovie account, and it is not public. It can be read or changed through the connector only with the private draft token that was issued to the assistant. The connector also returns a separate claim link. Anyone who holds the claim link, without signing in, can open a claim page that shows the draft's artist name, image, bio, and any prepared release details, so treat the claim link as private. The claim link cannot be used to read or change the draft through the connector. The assistant that created the draft holds both the token and the link, and what it does with them is governed by its own terms. The draft table is not readable by signed-in user sessions; it is read and written by our servers.

#### Claiming a draft and who can access it afterward

A person claims a draft by opening the claim link, signing in to Jovie, reviewing the preview, and confirming. A draft can only be claimed once and only before it expires. Claiming links the artist to that person's Jovie account by matching the draft's Spotify artist ID. Only drafts created from Spotify artists can be claimed this way. We do not otherwise verify that the person is the artist. Three cases do not link the artist automatically: if the artist's Spotify following is above the threshold we set, or we cannot determine it, the person is sent to our claim verification process and the artist is not linked until we verify it; if a Jovie profile for that Spotify artist already exists, the person is sent to that profile's own claim process; and if another account has already claimed the artist, the claim is refused.

When a claim completes, we create a profile owned by that account with the draft's artist name, bio, and image, and we record these fields on the profile: the draft ID, artist ID, the agent source, client, installation ID, session or run ID, and intent that the assistant supplied, and the claim time. The referral token and first-touch fields are not copied to the profile but stay on the draft record. If a release was prepared, we create an unpublished release page and smart link under that profile. We also record claim and activation events for the profile. Claiming does not publish anything: the profile stays private, and is not shown on public pages, until the account owner publishes it from the dashboard.

To limit abuse, we limit how many requests a caller can make to the connector, and we limit the total number of requests across all callers. For lookups we apply the limit to the caller's IP address. For requests that create or change drafts, we apply it to the IP address, stored as-is, combined with a hash of the connection session ID, draft ID, and installation ID when present. Our rate-limit store keeps these keys for the length of the limit window: one minute for lookups and one hour for draft writes.

### Profiles Built Before They Are Claimed

Separately from the connector, Jovie may create an artist profile page from publicly available music data before the artist has a Jovie account. An unclaimed profile may be shown publicly or held private, depending on how and when it was created. The artist can claim it by signing in through a claim link or the profile's claim page. To ask us to remove an unclaimed profile, contact privacy@jov.ie.

### Usage Data

We automatically gather operational signals to keep Jovie reliable:

- Analytics about profile visits, clicks, and link engagement
- Device, browser, and user-agent details for rendering safely
- IP addresses (anonymized for monitoring abuse)

### Third-Party Services

Our stack uses a small set of trusted partners:

- **Neon** for our Postgres database (with strict RLS policies)
- **Stripe** for billing and customer subscriptions
- **Spotify** for artist discovery and metadata enrichment
- **Statsig** for analytics, experimentation, and feature gating
- **Anthropic** for AI-powered chat assistance and analytics insights (Claude language models)
- **Google AI** for AI-generated conversation titles (Gemini language models)
- **Vercel** for hosting, edge functions, file storage, web analytics, and AI Gateway routing
- **Sentry** for error tracking and performance monitoring
- **Resend** for transactional email delivery
- **Meta** for the Meta pixel on public artist profiles and some articles, which lets artists and Jovie show ads to people who visited. See "Your Privacy Choices" below to opt out.

We never introduce other analytics platforms or tracking cookies without explicit notice.

## How We Use Your Information

Your data powers the experience you signed up for:

- **Account creation and authentication**: Using Google or Spotify data to securely sign you in and create your account
- Delivering and personalizing your public Jovie profile
- Generating analytics to understand performance and health
- Powering the stats and messaging inside the dashboard
- Communicating essential updates or billing notices
- Running experiments safely through Statsig so new experiences stay stable

### Specific Use of Google User Data

Google user data (email, name, profile picture) is used exclusively for:

1. Creating and authenticating your Jovie account
2. Pre-filling your profile information to save you time
3. Displaying your name and avatar within the Jovie dashboard
4. Sending essential account-related communications

We do **not** use Google user data for advertising, marketing to third parties, or any purpose unrelated to providing the Jovie service.

### Specific Use of Spotify User Data

Spotify user data (email, name, profile picture, user ID) is used exclusively for:

1. Creating and authenticating your Jovie account
2. Pre-filling your profile information to save you time
3. Linking your Jovie profile to your Spotify artist presence
4. Displaying your name and avatar within the Jovie dashboard
5. Sending essential account-related communications

We do **not** use Spotify user data for advertising, marketing to third parties, or any purpose unrelated to providing the Jovie service.

## Artificial Intelligence Features

Jovie uses artificial intelligence to power optional in-app features. When you use these features, certain data is processed by third-party AI providers:

### AI Chat Assistant

When you use the Jovie AI assistant in your dashboard, your messages and context from your account and Jovie profile (including your account email address, plan and billing status, display name, bio, genres, streaming stats, and analytics summaries) are sent through the **Vercel AI Gateway** to a third-party AI model provider to generate responses. The models we currently use are **GLM** models from **Z.ai** (zai/glm-5.3 and zai/glm-5.3-flash). We do not control how long those providers keep what we send them; their own terms apply.

### Conversation Titles

When you start a new chat conversation, the first messages are sent through the Vercel AI Gateway to the same GLM model provider to generate a short descriptive title.

### AI-Powered Insights

Aggregated analytics data (profile views, click patterns, geographic distribution) may be sent through the Vercel AI Gateway to the same GLM model provider to generate personalized insights.

### What We Do NOT Send to AI Providers

- Your authentication credentials
- Your payment card details

### Your Controls

You can choose not to use AI features. The AI chat assistant is optional and does not activate unless you open it. There is no AI processing of your data outside of features you explicitly use.

## Data Sharing

We do not sell data to data brokers. We may share data with:

- Service providers who assist in operating Jovie (Neon, Stripe, Statsig, Anthropic, Google AI, Vercel, Sentry, Resend)
- Legal authorities when required by law or to protect against fraud
- Partners only when you explicitly connect a service (e.g., Spotify)
- Meta, through the Meta pixel on public artist profiles and some articles. Meta receives the page you viewed and identifiers from your browser so ads can reach past visitors. California law may treat this as "sharing" for cross-context behavioral advertising. You can opt out at any time (see "Your Privacy Choices").

### Google and Spotify Data Sharing

Data obtained from Google or Spotify is **never**:

- Sold to third parties
- Used for advertising purposes by us or third parties
- Shared with data brokers or information resellers
- Combined with other data to build user profiles for advertising

Data from Google and Spotify may only be shared with:

- **Neon**: Our database provider, where your account information is stored with encryption

All service providers are contractually bound to use your data only for providing services to Jovie and must maintain appropriate security measures.

## Data Storage and Protection

We protect your data with layered safeguards:

- **Encryption in transit**: All data transmitted between your browser and our servers uses TLS 1.3 encryption
- **Encryption at rest**: All databases and backups are encrypted using AES-256
- **Secure authentication**: OAuth flows powered by our self-hosted authentication stack (Better Auth) using industry-standard protocols (OAuth 2.0, OpenID Connect)
- **Access controls**: Role-based access controls limit who can access production systems
- **Audit logging**: All data access and modifications are logged for security monitoring
- **Regular security reviews**: We conduct periodic security assessments of our infrastructure

### Storage Locations

Your data is stored in secure data centers located in the United States, operated by our infrastructure providers (Vercel, Neon). All providers maintain SOC 2 compliance and industry-standard security certifications.

## Data Retention and Deletion

### How Long We Keep Your Data

We retain your data only as long as necessary to provide our services:

- **Account data**: Retained while your account is active and for 30 days after deletion request
- **Authentication tokens**: OAuth tokens are refreshed as needed and revoked upon account deletion
- **Analytics data**: Aggregated and anonymized after 90 days; raw data deleted after 12 months
- **Billing records**: Retained for 7 years as required by tax regulations
- **Agent connector drafts**: A draft expires 7 days after it is created. After that it can no longer be read, changed, or claimed through the connector or the claim link. Expiry is not deletion. We do not currently run any job that deletes draft records, so the draft record (artist and release facts, goal text, attribution fields, and token hash) stays in our database after it expires and after it is claimed, and deleting your Jovie account does not delete it. To have a draft record deleted, email privacy@jov.ie with the draft ID and we will delete it. Profile data created when a draft is claimed is part of your account and is deleted with it as described below

### Your Right to Delete

You have the right to request deletion of your data at any time:

1. **Self-service deletion**: Access your account settings and select "Delete Account" to initiate deletion
2. **Email request**: Send a deletion request to privacy@jov.ie
3. **Response time**: We will process deletion requests within 30 days

Upon deletion:

- Your Jovie profile is immediately unpublished and removed from public access
- Your account data is permanently deleted from our systems within 30 days
- OAuth connections to Google and Spotify are revoked
- Backup copies are purged within 90 days
- Anonymized, aggregated analytics may be retained (this data cannot identify you)

### Revoking OAuth Access

You can revoke Jovie's access to your Google or Spotify account at any time:

- **Google**: Visit [Google Account Permissions](https://myaccount.google.com/permissions) and remove Jovie
- **Spotify**: Visit [Spotify Apps](https://www.spotify.com/account/apps/) and remove Jovie

Revoking access will prevent new sign-ins with that provider but will not delete your existing Jovie account.

## Your Preferences and Controls

We build in control throughout the experience:

- **Access & correction:** Request a snapshot or update any of your stored data
- **Deletion:** Close your account and your profile data is removed on request
- **Exports:** Download your data for a standalone backup
- **Analytics opt-out:** Contact privacy@jov.ie to opt out of non-essential analytics (we rely on Statsig for core product signals)

## Your Privacy Choices

You can opt out of the Meta pixel and any other sale or sharing of your personal information for advertising:

- **Cookie bar:** choose Reject, or Manage and turn Marketing off.
- **Global Privacy Control:** if your browser sends a Global Privacy Control signal, we treat it as an opt-out and the Meta pixel does not load.
- **Email:** write to privacy@jov.ie with "Do Not Sell or Share" in the subject.

In the EU, the UK and other places where the law requires consent, the Meta pixel loads only after you accept marketing cookies.

## Google API Services Disclosure

Jovie's use and transfer of information received from Google APIs adheres to the [Google API Services User Data Policy](https://developers.google.com/terms/api-services-user-data-policy), including the Limited Use requirements.

## Spotify API Services Disclosure

Jovie's use of information received from Spotify APIs adheres to the [Spotify Developer Terms of Service](https://developer.spotify.com/terms) and [Spotify Privacy Policy](https://www.spotify.com/legal/privacy-policy/).

## Changes to This Policy

We may update this privacy policy from time to time. We will notify you of any material changes by posting the new policy on this page and updating the "Last updated" date. For significant changes affecting how we use Google or Spotify data, we will provide prominent notice and, where required, seek your consent.

## Contact Us

If you have questions about this policy, your data, or wish to exercise your rights:

- **Email:** privacy@jov.ie
- **Response time:** We aim to respond within 5 business days
