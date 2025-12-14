---
description: Fix CodeQL alert for incomplete URL substring sanitization in UniversalLinkInput
---
- [ ] Harden normalizeUrl to reject unsafe schemes/control chars (javascript:, data:, mailto:, encoded CR/LF)
- [ ] Add validation guard in UniversalLinkInput before detectPlatform/onAdd
- [ ] Add regression tests for malicious inputs (platform-detection + UniversalLinkInput keyboard flow)
- [ ] Run pnpm lint && pnpm test:fast
