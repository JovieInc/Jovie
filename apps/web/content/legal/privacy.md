# Privacy Policy

_Last updated: December 2024_

This policy applies to {{LEGAL_ENTITY_NAME}} ("Jovie", "we", "us").

## Our Commitment to Privacy

Jovie exists so musicians can share their story with confidence. That means keeping your information safe, using it transparently, and never selling it. We aim for clarity, control, and fast responses whenever you need help.

## Information We Collect

### Account Information

When you create a profile, we collect exactly what we need to deliver the product:

- Email address and verification state (via Clerk authentication)
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

### Usage Data

We automatically gather operational signals to keep Jovie reliable:

- Analytics about profile visits, clicks, and link engagement
- Device, browser, and user-agent details for rendering safely
- IP addresses (anonymized for monitoring abuse)

### Third-Party Services

Our stack uses a small set of trusted partners:

- **Clerk** for authentication, identity, and session security
- **Neon** for our Postgres database (with strict RLS policies)
- **Stripe** for billing and customer subscriptions
- **Spotify** for artist discovery and metadata enrichment
- **Statsig** for analytics, experimentation, and feature gating

We never introduce other analytics platforms or tracking cookies without explicit notice.

## How We Use Your Information

Your data powers the experience you signed up for:

- **Account creation and authentication**: Using Google or Spotify data to securely sign you in and create your account
- Delivering and personalizing your public artist profile
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

## Data Sharing

We do not sell data to anyone. We may share data with:

- Service providers who assist in operating Jovie (Clerk, Neon, Stripe, Statsig)
- Legal authorities when required by law or to protect against fraud
- Partners only when you explicitly connect a service (e.g., Spotify)

### Google and Spotify Data Sharing

Data obtained from Google or Spotify is **never**:

- Sold to third parties
- Used for advertising purposes by us or third parties
- Shared with data brokers or information resellers
- Combined with other data to build user profiles for advertising

Data from Google and Spotify may only be shared with:

- **Clerk**: Our authentication provider, which processes OAuth tokens securely
- **Neon**: Our database provider, where your account information is stored with encryption

All service providers are contractually bound to use your data only for providing services to Jovie and must maintain appropriate security measures.

## Data Storage and Protection

We protect your data with layered safeguards:

- **Encryption in transit**: All data transmitted between your browser and our servers uses TLS 1.3 encryption
- **Encryption at rest**: All databases and backups are encrypted using AES-256
- **Secure authentication**: OAuth flows powered by Clerk using industry-standard protocols (OAuth 2.0, OpenID Connect)
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
