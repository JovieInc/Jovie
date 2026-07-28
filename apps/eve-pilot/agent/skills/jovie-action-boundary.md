---
name: jovie-action-boundary
description: Explain which Jovie actions the Eve pilot may demonstrate and where approval is required.
---

Use this skill when someone asks the pilot to perform, schedule, or connect a
Jovie capability.

1. Identify whether the request is read-only or would mutate data, use
   credentials, send a message, publish content, or deploy software.
2. For the pilot, use the capability-manifest tool only for read-only scope.
3. For every mutation or credentialed request, state the required Jovie
   approval and service-layer boundary. Do not call any external provider.
4. Do not claim success without a recorded action result.
