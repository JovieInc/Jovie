import{n as e}from"./rolldown-runtime-BcKkbAw3.js";import{t}from"./jsx-runtime-BbDfbRii.js";import{n,t as r}from"./check-C93bwYa6.js";import{n as i,t as a}from"./minus-CLKPKvrq.js";import{n as ee,t as o}from"./link-e-necIhk.js";import{s,t as c}from"./routes-NOD5Mahi.js";import{n as te,t as l}from"./MarketingContainer-B_bVfqAt.js";import{n as u,t as d}from"./FaqSection-Ng_rCs92.js";import{n as f,t as p}from"./MarketingPricingPlans-BffAR1OQ.js";import{n as m,t as h}from"./MarketingHero-V-bJj2s9.js";import{n as g,t as _}from"./MarketingPageShell-6BRzGJWm.js";import{n as v,t as y}from"./ArtistProfileLandingRoute-BxtK4Ofl.js";import{n as b,t as x}from"./PricingComparisonChart-CGnrLoVv.js";import{n as ne,t as S}from"./PublicPageShell-BkQfPJxe.js";import{a as re,i as ie,n as ae,t as oe}from"./marketingStoryMeta-B12ISWnH.js";import{n as se,t as ce}from"./artistNotificationsCopy-CWTGC8Ee.js";import{n as le,t as ue}from"./ArtistNotificationsLanding-K85LvTRt.js";import{n as de,t as fe}from"./HomepageV2Route-DXNcRzJQ.js";import{a as C,n as w,r as T}from"./fixtures-B4SU1_HS.js";import{n as E,t as D}from"./MarketingFinalCTA-gLrVfMLy.js";import{n as O,t as k}from"./comparisons-S6TEJlvw.js";import{n as A,t as j}from"./StoryBlogCard-DJCQ0gXH.js";var M;function N(){return(N=e((()=>{M=[{id:`homepage`,label:`Homepage`,status:`proven`,referenceRoute:`/new`,audience:`general`,sectionOrder:[`hero`,`logo-cloud`,`feature-split`,`feature-split`,`feature-split`,`spec-wall`,`social-proof`,`pricing`,`cta`],arc:[{beat:`promise`,feeling:`this is what Jovie is`,section:`hero`},{beat:`permission`,feeling:`others trust it`,section:`logo-cloud`},{beat:`comprehension`,feeling:`how it works at a glance`,section:`feature-split`},{beat:`depth`,feeling:`I see the product in action`,section:`feature-split`},{beat:`capability`,feeling:`I could use this for capture/reactivation`,section:`feature-split`},{beat:`detail`,feeling:`the specifics matter`,section:`spec-wall`},{beat:`belief`,feeling:`real artists use this`,section:`social-proof`},{beat:`price`,feeling:`what does it cost`,section:`pricing`},{beat:`action`,feeling:`ready to start`,section:`cta`}],hierarchy:{oneBigIdea:`Jovie is the artist platform that captures every fan and reactivates them automatically`,seeFirst:`hero`,second:`feature-split`,third:`spec-wall`,emphasisBudget:{maxDisplayScaleMoments:1,maxFullBleedBreaks:1,maxHeroWeightProofElements:1},aboveTheFoldContract:{desktop:[`hero`],mobile:[`hero`]}},ctaCadence:{strategy:`sparse`,primaryLabel:`Get started`,secondaryLabel:`See a live profile`,cadence:`hero-and-close`},substitutions:[{replace:`social-proof`,with:`stats`,when:`socialProof verified data absent but stats aggregate verified`},{replace:`pricing`,with:`monetization`,when:`audience=artist (one-liner-link variant, not a full pricing table)`}],fallbacks:[{missing:`social-proof verified data`,fallback:`omit section social-proof (zero-proof path)`},{missing:`stats verified data`,fallback:`omit section stats (zero-proof path)`},{missing:`logo-cloud verified logos`,fallback:`omit section logo-cloud (zero-proof path)`}],minContent:[`hero.headline`,`hero.primaryCta`,`cta.headline`,`cta.primaryCta`],maxContent:{maxSections:12},chooseWhen:`traffic=home OR (audience=general AND intent=category AND conversion=start)`,neverUse:[`For audience=artist specifically (use artist-lp recipe — the arc differs)`,`As a feature page (use feature recipe — narrower scope, deeper demo)`]},{id:`pricing`,label:`Pricing`,status:`proven`,referenceRoute:`/pricing`,audience:`general`,sectionOrder:[`hero`,`pricing`,`social-proof`,`comparison`,`faq`,`cta`],arc:[{beat:`frame`,feeling:`here is the price`,section:`hero`},{beat:`tiers`,feeling:`which tier fits me`,section:`pricing`},{beat:`trust`,feeling:`real customers paid this`,section:`social-proof`},{beat:`compare`,feeling:`how do tiers differ in detail`,section:`comparison`},{beat:`objection`,feeling:`what is the catch`,section:`faq`},{beat:`action`,feeling:`ready to start`,section:`cta`}],hierarchy:{oneBigIdea:`Jovie pricing is simple: three clear tiers, full comparison, no hidden fees`,seeFirst:`hero`,second:`pricing`,third:`comparison`,emphasisBudget:{maxDisplayScaleMoments:1,maxFullBleedBreaks:1,maxHeroWeightProofElements:1},aboveTheFoldContract:{desktop:[`hero`,`pricing`],mobile:[`hero`,`pricing`]}},ctaCadence:{strategy:`sparse`,primaryLabel:`Get started`,secondaryLabel:`Contact sales`,cadence:`hero-and-close`},fallbacks:[{missing:`social-proof verified data`,fallback:`omit section social-proof (B2B C7: proof beat between cards and matrix — but zero-proof wins)`},{missing:`comparison featureRows`,fallback:`omit section comparison (degrades to tier-cards + faq only)`}],minContent:[`pricing.tiers`,`faq.items`,`cta.headline`],maxContent:{maxSections:8},chooseWhen:`intent=price AND conversion=start OR upgrade`,neverUse:[`Without FAQ (B2B anti-pattern #9: Linear is the observed gap — every other property carries FAQ)`,`On artist LP as a full pricing table (use artist-lp recipe with monetization one-liner instead — creator R8)`]},{id:`artist-lp`,label:`Artist Landing Page`,status:`proven`,referenceRoute:`/artist-profiles`,audience:`artist`,sectionOrder:[`hero`,`feature-split`,`feature-grid`,`capture`,`feature-split`,`monetization`,`spec-wall`,`how-it-works`,`social-proof`,`faq`,`cta`],arc:[{beat:`recognition`,feeling:`this is for people like me (my music, my fans)`,section:`hero`},{beat:`identity`,feeling:`that could be MY page`,section:`feature-split`},{beat:`aspiration`,feeling:`artists I admire are here`,section:`feature-grid`},{beat:`capability`,feeling:`I can capture every fan`,section:`capture`},{beat:`capability`,feeling:`I can reactivate them automatically`,section:`feature-split`},{beat:`money-reality`,feeling:`real people earn from this; here is the take-rate`,section:`monetization`},{beat:`detail`,feeling:`the specifics matter`,section:`spec-wall`},{beat:`low-risk`,feeling:`I can be live in 60 seconds`,section:`how-it-works`},{beat:`relatability`,feeling:`even small artists succeed — so can I`,section:`social-proof`},{beat:`permission`,feeling:`my objections are answered`,section:`faq`},{beat:`action`,feeling:`nothing to lose, claim it now`,section:`cta`}],hierarchy:{oneBigIdea:`Jovie is the one profile that captures every fan and reactivates them automatically — own your fans, keep more earnings`,seeFirst:`hero`,second:`feature-split`,third:`capture`,emphasisBudget:{maxDisplayScaleMoments:1,maxFullBleedBreaks:1,maxHeroWeightProofElements:1},aboveTheFoldContract:{desktop:[`hero`],mobile:[`hero`]}},ctaCadence:{strategy:`dense-tiered`,primaryLabel:`Claim your Jovie`,cadence:`every-2-3-sections-after-proof`},substitutions:[{replace:`feature-split`,with:`ownership`,when:`competing with DSPs/link-in-bio (creator R9: ownership section REQUIRED as emotional differentiator)`}],fallbacks:[{missing:`social-proof verified data`,fallback:`omit section social-proof (zero-proof path; substitute = screenshot-registry product render)`},{missing:`monetization real take-rate`,fallback:`omit section monetization (zero-proof law — pre-scale, skip the beat entirely)`},{missing:`hero phone asset`,fallback:`use hero variant centered-none (degradation ladder: product-screenshot tier 3 = OMIT visual)`}],minContent:[`hero.headline`,`hero.primaryCta`,`cta.headline`,`cta.primaryCta`],maxContent:{maxSections:13},chooseWhen:`audience=artist AND intent=artist-profile AND conversion=claim-handle OR claim-profile`,neverUse:[`With a problem-agitation section (creator R9: artist arc has no problem beat)`,`With comparison above the fold (creator R9: comparison reads as agitation near top)`,`With founder-first proof near the top (DESIGN.md ui.md smell — use product-render only near top)`,`With a demo-gate or "book a demo" CTA (creator R10: self-serve only on creator paths)`,`With enterprise/security/ROI-calculator sections (creator R10: illegal on artist-audience recipes)`,`With a full pricing table (creator R8: one-liner + link; cost-objection in CTA string)`,`With quotes from famous artists (creator R5: famous=profiles, quotes=small/relatable)`]},{id:`feature`,label:`Feature Page`,status:`proven`,referenceRoute:`/artist-notifications`,audience:`artist`,sectionOrder:[`hero`,`logo-cloud`,`capture`,`feature-split`,`feature-grid`,`spec-wall`,`faq`,`cta`],arc:[{beat:`promise`,feeling:`this is the specific capability`,section:`hero`},{beat:`permission`,feeling:`others trust it`,section:`logo-cloud`},{beat:`capability`,feeling:`I can capture fans with this feature`,section:`capture`},{beat:`capability`,feeling:`and reactivate them`,section:`feature-split`},{beat:`breadth`,feeling:`what else it does`,section:`feature-grid`},{beat:`detail`,feeling:`the specifics matter`,section:`spec-wall`},{beat:`objection`,feeling:`my questions answered`,section:`faq`},{beat:`action`,feeling:`ready to try`,section:`cta`}],hierarchy:{oneBigIdea:`This one capability does X for you (one promise, narrower than homepage)`,seeFirst:`hero`,second:`feature-split`,third:`spec-wall`,emphasisBudget:{maxDisplayScaleMoments:1,maxFullBleedBreaks:1,maxHeroWeightProofElements:1},aboveTheFoldContract:{desktop:[`hero`],mobile:[`hero`]}},ctaCadence:{strategy:`dense-tiered`,primaryLabel:`Get started`,cadence:`hero-and-close`},substitutions:[{replace:`logo-cloud`,with:`feature-split`,when:`audience=artist AND no logos (degradation: trust proof = product render)`}],fallbacks:[{missing:`logo-cloud verified logos`,fallback:`omit section logo-cloud (zero-proof path)`}],minContent:[`hero.headline`,`hero.primaryCta`,`cta.headline`],maxContent:{maxSections:10},chooseWhen:`intent=feature AND conversion=start (one promise, deeper demo than homepage)`,neverUse:[`As a retelling of the whole company story (B2B anti-pattern #14: feature pages go deep on one promise)`,`With audience=general as the primary (feature pages assume the category framing already happened on homepage)`]},{id:`agency-lp`,label:`Agency Landing Page`,status:`stub`,audience:`agency`,sectionOrder:[`hero`,`logo-cloud`,`feature-grid`,`feature-split`,`social-proof`,`pricing`,`faq`,`cta`],arc:[{beat:`promise`,feeling:`Jovie for agencies managing multiple artists`,section:`hero`},{beat:`permission`,feeling:`agencies trust it`,section:`logo-cloud`},{beat:`breadth`,feeling:`what it does for my roster`,section:`feature-grid`},{beat:`depth`,feeling:`how it works for one artist`,section:`feature-split`},{beat:`belief`,feeling:`agencies like mine use this`,section:`social-proof`},{beat:`price`,feeling:`agency pricing`,section:`pricing`},{beat:`objection`,feeling:`my questions answered`,section:`faq`},{beat:`action`,feeling:`ready to talk`,section:`cta`}],hierarchy:{oneBigIdea:`Jovie lets agencies manage every artist fan lifecycle from one dashboard`,seeFirst:`hero`,second:`feature-grid`,third:`social-proof`,emphasisBudget:{maxDisplayScaleMoments:1,maxFullBleedBreaks:1,maxHeroWeightProofElements:1},aboveTheFoldContract:{desktop:[`hero`],mobile:[`hero`]}},ctaCadence:{strategy:`sparse`,primaryLabel:`Talk to us`,secondaryLabel:`See a demo roster`,cadence:`hero-and-close`},fallbacks:[{missing:`logo-cloud verified logos`,fallback:`omit section logo-cloud (zero-proof path)`},{missing:`social-proof verified data`,fallback:`omit section social-proof (zero-proof path)`}],minContent:[`hero.headline`,`hero.primaryCta`,`cta.headline`],maxContent:{maxSections:11},chooseWhen:`audience=agency AND conversion=book-demo OR start`,neverUse:[`With the artist-arc CTA verbs (agency path is sales-led, not claim-led)`,`Without a real demo roster asset (degradation: screenshot-registry product render of multi-artist view)`]},{id:`enterprise`,label:`Enterprise`,status:`stub`,audience:`enterprise-buyer`,sectionOrder:[`hero`,`logo-cloud`,`feature-split`,`stats`,`social-proof`,`comparison`,`faq`,`cta`],arc:[{beat:`promise`,feeling:`enterprise-grade artist platform`,section:`hero`},{beat:`permission`,feeling:`named enterprises trust it`,section:`logo-cloud`},{beat:`depth`,feeling:`how it works at enterprise scale`,section:`feature-split`},{beat:`scale`,feeling:`the numbers`,section:`stats`},{beat:`belief`,feeling:`enterprise case studies`,section:`social-proof`},{beat:`compare`,feeling:`vs alternatives`,section:`comparison`},{beat:`objection`,feeling:`security/compliance/contract questions`,section:`faq`},{beat:`action`,feeling:`ready to talk`,section:`cta`}],hierarchy:{oneBigIdea:`Jovie at enterprise scale — security, compliance, multi-team`,seeFirst:`hero`,second:`feature-split`,third:`stats`,emphasisBudget:{maxDisplayScaleMoments:1,maxFullBleedBreaks:1,maxHeroWeightProofElements:1},aboveTheFoldContract:{desktop:[`hero`],mobile:[`hero`]}},ctaCadence:{strategy:`sparse`,primaryLabel:`Contact sales`,secondaryLabel:`Get started`,cadence:`hero-and-close`},fallbacks:[{missing:`logo-cloud verified logos`,fallback:`omit section logo-cloud (zero-proof path)`},{missing:`stats verified data`,fallback:`omit section stats (zero-proof path — pre-scale, skip the beat entirely)`},{missing:`social-proof verified data`,fallback:`omit section social-proof (zero-proof path)`}],minContent:[`hero.headline`,`hero.primaryCta`,`cta.headline`],maxContent:{maxSections:10},chooseWhen:`audience=enterprise-buyer AND conversion=contact-sales`,neverUse:[`For audience=artist (creator R10: enterprise sections illegal on artist-audience recipes)`,`Without verified enterprise customer proof (zero-proof path: omit stats/social-proof)`]},{id:`comparison`,label:`Comparison`,status:`proven`,referenceRoute:`/compare/linktree`,audience:`general`,sectionOrder:[`hero`,`feature-grid`,`comparison`,`faq`,`cta`],arc:[{beat:`frame`,feeling:`Jovie vs X`,section:`hero`},{beat:`breadth`,feeling:`what else Jovie does`,section:`feature-grid`},{beat:`compare`,feeling:`feature-by-feature`,section:`comparison`},{beat:`objection`,feeling:`my questions`,section:`faq`},{beat:`action`,feeling:`try Jovie`,section:`cta`}],hierarchy:{oneBigIdea:`Jovie beats X on these specific dimensions`,seeFirst:`hero`,second:`feature-grid`,third:`comparison`,emphasisBudget:{maxDisplayScaleMoments:1,maxFullBleedBreaks:1,maxHeroWeightProofElements:1},aboveTheFoldContract:{desktop:[`hero`,`feature-grid`],mobile:[`hero`]}},ctaCadence:{strategy:`sparse`,primaryLabel:`Get started`,cadence:`hero-and-close`},fallbacks:[{missing:`comparison featureRows`,fallback:`fail (comparison is the point — do not ship without it)`},{missing:`competitor verified feature data`,fallback:`fail (zero-proof law applies to competitor claims too)`}],minContent:[`comparison.competitor`,`comparison.featureRows`,`cta.headline`],maxContent:{maxSections:7},chooseWhen:`intent=compare AND conversion=start (SEO programmatic from content/comparisons/ or content/alternatives/)`,neverUse:[`With fabricated competitor features (zero-proof law)`,`For audience=artist above the fold (creator R9: comparison near top reads as agitation)`]},{id:`launch`,label:`Launch`,status:`proven`,referenceRoute:`/launch`,audience:`general`,sectionOrder:[`hero`,`logo-cloud`,`feature-split`,`feature-split`,`feature-split`,`feature-split`,`feature-split`,`feature-split`,`content-prose`,`comparison`,`cta`],arc:[{beat:`announce`,feeling:`this is the launch`,section:`hero`},{beat:`permission`,feeling:`platforms supported`,section:`logo-cloud`},{beat:`thesis`,feeling:`why this exists`,section:`feature-split`},{beat:`capability`,feeling:`profile, smart links, deeplinks, AI, audience`,section:`feature-split`},{beat:`why-now`,feeling:`the editorial argument`,section:`content-prose`},{beat:`compare`,feeling:`vs alternatives`,section:`comparison`},{beat:`action`,feeling:`get it now`,section:`cta`}],hierarchy:{oneBigIdea:`Jovie launches X — here is the thesis, the capabilities, and why now`,seeFirst:`hero`,second:`feature-split`,third:`content-prose`,emphasisBudget:{maxDisplayScaleMoments:1,maxFullBleedBreaks:1,maxHeroWeightProofElements:1},aboveTheFoldContract:{desktop:[`hero`],mobile:[`hero`]}},ctaCadence:{strategy:`sparse`,primaryLabel:`Get started`,cadence:`hero-and-close`},fallbacks:[{missing:`logo-cloud verified logos`,fallback:`omit section logo-cloud (zero-proof path — launch can ship without a logo strip; the announcement is the proof)`}],minContent:[`hero.headline`,`hero.primaryCta`,`cta.headline`],maxContent:{maxSections:14,maxLongFormSections:2},chooseWhen:`intent=launch AND conversion=start (announcement + long-form narrative)`,neverUse:[`With more than 2 content-prose beats (long-form cap; emphasis budget)`,`Without a real launch moment (launch recipes date-stamp the announcement)`]},{id:`waitlist`,label:`Waitlist`,status:`stub`,audience:`general`,sectionOrder:[`hero`,`feature-split`,`capture`,`faq`,`cta`],arc:[{beat:`promise`,feeling:`early access`,section:`hero`},{beat:`comprehension`,feeling:`what early access makes possible`,section:`feature-split`},{beat:`capture`,feeling:`join the waitlist`,section:`capture`},{beat:`objection`,feeling:`my questions`,section:`faq`},{beat:`action`,feeling:`request access`,section:`cta`}],hierarchy:{oneBigIdea:`Join the Jovie waitlist for early access`,seeFirst:`hero`,second:`feature-split`,third:`capture`,emphasisBudget:{maxDisplayScaleMoments:1,maxFullBleedBreaks:1,maxHeroWeightProofElements:1},aboveTheFoldContract:{desktop:[`hero`,`feature-split`],mobile:[`hero`,`feature-split`]}},ctaCadence:{strategy:`sparse`,primaryLabel:`Request access`,cadence:`hero-only`},minContent:[`hero.headline`,`capture.inputSlot`],maxContent:{maxSections:5},chooseWhen:`conversion=request-access AND WAITLIST_ENABLED=true`,neverUse:[`With multiple competing CTAs (capture is the conversion — one input, one submit)`,`Without interaction states on capture (Design F2: submitting/success/error/already-subscribed)`]},{id:`seo`,label:`SEO`,status:`proven`,referenceRoute:`/about`,audience:`general`,sectionOrder:[`hero`,`content-prose`,`faq`,`cta`],arc:[{beat:`frame`,feeling:`what is this about`,section:`hero`},{beat:`depth`,feeling:`the answer`,section:`content-prose`},{beat:`objection`,feeling:`related questions`,section:`faq`},{beat:`action`,feeling:`next step`,section:`cta`}],hierarchy:{oneBigIdea:`A specific question answered with FAQPage schema for SEO`,seeFirst:`hero`,second:`content-prose`,third:`faq`,emphasisBudget:{maxDisplayScaleMoments:1,maxFullBleedBreaks:1,maxHeroWeightProofElements:1},aboveTheFoldContract:{desktop:[`hero`],mobile:[`hero`]}},ctaCadence:{strategy:`sparse`,primaryLabel:`Get started`,cadence:`hero-and-close`},substitutions:[{replace:`content-prose`,with:`faq`,when:`SEO page is a pure FAQ page (about/support — FaqSection carries the answer)`}],minContent:[`hero.headline`,`faq.items`],maxContent:{maxSections:6,maxLongFormSections:2},chooseWhen:`intent=informational AND conversion=start OR none (FAQ schema + structured data)`,neverUse:[`Without FAQPage schema (the whole point of this recipe is structured data)`,`With more than 2 content-prose beats (long-form cap)`]},{id:`blog-landing`,label:`Blog Landing`,status:`proven`,referenceRoute:`/blog`,audience:`general`,sectionOrder:[`hero`,`content-prose`,`blog-feed`,`capture`,`cta`],arc:[{beat:`frame`,feeling:`the Jovie blog`,section:`hero`},{beat:`context`,feeling:`what artists and the team can learn here`,section:`content-prose`},{beat:`browse`,feeling:`posts to read`,section:`blog-feed`},{beat:`subscribe`,feeling:`get updates`,section:`capture`},{beat:`action`,feeling:`next step`,section:`cta`}],hierarchy:{oneBigIdea:`The Jovie blog — posts for artists and the team behind Jovie`,seeFirst:`hero`,second:`content-prose`,third:`blog-feed`,emphasisBudget:{maxDisplayScaleMoments:1,maxFullBleedBreaks:1,maxHeroWeightProofElements:1},aboveTheFoldContract:{desktop:[`hero`,`content-prose`],mobile:[`hero`,`content-prose`]}},ctaCadence:{strategy:`sparse`,primaryLabel:`Get started`,cadence:`hero-and-close`},fallbacks:[{missing:`blog-feed posts <3`,fallback:`fail (blog-landing requires ≥3 posts — omit the section means no blog)`}],minContent:[`hero.headline`,`content-prose.body`,`blog-feed.posts`],maxContent:{maxSections:6},chooseWhen:`intent=blog-index AND conversion=start OR subscribe`,neverUse:[`With <3 blog posts (zero-proof analog for content — omit the section means no blog)`,`With capture as the primary conversion (blog-landing primary = read posts; capture = secondary newsletter signup)`]},{id:`newsletter-signup`,label:`Newsletter Signup`,status:`stub`,audience:`general`,sectionOrder:[`hero`,`content-prose`,`capture`,`faq`,`cta`],arc:[{beat:`promise`,feeling:`what the newsletter gives me`,section:`hero`},{beat:`context`,feeling:`what makes the newsletter worth opening`,section:`content-prose`},{beat:`subscribe`,feeling:`one email, no commitment`,section:`capture`},{beat:`objection`,feeling:`frequency/unsubscribe questions answered`,section:`faq`},{beat:`action`,feeling:`subscribe now`,section:`cta`}],hierarchy:{oneBigIdea:`Subscribe to the Jovie newsletter — one email worth opening`,seeFirst:`hero`,second:`content-prose`,third:`capture`,emphasisBudget:{maxDisplayScaleMoments:1,maxFullBleedBreaks:1,maxHeroWeightProofElements:1},aboveTheFoldContract:{desktop:[`hero`,`content-prose`],mobile:[`hero`,`content-prose`]}},ctaCadence:{strategy:`sparse`,primaryLabel:`Subscribe`,cadence:`hero-only`},minContent:[`hero.headline`,`capture.inputSlot`],maxContent:{maxSections:5},chooseWhen:`conversion=subscribe AND intent≠blog-index (standalone newsletter signup — blog-index+subscribe stays on blog-landing where capture is secondary)`,neverUse:[`For early-access waitlist (use waitlist recipe — request-access conversion, different promise)`,`With multiple competing CTAs (capture is the conversion — one input, one submit)`,`Without interaction states on capture (Design F2: submitting/success/error/already-subscribed)`]}],Object.fromEntries(M.map(e=>[e.id,e]))})))()}function P({recipeId:e,children:t}){let n=M.find(t=>t.id===e);return(0,I.jsx)(`div`,{"data-testid":`marketing-recipe-${e}`,"data-recipe-status":n?.status??`unknown`,className:`bg-base text-primary-token`,children:t})}function F({recipeId:e}){let t=M.find(t=>t.id===e);return t?(0,I.jsx)(P,{recipeId:e,children:(0,I.jsx)(S,{children:(0,I.jsx)(_,{children:(0,I.jsxs)(l,{width:`page`,className:`py-16`,children:[(0,I.jsxs)(`p`,{className:`text-xs font-medium uppercase tracking-wide text-tertiary-token`,children:[`Stub Recipe · `,t.status]}),(0,I.jsx)(`h1`,{className:`mt-3 text-3xl font-semibold text-primary-token`,children:t.label}),(0,I.jsxs)(`p`,{className:`mt-4 max-w-prose text-secondary-token`,children:[t.hierarchy.oneBigIdea,` First implementation goes through human taste feedback before promoting to proven.`]}),(0,I.jsx)(`ol`,{className:`mt-8 list-decimal space-y-2 pl-5 text-sm text-secondary-token`,children:(()=>{let e={};return t.sectionOrder.map(t=>{let n=(e[t]??0)+1;return e[t]=n,(0,I.jsx)(`li`,{children:(0,I.jsx)(`code`,{className:`text-primary-token`,children:t})},`${t}#${n}`)})})()}),(0,I.jsx)(ee,{href:c.SIGNUP,className:`mt-10 inline-flex text-sm font-medium text-primary-token underline-offset-4 hover:underline`,children:t.ctaCadence.primaryLabel})]})})})}):null}var I,L,R,z,B,V,H,U,W,G,K,q,J,Y,X,Z,Q;function $(){return($=e((()=>{I=t(),n(),i(),o(),f(),u(),te(),m(),g(),le(),v(),de(),E(),ne(),s(),O(),se(),N(),b(),C(),ae(),A(),L={title:`Marketing/Recipes`,parameters:{...ie,viewport:{viewports:re,defaultViewport:`desktop`},docs:{description:{component:`${oe} Each story is a proven recipe composition from the marketing registry.`}}}},R={name:`homepage`,parameters:{docs:{description:{story:"Proven recipe `homepage` — reference route `/new` via HomepageV2Route."}}},render:()=>(0,I.jsx)(P,{recipeId:`homepage`,children:(0,I.jsx)(S,{children:(0,I.jsx)(fe,{})})})},z={name:`homepage-mobile`,tags:[`mobile-viewport`],parameters:{viewport:{defaultViewport:`mobile`},chromatic:{disable:!0},docs:{description:{story:`Mobile viewport of homepage recipe.`}}},render:R.render},B={name:`pricing`,parameters:{docs:{description:{story:"Proven recipe `pricing` — reference route `/pricing` composition (hero + plans + comparison + close)."}}},render:()=>(0,I.jsx)(P,{recipeId:`pricing`,children:(0,I.jsx)(S,{children:(0,I.jsxs)(_,{className:`system-b-pricing-page`,children:[(0,I.jsx)(h,{className:`system-b-pricing-hero`,headingId:`pricing-hero-heading-story`,headline:`Pricing`,subtitle:`Jovie profiles are free forever. Pro has limited access.`,primaryCta:{label:`Claim your profile`,href:`${c.SIGNUP}?plan=free`},secondaryCta:{label:`Explore Jovie Profiles`,href:c.ARTIST_PROFILES},logos:!1}),(0,I.jsx)(`section`,{"aria-label":`Plans`,className:`system-b-pricing-section`,children:(0,I.jsx)(l,{width:`page`,children:(0,I.jsx)(`div`,{className:`system-b-pricing-plans`,children:(0,I.jsx)(p,{mode:`expanded`,variant:`tier-cards-neutral`})})})}),(0,I.jsx)(`section`,{"aria-labelledby":`pricing-compare-heading-story`,className:`system-b-pricing-section`,children:(0,I.jsx)(l,{width:`page`,children:(0,I.jsxs)(`div`,{className:`system-b-pricing-section-inner`,children:[(0,I.jsxs)(`div`,{className:`system-b-pricing-section-copy`,children:[(0,I.jsx)(`h2`,{id:`pricing-compare-heading-story`,className:`system-b-pricing-section-title`,children:`Compare All Features`}),(0,I.jsx)(`p`,{className:`system-b-pricing-section-body`,children:`See the plan matrix for notifications, analytics, contacts, smart links, and release workspace capabilities.`})]}),(0,I.jsx)(`div`,{className:`system-b-pricing-chart-wrap`,children:(0,I.jsx)(x,{})})]})})}),(0,I.jsx)(D,{title:`Get Started`,body:`Claim the profile first. Choose Pro when you want the release system turned on.`,ctaLabel:`Claim your profile`,ctaHref:`${c.SIGNUP}?plan=free`})]})})})},V={name:`pricing-mobile`,tags:[`mobile-viewport`],parameters:{viewport:{defaultViewport:`mobile`},chromatic:{disable:!0}},render:B.render},H={name:`artist-lp`,parameters:{docs:{description:{story:"Proven recipe `artist-lp` — reference route `/artist-profiles` via ArtistProfileLandingRoute."}}},render:()=>(0,I.jsx)(P,{recipeId:`artist-lp`,children:(0,I.jsx)(S,{children:(0,I.jsx)(y,{logoPlacement:{page:`/artist-profiles`}})})})},U={name:`artist-lp-mobile`,tags:[`mobile-viewport`],parameters:{viewport:{defaultViewport:`mobile`},chromatic:{disable:!0}},render:H.render},W={name:`feature`,parameters:{docs:{description:{story:"Proven recipe `feature` — reference route `/artist-notifications` via ArtistNotificationsLanding."}}},render:()=>(0,I.jsx)(P,{recipeId:`feature`,children:(0,I.jsx)(S,{children:(0,I.jsx)(ue,{copy:ce})})})},G={name:`comparison`,parameters:{docs:{description:{story:"Proven recipe `comparison` — reference `/compare/linktree` using shipped comparison data + FaqSection."}}},render:()=>{let e=k(`linktree`);return e?(0,I.jsx)(P,{recipeId:`comparison`,children:(0,I.jsx)(S,{children:(0,I.jsxs)(_,{children:[(0,I.jsx)(h,{headingId:`comparison-hero-heading`,headline:e.heroHeadline,subtitle:e.heroSubheadline,primaryCta:{label:`Get started`,href:c.SIGNUP},logos:!1}),(0,I.jsx)(`section`,{"aria-labelledby":`comparison-matrix-heading`,className:`py-16`,"data-testid":`marketing-section-comparison`,children:(0,I.jsxs)(l,{width:`page`,children:[(0,I.jsx)(`h2`,{id:`comparison-matrix-heading`,className:`text-2xl font-semibold text-primary-token`,children:`Feature Matrix`}),(0,I.jsx)(`section`,{className:`mt-8 overflow-x-auto`,"aria-label":`Jovie vs ${e.competitor} feature matrix`,tabIndex:0,children:(0,I.jsxs)(`table`,{className:`w-full min-w-160 border-collapse text-left text-sm`,children:[(0,I.jsx)(`thead`,{children:(0,I.jsxs)(`tr`,{className:`border-b border-subtle`,children:[(0,I.jsx)(`th`,{className:`py-3 pr-4 font-medium text-secondary-token`,children:`Capability`}),(0,I.jsx)(`th`,{className:`py-3 pr-4 font-medium text-primary-token`,children:`Jovie`}),(0,I.jsx)(`th`,{className:`py-3 font-medium text-secondary-token`,children:e.competitor})]})}),(0,I.jsx)(`tbody`,{children:e.features.map(e=>(0,I.jsxs)(`tr`,{className:`border-b border-subtle`,children:[(0,I.jsxs)(`th`,{scope:`row`,className:`py-3 pr-4 font-normal text-primary-token`,children:[e.name,e.note?(0,I.jsx)(`span`,{className:`mt-1 block text-xs text-tertiary-token`,children:e.note}):null]}),(0,I.jsx)(`td`,{className:`py-3 pr-4`,children:e.jovie?(0,I.jsx)(r,{className:`h-4 w-4 text-accent-green`,"aria-label":`Yes`}):(0,I.jsx)(a,{className:`h-4 w-4 text-tertiary-token`,"aria-label":`No`})}),(0,I.jsx)(`td`,{className:`py-3`,children:e.competitor?(0,I.jsx)(r,{className:`h-4 w-4 text-secondary-token`,"aria-label":`Yes`}):(0,I.jsx)(a,{className:`h-4 w-4 text-tertiary-token`,"aria-label":`No`})})]},e.name))})]})})]})}),(0,I.jsx)(d,{items:e.faq??[...T]}),(0,I.jsx)(D,{})]})})}):(0,I.jsx)(P,{recipeId:`comparison`,children:(0,I.jsx)(`p`,{className:`p-8 text-secondary-token`,children:`Comparison data missing.`})})}},K={name:`launch`,parameters:{docs:{description:{story:"Proven recipe `launch` — thin product composition mirroring `/launch` grammar (hero + feature beats + close). Full long-form narrative stays on the route."}}},render:()=>(0,I.jsx)(P,{recipeId:`launch`,children:(0,I.jsx)(S,{children:(0,I.jsxs)(_,{children:[(0,I.jsx)(h,{headingId:`launch-hero-heading`,headline:`Your Entire Music Career. One Intelligent Link.`,subtitle:`Jovie launches the release system independent artists use to capture every fan and reactivate them automatically.`,primaryCta:{label:`Get started`,href:c.SIGNUP},logos:!1}),(0,I.jsx)(`section`,{className:`py-16`,"data-testid":`marketing-section-feature-split`,children:(0,I.jsxs)(l,{width:`page`,children:[(0,I.jsx)(`h2`,{className:`text-2xl font-semibold text-primary-token`,children:`One Profile For Every Drop`}),(0,I.jsx)(`p`,{className:`mt-4 max-w-prose text-secondary-token`,children:"Adaptive artist profiles, smart links, deeplinks, and fan notifications — the launch narrative on `/launch` expands each beat; this story holds the recipe shell for visual QA."})]})}),(0,I.jsx)(D,{title:`Get Started`,ctaLabel:`Get started`,ctaHref:c.SIGNUP})]})})})},q={name:`seo`,parameters:{docs:{description:{story:"Proven recipe `seo` — reference `/about` grammar (hero + FAQ + close). FAQPage schema lives on the route."}}},render:()=>(0,I.jsx)(P,{recipeId:`seo`,children:(0,I.jsx)(S,{children:(0,I.jsxs)(_,{children:[(0,I.jsx)(h,{headingId:`seo-hero-heading`,headline:`About Jovie`,subtitle:`Jovie is one product for presence, relationships, and growth — for artists, founders, authors, creators, and independent experts.`,primaryCta:{label:`Get started`,href:c.SIGNUP},logos:!1,align:`left`}),(0,I.jsx)(d,{items:[...T]}),(0,I.jsx)(D,{})]})})})},J={name:`blog-landing`,parameters:{docs:{description:{story:"Proven recipe `blog-landing` — reference `/blog` using StoryBlogCard fixtures (no filesystem/network fetch in Storybook)."}}},render:()=>{let[e,...t]=w;return(0,I.jsx)(P,{recipeId:`blog-landing`,children:(0,I.jsx)(S,{children:(0,I.jsxs)(_,{children:[(0,I.jsx)(h,{variant:`left`,children:(0,I.jsxs)(l,{width:`page`,children:[(0,I.jsx)(`h1`,{className:`text-4xl font-semibold tracking-tight text-primary-token`,children:`Blog`}),(0,I.jsx)(`p`,{className:`mt-4 max-w-prose text-lg text-secondary-token`,children:`Signals, playbooks, and product notes for building lasting momentum as an independent artist.`})]})}),(0,I.jsx)(`section`,{className:`py-12`,"data-testid":`marketing-section-blog-feed`,children:(0,I.jsxs)(l,{width:`page`,children:[e?(0,I.jsx)(j,{post:e,variant:`featured`}):null,(0,I.jsx)(`div`,{className:`mt-8 grid gap-6 md:grid-cols-2`,children:t.map(e=>(0,I.jsx)(j,{post:e},e.slug))})]})}),(0,I.jsx)(D,{title:`Stay In The Loop`,body:`Claim a profile when you are ready to put the playbooks into practice.`})]})})})}},Y={name:`agency-lp`,tags:[`stub`],parameters:{docs:{disable:!0}},render:()=>(0,I.jsx)(F,{recipeId:`agency-lp`})},X={name:`enterprise`,tags:[`stub`],parameters:{docs:{disable:!0}},render:()=>(0,I.jsx)(F,{recipeId:`enterprise`})},Z={name:`waitlist`,tags:[`stub`],parameters:{docs:{disable:!0}},render:()=>(0,I.jsx)(F,{recipeId:`waitlist`})},Q=[`homepage`,`homepageMobile`,`pricing`,`pricingMobile`,`artistLp`,`artistLpMobile`,`feature`,`comparison`,`launch`,`seo`,`blogLanding`,`agencyLp`,`enterprise`,`waitlist`],R.parameters={...R.parameters,docs:{...R.parameters?.docs,source:{originalSource:`{
  name: 'homepage',
  parameters: {
    docs: {
      description: {
        story: 'Proven recipe \`homepage\` — reference route \`/new\` via HomepageV2Route.'
      }
    }
  },
  render: () => <RecipeChrome recipeId='homepage'>
      <PublicPageShell>
        <HomepageV2Route />
      </PublicPageShell>
    </RecipeChrome>
}`,...R.parameters?.docs?.source}}},z.parameters={...z.parameters,docs:{...z.parameters?.docs,source:{originalSource:`{
  name: 'homepage-mobile',
  tags: ['mobile-viewport'],
  parameters: {
    viewport: {
      defaultViewport: 'mobile'
    },
    chromatic: {
      disable: true
    },
    docs: {
      description: {
        story: 'Mobile viewport of homepage recipe.'
      }
    }
  },
  render: homepage.render
}`,...z.parameters?.docs?.source},description:{story:`Mobile viewport companion — chromatic disabled to protect snapshot budget.`,...z.parameters?.docs?.description}}},B.parameters={...B.parameters,docs:{...B.parameters?.docs,source:{originalSource:`{
  name: 'pricing',
  parameters: {
    docs: {
      description: {
        story: 'Proven recipe \`pricing\` — reference route \`/pricing\` composition (hero + plans + comparison + close).'
      }
    }
  },
  render: () => <RecipeChrome recipeId='pricing'>
      <PublicPageShell>
        <MarketingPageShell className='system-b-pricing-page'>
          <MarketingHero className='system-b-pricing-hero' headingId='pricing-hero-heading-story' headline='Pricing' subtitle='Jovie profiles are free forever. Pro has limited access.' primaryCta={{
          label: 'Claim your profile',
          href: \`\${APP_ROUTES.SIGNUP}?plan=free\`
        }} secondaryCta={{
          label: 'Explore Jovie Profiles',
          href: APP_ROUTES.ARTIST_PROFILES
        }} logos={false} />

          <section aria-label='Plans' className='system-b-pricing-section'>
            <MarketingContainer width='page'>
              <div className='system-b-pricing-plans'>
                <MarketingPricingPlans mode='expanded' variant='tier-cards-neutral' />
              </div>
            </MarketingContainer>
          </section>

          <section aria-labelledby='pricing-compare-heading-story' className='system-b-pricing-section'>
            <MarketingContainer width='page'>
              <div className='system-b-pricing-section-inner'>
                <div className='system-b-pricing-section-copy'>
                  <h2 id='pricing-compare-heading-story' className='system-b-pricing-section-title'>
                    Compare All Features
                  </h2>
                  <p className='system-b-pricing-section-body'>
                    See the plan matrix for notifications, analytics, contacts,
                    smart links, and release workspace capabilities.
                  </p>
                </div>
                <div className='system-b-pricing-chart-wrap'>
                  <PricingComparisonChart />
                </div>
              </div>
            </MarketingContainer>
          </section>

          <MarketingFinalCTA title='Get Started' body='Claim the profile first. Choose Pro when you want the release system turned on.' ctaLabel='Claim your profile' ctaHref={\`\${APP_ROUTES.SIGNUP}?plan=free\`} />
        </MarketingPageShell>
      </PublicPageShell>
    </RecipeChrome>
}`,...B.parameters?.docs?.source}}},V.parameters={...V.parameters,docs:{...V.parameters?.docs,source:{originalSource:`{
  name: 'pricing-mobile',
  tags: ['mobile-viewport'],
  parameters: {
    viewport: {
      defaultViewport: 'mobile'
    },
    chromatic: {
      disable: true
    }
  },
  render: pricing.render
}`,...V.parameters?.docs?.source}}},H.parameters={...H.parameters,docs:{...H.parameters?.docs,source:{originalSource:`{
  name: 'artist-lp',
  parameters: {
    docs: {
      description: {
        story: 'Proven recipe \`artist-lp\` — reference route \`/artist-profiles\` via ArtistProfileLandingRoute.'
      }
    }
  },
  render: () => <RecipeChrome recipeId='artist-lp'>
      <PublicPageShell>
        <ArtistProfileLandingRoute logoPlacement={{
        page: '/artist-profiles'
      }} />
      </PublicPageShell>
    </RecipeChrome>
}`,...H.parameters?.docs?.source}}},U.parameters={...U.parameters,docs:{...U.parameters?.docs,source:{originalSource:`{
  name: 'artist-lp-mobile',
  tags: ['mobile-viewport'],
  parameters: {
    viewport: {
      defaultViewport: 'mobile'
    },
    chromatic: {
      disable: true
    }
  },
  render: artistLp.render
}`,...U.parameters?.docs?.source}}},W.parameters={...W.parameters,docs:{...W.parameters?.docs,source:{originalSource:`{
  name: 'feature',
  parameters: {
    docs: {
      description: {
        story: 'Proven recipe \`feature\` — reference route \`/artist-notifications\` via ArtistNotificationsLanding.'
      }
    }
  },
  render: () => <RecipeChrome recipeId='feature'>
      <PublicPageShell>
        <ArtistNotificationsLanding copy={ARTIST_NOTIFICATIONS_COPY} />
      </PublicPageShell>
    </RecipeChrome>
}`,...W.parameters?.docs?.source}}},G.parameters={...G.parameters,docs:{...G.parameters?.docs,source:{originalSource:`{
  name: 'comparison',
  parameters: {
    docs: {
      description: {
        story: 'Proven recipe \`comparison\` — reference \`/compare/linktree\` using shipped comparison data + FaqSection.'
      }
    }
  },
  render: () => {
    const data = getComparison('linktree');
    if (!data) {
      return <RecipeChrome recipeId='comparison'>
          <p className='p-8 text-secondary-token'>Comparison data missing.</p>
        </RecipeChrome>;
    }
    return <RecipeChrome recipeId='comparison'>
        <PublicPageShell>
          <MarketingPageShell>
            <MarketingHero headingId='comparison-hero-heading' headline={data.heroHeadline} subtitle={data.heroSubheadline} primaryCta={{
            label: 'Get started',
            href: APP_ROUTES.SIGNUP
          }} logos={false} />

            <section aria-labelledby='comparison-matrix-heading' className='py-16' data-testid='marketing-section-comparison'>
              <MarketingContainer width='page'>
                <h2 id='comparison-matrix-heading' className='text-2xl font-semibold text-primary-token'>
                  Feature Matrix
                </h2>
                <section className='mt-8 overflow-x-auto' aria-label={\`Jovie vs \${data.competitor} feature matrix\`}
              // biome-ignore lint/a11y/noNoninteractiveTabindex: scrollable region needs a keyboard entry point for native scrolling (axe scrollable-region-focusable)
              tabIndex={0}>
                  <table className='w-full min-w-160 border-collapse text-left text-sm'>
                    <thead>
                      <tr className='border-b border-subtle'>
                        <th className='py-3 pr-4 font-medium text-secondary-token'>
                          Capability
                        </th>
                        <th className='py-3 pr-4 font-medium text-primary-token'>
                          Jovie
                        </th>
                        <th className='py-3 font-medium text-secondary-token'>
                          {data.competitor}
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.features.map(row => <tr key={row.name} className='border-b border-subtle'>
                          <th scope='row' className='py-3 pr-4 font-normal text-primary-token'>
                            {row.name}
                            {row.note ? <span className='mt-1 block text-xs text-tertiary-token'>
                                {row.note}
                              </span> : null}
                          </th>
                          <td className='py-3 pr-4'>
                            {row.jovie ? <Check className='h-4 w-4 text-accent-green' aria-label='Yes' /> : <Minus className='h-4 w-4 text-tertiary-token' aria-label='No' />}
                          </td>
                          <td className='py-3'>
                            {row.competitor ? <Check className='h-4 w-4 text-secondary-token' aria-label='Yes' /> : <Minus className='h-4 w-4 text-tertiary-token' aria-label='No' />}
                          </td>
                        </tr>)}
                    </tbody>
                  </table>
                </section>
              </MarketingContainer>
            </section>

            <FaqSection items={data.faq ?? [...STORY_FAQ_ITEMS]} />
            <MarketingFinalCTA />
          </MarketingPageShell>
        </PublicPageShell>
      </RecipeChrome>;
  }
}`,...G.parameters?.docs?.source}}},K.parameters={...K.parameters,docs:{...K.parameters?.docs,source:{originalSource:`{
  name: 'launch',
  parameters: {
    docs: {
      description: {
        story: 'Proven recipe \`launch\` — thin product composition mirroring \`/launch\` grammar (hero + feature beats + close). Full long-form narrative stays on the route.'
      }
    }
  },
  render: () => <RecipeChrome recipeId='launch'>
      <PublicPageShell>
        <MarketingPageShell>
          <MarketingHero headingId='launch-hero-heading' headline='Your Entire Music Career. One Intelligent Link.' subtitle='Jovie launches the release system independent artists use to capture every fan and reactivate them automatically.' primaryCta={{
          label: 'Get started',
          href: APP_ROUTES.SIGNUP
        }} logos={false} />
          <section className='py-16' data-testid='marketing-section-feature-split'>
            <MarketingContainer width='page'>
              <h2 className='text-2xl font-semibold text-primary-token'>
                One Profile For Every Drop
              </h2>
              <p className='mt-4 max-w-prose text-secondary-token'>
                Adaptive artist profiles, smart links, deeplinks, and fan
                notifications — the launch narrative on \`/launch\` expands each
                beat; this story holds the recipe shell for visual QA.
              </p>
            </MarketingContainer>
          </section>
          <MarketingFinalCTA title='Get Started' ctaLabel='Get started' ctaHref={APP_ROUTES.SIGNUP} />
        </MarketingPageShell>
      </PublicPageShell>
    </RecipeChrome>
}`,...K.parameters?.docs?.source}}},q.parameters={...q.parameters,docs:{...q.parameters?.docs,source:{originalSource:`{
  name: 'seo',
  parameters: {
    docs: {
      description: {
        story: 'Proven recipe \`seo\` — reference \`/about\` grammar (hero + FAQ + close). FAQPage schema lives on the route.'
      }
    }
  },
  render: () => <RecipeChrome recipeId='seo'>
      <PublicPageShell>
        <MarketingPageShell>
          <MarketingHero headingId='seo-hero-heading' headline='About Jovie' subtitle='Jovie is one product for presence, relationships, and growth — for artists, founders, authors, creators, and independent experts.' primaryCta={{
          label: 'Get started',
          href: APP_ROUTES.SIGNUP
        }} logos={false} align='left' />
          <FaqSection items={[...STORY_FAQ_ITEMS]} />
          <MarketingFinalCTA />
        </MarketingPageShell>
      </PublicPageShell>
    </RecipeChrome>
}`,...q.parameters?.docs?.source}}},J.parameters={...J.parameters,docs:{...J.parameters?.docs,source:{originalSource:`{
  name: 'blog-landing',
  parameters: {
    docs: {
      description: {
        story: 'Proven recipe \`blog-landing\` — reference \`/blog\` using StoryBlogCard fixtures (no filesystem/network fetch in Storybook).'
      }
    }
  },
  render: () => {
    const [featured, ...rest] = STORY_BLOG_POSTS;
    return <RecipeChrome recipeId='blog-landing'>
        <PublicPageShell>
          <MarketingPageShell>
            <MarketingHero variant='left'>
              <MarketingContainer width='page'>
                <h1 className='text-4xl font-semibold tracking-tight text-primary-token'>
                  Blog
                </h1>
                <p className='mt-4 max-w-prose text-lg text-secondary-token'>
                  Signals, playbooks, and product notes for building lasting
                  momentum as an independent artist.
                </p>
              </MarketingContainer>
            </MarketingHero>

            <section className='py-12' data-testid='marketing-section-blog-feed'>
              <MarketingContainer width='page'>
                {featured ? <StoryBlogCard post={featured} variant='featured' /> : null}
                <div className='mt-8 grid gap-6 md:grid-cols-2'>
                  {rest.map(post => <StoryBlogCard key={post.slug} post={post} />)}
                </div>
              </MarketingContainer>
            </section>

            <MarketingFinalCTA title='Stay In The Loop' body='Claim a profile when you are ready to put the playbooks into practice.' />
          </MarketingPageShell>
        </PublicPageShell>
      </RecipeChrome>;
  }
}`,...J.parameters?.docs?.source}}},Y.parameters={...Y.parameters,docs:{...Y.parameters?.docs,source:{originalSource:`{
  name: 'agency-lp',
  tags: ['stub'],
  parameters: {
    docs: {
      disable: true
    }
  },
  render: () => <StubRecipeStory recipeId='agency-lp' />
}`,...Y.parameters?.docs?.source}}},X.parameters={...X.parameters,docs:{...X.parameters?.docs,source:{originalSource:`{
  name: 'enterprise',
  tags: ['stub'],
  parameters: {
    docs: {
      disable: true
    }
  },
  render: () => <StubRecipeStory recipeId='enterprise' />
}`,...X.parameters?.docs?.source}}},Z.parameters={...Z.parameters,docs:{...Z.parameters?.docs,source:{originalSource:`{
  name: 'waitlist',
  tags: ['stub'],
  parameters: {
    docs: {
      disable: true
    }
  },
  render: () => <StubRecipeStory recipeId='waitlist' />
}`,...Z.parameters?.docs?.source}}}})))()}$();export{Q as __namedExportsOrder,Y as agencyLp,H as artistLp,U as artistLpMobile,J as blogLanding,G as comparison,L as default,X as enterprise,W as feature,R as homepage,z as homepageMobile,K as launch,B as pricing,V as pricingMobile,q as seo,Z as waitlist};