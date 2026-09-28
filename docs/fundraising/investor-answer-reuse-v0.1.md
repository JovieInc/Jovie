# Investor answer reuse v0.1

- **Issue:** JOV-6288
- **Source answer:** `company-identity-and-audience@jov-6261-2026-09-17`
- **Approval basis:** canonical public company identity and founder-directed shared language contract
- **Content revision:** 2026-09-28
- **GBrain:** unavailable for this run; repository canon and current source were used
- **Distribution state:** no publication, send, or paid-promotion approval

This pack adapts one approved answer into three useful drafts. It does not publish a blog post, change the investor deck, send a message, start promotion, or commercialize an Investor OS product. The executable usage map is `apps/web/data/investorAnswerReuseCopy.ts`; validation and invalidation live in `apps/web/lib/investors/answer-reuse.ts`.

## Usage map

| Derivative | Audience and purpose | Channel | Claim revisions | Disclosure | Owner | Review | Intended use and next step |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `company-identity-investor-slide` | Investors evaluating market scope; explain the shared product boundary and current starting point | Investor deck | `company-identity-definition@jov-6261-2026-09-17`; `public-profile-availability@jov-6216-public-profile-2026-09-17` | Private investor | Tim White | Draft | Candidate for the next reviewed deck revision; offer the current walkthrough when implementation depth is the concern |
| `company-identity-customer-explanation` | People deciding whether a Jovie profile fits their work; explain immediate value without investor framing | Existing blog/editorial path | Same claim revisions | Public candidate | Tim White | Draft | Candidate customer-education article; invite the reader to find and claim their public profile |
| `company-identity-recruiting-narrative` | Engineering and product candidates; explain the product constraint new hires will preserve | Recruiting narrative | Same claim revisions | Internal | Tim White | Draft | Candidate role-brief and interview block; discuss one shared system and one audience-specific job |

No founder post or demo outline was created because this source answer has no scheduled use for those formats. Draft status grants no permission for public publishing, email or social sending, or paid promotion.

## Editorial review

- **Truth:** the definition is read from `COMPANY_IDENTITY`; public-profile availability remains a separate typed claim read from the JOV-6216 capability record. No pricing, measured outcome, or roadmap statement is implied.
- **Audience treatment:** the investor slide explains scope, the customer draft explains what the reader can do, and the recruiting draft explains an implementation constraint. They share claim IDs without sharing the same pitch.
- **Disclosure:** public projection rejects private or internal claims, private questions, private identities, and non-public claim text. The candidate includes no customer example.
- **Copy floor:** validation runs the canonical `@jovie/copy` register for every derivative and separately rejects search or agent ranking promises.
- **Discovery:** an approved and separately authorized public derivative projects one content record into editorial, sitemap, and agent-readable representations with one canonical path and content revision. Drafts and rejected claims project nothing.
- **Measurement:** intended success is customer comprehension, a qualified investor response, or candidate progression. Usage receipts remain empty until an observable use occurs; impressions and generated-asset count are not success evidence.

The review result is **prepared drafts, no distribution authority**. Exact derivative approval remains distinct from source-answer approval and from each distribution channel's approval.

## Correction behavior

A source revision or evidence change selects derivatives by their exact claim bindings, changes their review state to `needs-review`, revokes granted distribution approvals, and records a history event. A published derivative becomes `correction-required` and returns an action for the existing release process. Withdrawal or a privacy-sensitive correction returns a privacy-safe removal action. Until correction lands, stale content is omitted from editorial, sitemap, and agent projections.
