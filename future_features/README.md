# Future Features

This directory contains detailed specifications for planned features and enhancements for Jovie.

## Purpose

The `future_features/` directory serves as a central repository for feature planning and documentation. Each feature is documented in its own markdown file with comprehensive specifications including:

- User stories and requirements
- Technical implementation details
- UI/UX considerations
- Integration points
- Testing strategies

## Master Plan

See **[MASTER_PLAN.md](./MASTER_PLAN.md)** for the consolidated feature roadmap, implementation order, and cross-cutting concerns.

## Feature Specs

### Artist Tools & Workflow

#### ISRC Auto-Generation (`isrc-generation.md`)
Auto-generate valid, unique ISRC codes during release creation. Includes prefix settings, sequential designation tracking, and three-layer duplicate protection with AI chat alerts.

#### Lyrics Auto-Format (`lyrics-auto-format.md`)
One-click formatting of lyrics to Apple Music guidelines. Deterministic rule engine with diff preview covering capitalization, section labels, whitespace, punctuation, and chorus expansion.

#### Handle Claim Onboarding (`claim-handle.md`)
Replace homepage search with handle-claim input flow. Clerk auth integration with Spotify artist selection.

### Revenue & Monetization

#### Tip Jar (`tip-jar.md`)
One-tap tipping at `/:handle/tip` with Stripe PaymentRequest (Apple Pay/Google Pay), preset amounts, and post-tip notification opt-in.

#### Presale Profile Takeover (`../docs/features/presale-profile-takeover.md`)
Announcement date triggers profile takeover, smart link activation, and subscriber email — all at once. 6-phase implementation.

### Fan Engagement

#### Universal Artist Notifications (`universal-artist-notifications.md`)
Cross-platform notification system. Email MVP with subscriber management, category subscriptions, and suppression lists.

#### Tour Dates (`tour-dates.md`)
Geo-aware tour banner, full tour listing page, Songkick API integration, ICS calendar downloads, and smart distance-based notifications.

### Discovery

#### View on Mobile QR (`view-on-mobile.md`)
Desktop QR overlay nudging visitors to mobile. Dismissible with localStorage suppression, UTM tracking.

## Contributing to Future Features

### Adding New Features

1. **Create a new markdown file** in this directory
2. **Follow the existing template** structure:
   - Feature overview and goals
   - User stories and requirements
   - Technical specifications
   - UI/UX considerations
   - Implementation notes
   - Testing requirements

3. **Update this README** to include the new feature
4. **Update the main README.md** to reference the new feature

### Feature Specification Template

```markdown
# Feature Name

## Overview

Brief description of the feature and its goals.

## User Stories

- As a [user type], I want [goal] so that [benefit]

## Technical Requirements

- Technical specifications
- Integration points
- Performance considerations

## UI/UX Considerations

- Design requirements
- User experience flow
- Accessibility considerations

## Implementation Notes

- Development approach
- Potential challenges
- Dependencies

## Testing Strategy

- Unit test requirements
- Integration test requirements
- E2E test scenarios
```

### Review Process

1. **Review existing features** to avoid duplication
2. **Consider integration points** with current features
3. **Assess technical feasibility** and dependencies
4. **Update documentation** when features are implemented
5. **Archive completed features** or move to implementation

## Implementation Status

- **Planned**: Features in this directory
- **In Progress**: Features being actively developed
- **Completed**: Features that have been implemented and moved to main codebase

## Notes

- Keep specifications up to date as requirements change
- Link to relevant issues or pull requests when implementation begins
- Consider breaking large features into smaller, manageable pieces
- Document any dependencies on external services or APIs
