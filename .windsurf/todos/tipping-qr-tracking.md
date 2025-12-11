# Tipping QR vs link tracking
- [ ] Add a QR-only param (e.g., `source=qr`) to generated tip QR URLs in DashboardTipping/QRCodeCard.
- [ ] Ensure tip redirect page preserves source and fires `/api/track` with linkType `tip`, linkId null, metadata.source = `qr` or `link`.
- [ ] Update `/api/track` validation to accept optional `source` and store it in `metadata` for tip events.
- [ ] Update dashboard aggregation (app/dashboard/actions.ts) to count tip clicks by source: `qr`, `link`, and combined.
- [ ] Update DashboardTipping UI to show QR scans, link clicks, and total opens (plus existing tips submitted/amounts).
- [ ] Add tests (unit/integration) for tracking source and dashboard stats where feasible.
