# Jovie language and landing-page contract

Owner: JOV-6432 under JOV-4491. Founder direction: September 17, 2026.

## Decision

Jovie has one shared product vocabulary. Pages explain the supported job in the reader's context. A person can be an artist, founder, author, creator, and independent expert at the same time. Use **you** to address the person and **Profile** to name the shared public object.

Preserve the approved homepage headline and visual composition. COMPANY_IDENTITY remains the general company identity source. This document extends the existing marketing contracts; it creates no competing route, capability, offer, consent, or design registry.

## Vocabulary

| Meaning | Shared language | Precise specialist language |
| --- | --- | --- |
| Public representation | Profile; public profile when disambiguation is useful | Artist profile on a music-specific surface |
| Profile fields | Name, Bio, Links | Stage name only where that is the actual field |
| Known people | Contacts | Fans, collaborators, prospects, or customers only when the relationship is known |
| Permissioned update recipients | Subscribers | Fans or readers in an explicitly relevant context |
| Anonymous readership and attention | Visitors; audience for the collective | Listeners where listening is actually measured |
| Information someone elects to receive | Updates | Music release updates, product updates, reader updates |
| Published work | Work when an umbrella is necessary | Music, projects, writing, videos, books when known |
| Connected services | Connections | Spotify, Apple Music, LinkedIn, and other supported service names |
| Actions | View profile, Edit profile, Share profile | Listen, Get tickets, Visit website, Get in touch, with real destinations |

Contacts, subscribers, followers, fans, leads, and customers retain distinct meanings. Neither copy nor a role switch creates consent, commercial intent, payment evidence, or ownership. Avoid claims of owning people. Name the permissioned relationship or list instead.

Keep existing API fields, CLI commands, identifiers, schema types, artist names, third-party product names, quotations, and historical editorial content accurate. Changing a shared label does not authorize data migrations or a mechanical artist-to-creator replacement.

## Context and truth

Resolve terminology from the exact object or API, the current supported job, and the page or section context. Unknown context uses shared language. A campaign parameter may preserve acquisition context; it cannot establish identity, entitlements, publication eligibility, or permission to contact someone. Let people correct inferred details and change their current goal without changing identity.

The existing pageContracts.ts now carries copyScope for its registered pages: shared, music, video, or editorial. This is an authoring declaration, exposed by the existing hidden page markers for inspection. It does not certify rendered copy, feature maturity, publication, or a visitor's role. The complete route census continues to come from MARKETING_ROUTE_MANIFEST; these authoring contracts cover a subset of that census.

A shared page may include a clearly introduced music example. Scope the example locally and keep surrounding shared controls neutral. Editorial and comparison terms follow the actual subject and evidence. Never enforce a site-wide ban on the word artist.

Every customer claim must resolve to supported capability and current offer evidence. Audience context can change the example, emphasis, and intended outcome. It cannot make an unavailable workflow available. Preserve the existing feature-maturity and offer contracts, including limited-access and request-access distinctions.

## Landing-page families

This matrix defines migration and review responsibilities. It is not a second executable route inventory. Proposed destinations remain subject to JOV-4491 and the publication contract; listing a path here does not publish or reserve it.

