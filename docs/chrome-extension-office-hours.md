# Jovie Chrome Extension Office Hours

Product strategy draft for a Chrome extension that brings Jovie's media identity graph into any workflow on the web.

## One-line thesis

Jovie should become the artist's "media identity layer" for the browser: a context-aware sidebar that knows your songs, releases, tour dates, links, contacts, and pitch context, then helps you read, insert, and eventually act across third-party tools without making the user retype their career.

## Recommendation

Build this in three phases, but optimize the MVP for one brutally clear promise:

**When an artist or manager is on a music workflow page, Jovie instantly shows the relevant artist data and offers one-click insert actions.**

That is a much better wedge than "agent that can do everything everywhere" because:

- it is immediately legible
- it uses data Jovie already has or is already close to having
- it creates value before full browser automation exists
- it earns the right to ask for broader permissions later

## The narrowest wedge

Start with the workflows where the user is already doing tedious copy/paste with structured music data:

1. Event pages
   - Eventbrite
   - Bandsintown
   - venue backend forms
   - promoter submission pages

2. Release/distribution pages
   - distributor release forms
   - metadata entry screens
   - credits fields
   - smart link / pre-save setup pages

3. Outreach surfaces
   - Gmail
   - press forms
   - playlist pitching forms
   - CRM-like contact workflows

The MVP should not try to "browse the whole authenticated internet" yet. It should first win on:

- detect page type
- load matching Jovie entities
- suggest inserts
- fill deterministic fields when the user approves

## The real product insight

1Password stores credentials. Jovie can store career primitives.

Those primitives are not generic notes. They are structured entities:

- artist profile
- release
- track
- tour date
- venue
- contact
- pitch angle
- smart link
- credit block
- artist bio variants

That means the extension can do more than autofill static text. It can provide context-aware composition.

Examples:

- On Eventbrite, show upcoming tour dates and let the user insert the selected show's title, date, venue, city, ticket URL, and artwork.
- On a distributor page, detect track metadata fields and let the user fill release title, UPC, ISRCs, contributors, writers, producers, release date, genre, and links.
- In Gmail, detect that the user is pitching a track and suggest songs, artist proof points, comparable artists, target playlists, or a signature with the creator's Jovie link.

## Six forcing questions

### 1. What desperate problem are we solving first?

Artists and managers waste time re-entering the same music metadata across fragmented tools.

The pain is not "I wish I had AI in my browser."
The pain is:

- "I already know this data exists in Jovie."
- "Why am I copying it field by field into Eventbrite / DistroKid / Gmail again?"
- "Why do I keep making tiny metadata mistakes?"

That is a sharp painkiller, not a vitamin.

### 2. What is the status quo?

Today users rely on:

- manual copy/paste
- saved snippets
- docs and spreadsheets
- memory
- virtual assistants
- password managers and text expanders misused as metadata stores

The extension wins when it beats the spreadsheet-plus-copy/paste workflow on speed and correctness.

### 3. Who is the first user?

The best first user is not "everyone in music."

It is:

- independent artists with active releases and live shows
- artist managers handling repeated submissions
- small teams doing release setup, tour listings, and outreach every week

This user has repeated, structured tasks and benefits immediately from entity-aware suggestions.

### 4. What is the smallest wow moment?

Open Eventbrite on a blank event form.
Jovie sidebar appears.
It says:

"We found 6 upcoming tour dates. Pick one to fill this event."

User clicks one date.
The extension fills:

- event title
- date/time
- venue
- city
- description seed copy
- ticket link
- artwork source

That is concrete, magical, and explainable.

### 5. What gives Jovie a durable edge?

Not the extension shell itself. Anyone can build a sidebar.

The moat is the structured identity graph plus workflow intelligence:

- releases linked to tracks, credits, genres, links, and pitch copy
- tour dates linked to venues, cities, tickets, and promotion assets
- contacts linked to roles, companies, relationships, and outreach context
- smart links and creator profile as canonical distribution surfaces

The browser is just the delivery mechanism for that graph.

### 6. What future does this unlock?

Once the extension is trusted for read + insert actions, it can evolve into a controlled action layer:

- authenticated updates on third-party tools
- lead/contact capture from sites the user visits
- browser-assisted social posting workflows
- manager mode for multi-artist context switching
- agent-triggered deterministic browser actions with human approval

That future is real, but it should be earned in stages.

## Product shape

### Core surface

A right-side extension panel with four tabs:

1. `Context`
   - what page Jovie thinks this is
   - matched entities
   - confidence
   - suggested workflow

2. `Insert`
   - field-level suggestions
   - one-click fill actions
   - copy block actions
   - signature / smart link suggestions

3. `Entities`
   - releases
   - songs
   - tour dates
   - contacts
   - artist profile facts

4. `Actions`
   - import company/contact
   - create event from selected tour date
   - fill release form
   - save page as lead / opportunity

### Extension behavior

The extension should run in three modes:

- `Passive`
  - detect page
  - show entities
  - no DOM mutation unless user clicks

- `Assist`
  - highlight fillable fields
  - preview insertions
  - execute deterministic autofill on approval

- `Agentic later`
  - perform multi-step browser workflows
  - always behind explicit confirmation and activity logging

## Authentication recommendation

Use a one-time browser handoff, not full password-style auth inside the extension UI.

Recommended flow:

