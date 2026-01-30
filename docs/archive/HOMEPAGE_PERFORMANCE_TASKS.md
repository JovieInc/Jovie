# Homepage Performance Tasks

## Overview

The marketing home page should feel instantaneous. This checklist tracks refinements that keep the experience crisp and light.

## Open Tasks

- [ ] Preload critical fonts to remove first paint flashes
- [ ] Defer offscreen sections with `IntersectionObserver`
- [ ] Audit images and enable `loading="lazy"` where possible
- [ ] Explore server components to trim client bundle further

## Completed

- [x] Add a performance budget guard for the `/` route