| Family | Reader's question and language | Required treatment |
| --- | --- | --- |
| Homepage | What is Jovie, and what can I do next? Shared identity and Profile | Preserve locked hero copy, search behavior, geometry, and approved evidence. General navigation must not define the entire product as music. |
| Product overview, proposed /product | What does the shared product actually do? | Use supported presence, relationship, and growth capabilities with concrete examples. Product cards carry product truth; sections make useful arguments; the page composes them. |
| Solutions hub, proposed /solutions | Is there a useful workflow for my goal? | Show only substantive, publication-eligible paths. Avoid placeholders and arbitrary equal quotas for audiences. |
| Artists solution and /artist-profiles | How does this help my music and fan relationships? | Retain music, releases, shows, DSPs, and fan language. Distinguish the role-specific solution from the profile-feature explanation; avoid duplicate pages with only a different headline. |
| Founder solution, proposed /solutions/founders | How do people understand what I am building and reach me? | Use an actual founder example, relevant work and links, a supported next step, and appropriate proof. Do not promise CRM, automatic prospecting, booking, or qualified leads solely because a profile exists. |
| Author, creator, independent-expert solutions | What supported job fits this work? | Publish when the example, workflow, offer, and proof are useful. Each page earns its place with a distinct job. Keep unsupported interest capture visibly separate from a purchasable service. |
| Music tools: notifications, pay, merch, launch | Can this specific music workflow help me? | Keep domain-specific nouns and availability. Payments require payment evidence; opt-ins require consent. Music release tools do not become product-launch tools through relabeling. |
| YouTube thumbnails and voice | Can I complete this specific media task? | Match copy to the demonstrated media workflow, access state, and consent requirements. Preserve existing noindex/private states until their own publication conditions pass. |
| Pricing, /launch/pricing, checkout and pricing teasers | What can I buy, receive, and cancel? | Derive price, billing period, eligibility, included features, and trial terms from the single billing/offer source. Label music-specific features explicitly. No separate founder pricing or invented entitlements. |
| /new and historical campaign pages | Does this campaign still have a useful, truthful purpose? | Keep a bounded specialist purpose or retire through the existing alias owner. Preserve inbound intent. Never redirect every old page to a generic homepage. |
| Comparison and alternative detail pages | Which option fits my job? | Preserve search intent and current sourced competitor facts. Use the audience relevant to that comparison. The existence of detail routes does not make /compare or /alternatives valid index pages. |
| About, investors, pitch and brand | What is this company and why should I trust it? | Shared company identity. Preserve factual music background in the founder biography. Separate traction, ambition, examples, and customer proof. |
| Blog, categories, engineering and changelog | What does this specific article or update say? | Retain subject-specific words and historical facts. Apply shared shell language; do not rewrite music essays into generic business essays. |
| Artist directory and public identities | Who is this person or artist? | Keep /artists an artist directory. Directory inclusion does not establish customer status, endorsement, consent, or a case study. Never overwrite a person's own name or biography. |
| Download and demo | What is available to install or inspect? | Shared account/workspace language around explicitly labeled specialist demos. Separate available Mac behavior from private iPhone alpha. Remove internal test-plan prose from customer-facing copy through the existing owner. |
| Support and FAQs | How do I complete this task? | Shared setup instructions. Music-service steps belong to music help. Visible FAQs and JSON-LD consume the same source. |
| Search, start, sign-in, sign-up, waitlist and claim | What happens next, and am I eligible? | Preserve the actual front-door, auth, invitation, and claim contracts. Do not require an artist name, release, or Spotify connection for a genuinely shared path. Expose a truthful next step where a workflow is not supported. |
| App onboarding, profile editor, empty/error/loading states | What can I do now? | Stable object names, role-relevant examples, useful empty states. A mixed-role account must retain both roles without irrelevant required steps. |
| Emails, receipts, outreach, support replies, generated assets | Is this the same product and offer I just saw? | Reuse the same vocabulary and offer facts. Preserve exact sender, recipient, approval, consent, suppression, and delivery scope. |
| Metadata, Open Graph, schema, sitemap, llms and agent prompts | What can a machine truthfully infer? | Project the same company identity, route availability, offer, and capability evidence. Keep artist API scope and read-only boundaries exact. Generated exports must be regenerated from their owner, not patched into contradictory facts. |
| Legal, policies and technical references | What is the actual policy or contract? | Preserve legal meaning and precise technical terms. Route substantive changes through their existing owner; avoid broad find-and-replace. |

## Sample direction for solution writers

Founder: **Show what you are building. Give people a clear next step.** Explain the work, relevant links, and supported way to reach the person. Use an approved founder profile and actual destination as the example.

