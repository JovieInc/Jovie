# Screenshot Report System

Comprehensive screenshot reporting system that captures visual snapshots of all critical pages in the Jovie web app at multiple viewport sizes.

## 📋 Overview

This system generates screenshot reports showing how all critical pages look across desktop, mobile, and tablet viewports. It's useful for:

- Visual QA and regression testing
- Design reviews
- Documentation and onboarding
- Cross-device UI verification

## 🚀 Quick Start

### 1. Start Development Server

```bash
# From project root
pnpm --filter web dev
```

### 2. Generate Screenshot Report

```bash
# In another terminal, from apps/web directory
cd apps/web
pnpm screenshot:report
```

### 3. View the Report

```bash
pnpm screenshot:report:serve
```

Then open your browser to:
```
http://localhost:8080/[timestamp-directory]/
```

Example: `http://localhost:8080/2026-01-31-22-30-45/`

## 📁 Report Structure

```
screenshot-reports/
└── 2026-01-31-22-30-45/           # Timestamped directory
    ├── index.html                  # Interactive HTML report
    └── screenshots/
        ├── homepage/
        │   ├── desktop-1280x720.png
        │   ├── mobile-375x667.png
        │   └── tablet-768x1024.png
        ├── pricing/
        ├── profile-dualipa/
        └── ...
```

## 📸 Captured Pages

### Marketing Pages
- Homepage (`/`)
- Pricing (`/pricing`)
- Sign up (`/sign-up`)
- Engagement engine (`/engagement-engine`)
- Support (`/support`)

### Public Profiles
- Dua Lipa profile (`/dualipa`)
- Taylor Swift profile (`/taylorswift`)

### Error Pages
- 404 - Profile not found
- 404 - Route not found

## 🖥️ Viewport Sizes

- **Desktop**: 1280x720
- **Mobile**: 375x667 (iPhone 8/SE)
- **Tablet**: 768x1024 (iPad portrait)

## 🎨 HTML Report Features

- **Interactive Grid Layout**: Browse screenshots organized by page
- **Click-to-Enlarge**: View full-size screenshots in modal
- **Dark Mode Support**: Automatically adapts to system preference
- **Navigation**: Jump between page categories
- **Metadata Display**: See file sizes, timestamps, success/failure status
- **Error Reporting**: Visual indicators for failed screenshots

## 🛠️ Technical Details

### Files Created

1. **`tests/e2e/utils/screenshot-capture.ts`**
   - Reusable utilities for multi-viewport screenshot capture
   - Reuses patterns from existing smoke tests and visual regression tests

2. **`scripts/generate-screenshot-report.ts`**
   - Main orchestration script
   - Generates timestamped reports with HTML viewer

3. **`screenshot-reports/.gitkeep`**
   - Maintains directory structure in git
   - Reports are gitignored to save space

### Dependencies

**No new dependencies required!** Uses existing:
- `@playwright/test`: Browser automation
- `tsx`: TypeScript execution

### Performance

- **Execution Time**: ~30-60 seconds for 10 pages × 3 viewports
- **Parallel Processing**: Captures screenshots sequentially per page
- **Report Size**: ~5-20 MB per report (depends on page complexity)
- **Storage**: Reports are gitignored; manual cleanup recommended

## 🔍 Error Handling

The system gracefully handles:
- Page load failures (captures error state)
- Navigation timeouts (retries once with extended timeout)
- Screenshot save failures (logs error, continues processing)
- Network issues (uses retry logic with exponential backoff)

Failed screenshots are marked in the HTML report with:
- Warning indicators (⚠️)
- Error messages
- Placeholder content

## 🎯 Use Cases

### Visual QA
Generate reports before/after changes to verify no visual regressions:
```bash
# Before changes
pnpm screenshot:report

# After changes
pnpm screenshot:report

# Compare the two timestamped directories
```

### Design Reviews
Share screenshot reports with designers to review implementation:
```bash
# Generate report
pnpm screenshot:report

# Share the HTML report (can be opened locally)
```

### Documentation
Use screenshots in onboarding docs or README files.

## 🚧 Future Enhancements

Potential additions (not implemented):

1. **CLI Flags**: Filter specific pages or viewports
2. **Theme Support**: Capture both light and dark modes
3. **Auth Pages**: Add support for authenticated routes
4. **CI Integration**: GitHub Action for nightly reports
5. **Comparison Mode**: Compare screenshots between runs
6. **Lighthouse Scores**: Include performance metrics

## 📝 npm Scripts

- `pnpm screenshot:report` - Generate screenshot report
- `pnpm screenshot:report:serve` - Serve reports via HTTP server

## 🧹 Cleanup

Reports are stored in `screenshot-reports/` and are gitignored. To clean up old reports:

```bash
# Remove all reports
rm -rf screenshot-reports/*

# Keep the .gitkeep file
touch screenshot-reports/.gitkeep

# Or remove reports older than 7 days
find screenshot-reports -type d -mtime +7 -exec rm -rf {} +
```

## 🐛 Troubleshooting

### Server not running
```
Error: connect ECONNREFUSED ::1:3100
```
**Solution**: Start the dev server first with `pnpm --filter web dev`

### Port 8080 already in use
```
Error: [Errno 48] Address already in use
```
**Solution**: Use a different port:
```bash
python3 -m http.server 8081 --directory screenshot-reports
```

### Screenshots show error pages
Check that:
1. Dev server is running
2. Database is seeded (test profiles exist)
3. No critical errors in console

## 📚 Related Documentation

- Smoke Tests: `apps/web/tests/e2e/smoke-public.spec.ts`
- Visual Regression: `apps/web/tests/e2e/visual-regression.spec.ts`
- Test Utilities: `apps/web/tests/e2e/utils/smoke-test-utils.ts`

## 🤝 Contributing

To add new pages to the report:

1. Edit `scripts/generate-screenshot-report.ts`
2. Add entry to `PUBLIC_PAGES` array:
   ```typescript
   {
     name: 'my-new-page',
     path: '/my-new-page',
     description: 'Description of the page'
   }
   ```
3. Run `pnpm screenshot:report` to test

To add new viewport sizes:

1. Edit `tests/e2e/utils/screenshot-capture.ts`
2. Add entry to `VIEWPORT_PRESETS` array:
   ```typescript
   { name: 'my-viewport', width: 1920, height: 1080 }
   ```