1. User installs extension.
2. Extension opens Jovie web app.
3. Logged-in Jovie session issues a short-lived extension handoff token.
4. Extension exchanges that token for its own scoped session.
5. Extension stores only the minimum needed auth state.

Why this is the right MVP:

- fits the existing Clerk-based auth world
- avoids building a second complete sign-in surface first
- keeps trust high because login starts from Jovie itself
- supports future scope controls and device revocation

### Better than OTP as the primary auth

OTP can still be a fallback, but the default should be:

- signed-in web handoff if user already has a Jovie session
- email OTP only when no web session exists

This reduces friction and keeps the extension anchored to the existing account system.

## Architecture recommendation

### Client pieces

1. Extension side panel
   - React UI
   - reads page context
   - shows entity suggestions

2. Content scripts
   - per-site detectors
   - DOM field mapping
   - deterministic fill routines

3. Background service worker
   - session management
   - API requests
   - permission orchestration
   - event logging

4. Shared schema package later
   - entity contracts
   - workflow payload types
   - page classification types

### Server pieces

Add extension-specific APIs instead of overloading generic endpoints:

- `POST /api/extension/session/handoff`
- `POST /api/extension/session/exchange`
- `POST /api/extension/context/classify`
- `POST /api/extension/actions/fill-preview`
- `POST /api/extension/imports`

These should sit on top of the existing creator, releases, tour dates, contacts, and chat data surfaces.

### Important principle

Do not make the extension itself the source of truth.

The extension should be:

- cache
- context detector
- insert/action client

Jovie web remains the canonical system of record.

## Permission model

Ask for as little as possible at install time.

MVP permissions:

- active tab
- side panel
- storage
- scripting
- host permissions only for supported workflow domains

Do not ask for blanket access to every site on day one if we can avoid it.

The trust story is much better if the user understands:

"Jovie works on Eventbrite, Bandsintown, Gmail, and distributor pages first."

Then expand permissions as supported workflows expand.

## The first three deterministic workflows

### 1. Tour date to event form

If page looks like Eventbrite or Bandsintown admin:

- classify page as `event_form`
- fetch upcoming tour dates
- suggest best matching artist and date
- let user insert selected event fields

Success metric:

- time to complete event form drops by at least 70%

### 2. Release metadata to distributor form

If page looks like a release creation/edit page:

- classify page as `release_form`
- fetch latest draft or selected release
- map fields to title, contributors, genres, dates, codes, credits
- fill on approval

Success metric:

- reduce repeat metadata entry and submission errors

### 3. Email pitch assistant

If page looks like Gmail compose:

- detect outreach intent
- surface song suggestions, proof points, links, and signature
- insert selected block, never full-send

Success metric:

- higher pitch throughput and less blank-page friction

## Where presence and imports fit

Presence is powerful, but it should be framed carefully.

The near-term value is:

- Jovie knows where you are
- Jovie knows what entity data is relevant
- Jovie suggests what to do

The next step is:

- import this company
- save this venue
- save this contact
- capture this opportunity

The later step is:

- update that external system from Jovie-controlled workflows

That sequencing matters because "read and suggest" is much easier to trust than "scrape and post on my behalf."

## Future agentic roadmap

Once deterministic workflows are stable, the extension can become the browser execution layer for Jovie agents.

That unlocks:

- authenticated site updates
- inbox triage assistance
- social posting helpers
- profile/contact enrichment from visited pages
- artist manager workspaces with entity switching

But those flows need strong controls:

- explicit approvals
- per-domain action scopes
- human-readable action logs
- dry-run previews before writes
- revocable sessions

If those controls are weak, the product will feel creepy instead of helpful.

## Biggest risks

### 1. Doing too much too early

If the first version tries to be:

- universal sidebar
- full agent
- CRM importer
- social automation tool
- browser RPA platform

it will feel diffuse and permission-heavy.

### 2. Wrong auth complexity

If sign-in feels custom or brittle, install-to-value will collapse.

### 3. Fragile DOM automation

Form filling must be deterministic, inspectable, and domain-scoped.
Anything flaky will destroy trust fast.

### 4. Permission anxiety

Users will tolerate broad access only after the product has already proved value.

## What I would build first

### Phase 1: Prove the wedge

- extension install + web handoff auth
- side panel UI
- page classifier for 3 to 5 supported domains
- read-only entity context
- deterministic insert actions for:
  - event forms
  - release forms
  - Gmail compose suggestions

### Phase 2: Make it sticky

- saved workflows
- better field mapping
- signatures and smart link suggestions
- import company/contact from supported pages
- multi-artist switcher for managers

### Phase 3: Open the action layer

- agent-assisted multi-step workflows
- authenticated updates on third-party sites
- browser automation orchestration
- social and CRM-style operations

## The strongest MVP positioning

Do not market this first as "AI agent for the browser."

Market it as:

**Jovie Everywhere: your songs, releases, tour dates, contacts, and smart links available anywhere you work online.**

That framing is:

- clearer
- more trustworthy
- more immediately valuable
- still expandable into the agent future

## Immediate build recommendation

If we were starting now, I would greenlight this exact build order:

1. Extension auth handoff from logged-in Jovie web app
2. Side panel shell with page classification
3. Eventbrite/Bandsintown tour date insert workflow
4. Distributor release metadata insert workflow
5. Gmail pitch suggestions + signature insert

That is enough to validate whether Jovie can become the default operating layer for music work on the web.