Artist: **Your music, shows, and links. One place for fans to start.** Show a relevant artist profile and a real listen, ticket, or update action.

These are draft messaging directions, not new guaranteed outcomes or publication approval. Each final page needs a specific job, useful example, supported action, matching offer, and evidence. Plain language is preferable to internal labels such as activation engine, revenue path, audience ownership, or certification loop.

## Regression contract

1. **Destination truth:** the visible label and linked page must agree. Founders cannot link to About; Authors cannot link to Blog; a generic Product link cannot silently land on an artist-only page. All shared navigation and footer links require concrete existing pages. Validate fragments and final redirects in the rendered route suite.
2. **Context coverage:** every new authoring contract declares copyScope. Unknown paths return no invented contract. Artist aliases preserve their scope and action. Query parameters cannot silently turn the shared homepage into an artist-only experience.
3. **Meaning preservation:** shared Profile, Contacts, Subscribers, and Updates retain their meanings across pages and roles. Domain-specific content remains precise. No word-count target or global artist ban can certify this.
4. **Capability and offer parity:** title, hero, proof, primary action, FAQ, price, checkout, receipt, and machine export describe the same supported offer and eligibility. A change in one source invalidates dependent evidence; it cannot silently broaden an audience or approval.
5. **Evidence ownership:** screenshots, examples, quotes, integrations, and customer outcomes require appropriate provenance and permission. A directory row, mockup, or model score is insufficient proof of paid use or a business result.
6. **Journey continuity:** review artist, founder, mixed-role, and unknown visitors from landing through eligible claim/setup, first useful action, and follow-up. Include no match, unavailable capability, permission denied, loading, error, mobile, and desktop states.

Use the existing semantic copy auditor in delta mode for changed sections. Extend its fixtures for implied audience and unsupported outcomes through the existing owner; do not add a second copy-certification engine. Bounded model/JEV review can identify awkward meaning and missing specificity. Deterministic checks, actual capability evidence, and a working journey remain separate requirements. No paid model inference is added to source CI by this change.

## Delivery and remaining owners

JOV-6432's source patch contains truthful interim header/footer links within the existing components, removal of misleading declared audience links and dead comparison-index links, explicit context in the existing authoring contracts, shared support copy/metadata, and regression coverage. It does not publish Product or founder solution routes, alter billing/auth behavior, rewrite all page bodies, or certify production.

The interim header is About / For Artists / Pricing. The artist directory remains in Resources. The eventual Product/Solutions header still needs the useful routes, collision checks, publication decisions, and canonical design review owned by JOV-4491. No new header component or visual variant is introduced.

| Existing owner | Required continuation |
| --- | --- |
| JOV-4491 / JOV-6262 | Complete the shared Product/Solutions destinations and real founder experience; carry this full journey contract into the existing route work. |
| JOV-6216 / JOV-6223 | Bind audience-relevant claims to actual availability, publication, and maturity; cover every route from the existing census. |
| JOV-6231 / JOV-5814 | Reconcile the existing pricing writers and all dependent surfaces. Include the stale $39 assertion in the /new E2E fixture; do not add a third pricing implementation. |
| JOV-6264 | Preserve legacy URLs, aliases, search intent, and identity collision safety. |
| JOV-6265 | Align machine discovery and generated authoring guidance, including broad company identity versus specialist artist APIs. |
| JOV-6220 | Verify exact-head rendered navigation, responsive layout, accessible names, and artist/founder journeys through the existing certification lane. |

Before source promotion run the real focused Vitest suites, typecheck, and normal repository checks. Render the affected shared shell and support page on mobile and desktop through the existing hosted lane. Keep source checks, rendered evidence, merge, deployed SHA, and production outcome distinct. The migration is complete when a supported founder journey and an artist journey both work with truthful language and offer terms at the same deployed revision.
