# Artist Profiles Landing Page Social Proof Plan

## Goal

Use social proof as real trust reinforcement, not filler. The page should prove reality through actual product usage and actual artist context, while avoiding founder-first storytelling near the top.

## Option Comparison

| Option | Score | Strength | Risk | Recommendation |
| --- | --- | --- | --- | --- |
| Logo bar only | 5/10 | Real and quiet. Works as a whisper near the top. | Weak on product trust by itself. Feels abstract without product context. | Use only as supporting proof, not the main proof block. |
| Founder quote | 4/10 | Credible as a fallback and useful for origin context. | Too self-referential. Weak as primary proof on a product page. | Keep as fallback only and place low on the page. |
| Artist quote carousel or artist proof cards | 9/10 if real | Strongest proof because it connects real artists to real workflows and real product use. | Fails hard if quotes are invented, thin, or unapproved. | Best launch structure if the proof is real. |

## Recommended Launch Structure

### Near The Top

- Use a minimal proof whisper or restrained logo row only.
- Recommended line: `Used by artists on`
- Keep this quiet and secondary to the hero.

### Lower On The Page

- Primary proof block should be real artist proof cards or real artist quote cards.
- If real quotes do not exist yet, use a live-profile board paired with existing logos.
- Founder proof can appear below that only if artist-proof inventory is not ready.

## Launch Fallback

If there are no approved artist quotes, do not invent testimonials. Use:

1. Real live-profile cards
2. Existing logo proof
3. A restrained founder fallback only below the primary proof block

## Proof Entry Schema

Use this placeholder structure for future proof collection:

| Field | Description |
| --- | --- |
| `artistName` | Public artist name |
| `roleGenre` | Useful context such as DJ, producer, or genre |
| `image` | Approved artist image or profile image |
| `quote` | Approved short quote |
| `useCase` | What they use Jovie for, such as releases, touring, or support |

## Feature-Flag Rule

- Hide the full artist-proof section until there are at least three approved entries with a real image and a real quote.
- Until that threshold is met, render the low-risk fallback only.
- Do not ship placeholder cards, initials-only testimonials, or fabricated metrics.

## Placement Rules

- Do not place founder-first proof near the hero.
- Do not use a generic "trusted by musicians" pattern with invented numbers.
- Do not use fake testimonials, fake metrics, or abstract startup proof.
- Prefer real profile cards first, logos second, founder quote third.
