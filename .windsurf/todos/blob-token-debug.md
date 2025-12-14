---
description: investigate blob upload token issue
---

TODO

- [ ] Confirm expected blob env var names and where they are read in code
- [ ] Inspect blob upload client/config; identify token lookup path (server/client)
- [ ] Reproduce error locally or via logs; capture stack trace/message location
- [ ] Patch config or env wiring to ensure token is passed to uploader
- [ ] Verify uploads locally (mock) and, if possible, via staging; add test if feasible
- [ ] Document required env vars for servers
