# Canonical artist-site experience

- **Status:** Founder-locked first-cohort reference
- **Decision:** JOV-6571
- **Certification consumer:** JOV-6572
- **Reference artist:** [Tim White](https://jov.ie/tim)
- **Reviewed:** 2026-10-14

This is the bounded taste contract for the artist experience. It applies the
one-coherent-artist-site IA from JOV-6196 to the exact journey below. It does
not define generalized machine certification.

EVENT: JOV-6571 locks Tim White's production-faithful artist site as the
first-cohort reference. The site leads with the artist, current music, and one
obvious action; Jovie remains supporting infrastructure.

## Canonical journey

| Moment | Approved experience |
| --- | --- |
| Profile | `/tim` opens as Tim White's site: identity, current music, and the primary Listen action lead. Product chrome does not compete with the artist. |
| Music | Home, Music, Events, and About are four modes of the same site. Music does not introduce a second navigation model. |
| Smart Link | A release opens in the native artist/release shell, names the artist, offers streaming destinations, and has an explicit `Back to Tim White` route to `/tim`. `/tim/never-say-a-word` is the reference release loop. |
| Claim | An unclaimed profile remains visibly complete. Claim copy says the profile is ready and asks the artist to verify/take ownership; it never presents an empty site builder. |
| Free | Free is a durable public profile plus audience capture. It remains useful without payment and is described as free forever. |
| Pro | Artist Presence is the explicit `$199/mo` expansion. Limited access is honest; the handoff does not imply that payment is required for the basic artist site. |
| After claim | Ownership persists onto the existing profile and its dashboard. The next state is first value on the claimed site, not “start your profile” from zero. |
| After pay | Checkout stays pending until verified, has an honest recovery state, and only then shows `Artist Visibility is starting` with Monitor → Surface → Approve → Fix and an `Open Artist Visibility` action. |

## Keep / change / hide

### Keep

- The artist-first hierarchy: portrait/name, current music, one primary action.
- Home / Music / Events / About as one shared navigation contract on compact
  and wide presentations.
- The profile → release → Smart Link → artist return loop and its shared visual
  language.
- Claim as ownership of a populated profile, including unsupported and
  in-progress truthful states.
- A complete Free state and the explicit, non-coercive `$199/mo` Pro handoff.
- Pending, recovery, and activated post-pay states; never infer entitlement
  from a return URL alone.

### Change

- The canonical liquid-glass selector uses 1px inline rail padding. With the
  existing 1px border, 32px rail, and 28px face, the first/last face inset is
  optically the same 2px as top/bottom.
- Preserve the 44px target row, rail/face height, one shared moving face,
  spring behavior, and reduced-motion snap.

![390px About edge state after normalization](../screenshots/jov-6571/selector-390-about.png)

**Ship now / Re-evaluate when / Then:** ship the normalized 2px optical edge
inset now; re-evaluate only if JOV-6536 physical-iPhone evidence shows a Safari
geometry mismatch; then adjust this shared control rather than fork it.

### Hide

The first-cohort reference path must not expose tips/pay, broad AI panels, deep
audience intelligence, or extra operator controls. These capabilities may
continue to exist elsewhere, but certification should treat their presence on
the Tim White reference journey as a failure until a separate founder decision
makes one necessary to the promise. Missing data uses an honest empty or
unsupported state; no placeholder control may imply fake completeness.

## Review and certification handoff

- Geometry is covered at 320px, 390px, and the 768px md+ compact presentation,
  across all four positions and rapid transitions. The 44px targets and
  32px/28px visual geometry remain fixed.
- The existing public-profile layout matrix covers mobile through desktop; the
  shipped desktop default is the compact artist site centered in the page
  while the separate wide surface remains feature-gated.
- The production profile and reference release were reachable during this
  review, and the release returned to the artist profile. Pricing published
  Free, `$199/mo` Pro, and the truthful limited-access handoff.
- JOV-6572 should consume the journey and keep/change/hide rules above. It must
  not broaden JOV-6571 into a new selector, a new IA, or generalized
  certification.
