# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: storybook-shared-sidebar.spec.ts >> shared Jovie rail keeps vertical geometry and exclusive controls
- Location: tests/e2e/storybook-shared-sidebar.spec.ts:16:7

# Error details

```
Error: expect(locator).toHaveAttribute(expected) failed

Locator:  locator('#shell-left-rail')
Expected: "true"
Received: ""
Timeout:  25000ms

Call log:
  - Expect "toHaveAttribute" with timeout 25000ms
  - waiting for locator('#shell-left-rail')
    54 × locator resolved to <div inert="" data-side="left" aria-hidden="true" data-state="closed" id="shell-left-rail" data-variant="sidebar" data-rail-pinned="false" data-rail-phase="closed" data-rail-floating="true" data-collapsible="offcanvas" data-rail-preview-region="left" class="group peer relative max-lg:hidden h-full min-h-0 shrink-0 overflow-visible text-sidebar-foreground lg:sticky lg:top-0 lg:z-10 transition-shell-rail-allocation duration-shell-rail ease-cinematic motion-reduce:transition-none">…</div>
       - unexpected value "null"

```

```yaml
- main:
  - button "Ask Jovie": Jovie
  - button "Expand sidebar"
  - heading "Home" [level=1]
  - text: Your workspace Activity
- region "Notifications alt+T"
```

# Test source

```ts
  1   | import { expect, test } from '@playwright/test';
  2   | 
  3   | const story = (operator = false) =>
  4   |   `/iframe.html?id=organisms-unifiedsidebar--${operator ? 'operator-shared-shell' : 'shared-shell'}&viewMode=story`;
  5   | 
  6   | interface ScaleFlowWindow {
  7   |   sidebarFlowMarks: { phase: string; time: number }[];
  8   |   sidebarFlowFrames: number[];
  9   |   sidebarFlowRaf: number;
  10  |   sidebarPaletteRenderSamples: { phase: string; duration: number }[];
  11  |   sidebarScaleTasks: { duration: number; start: number }[];
  12  |   sidebarScaleObserver: PerformanceObserver;
  13  | }
  14  | 
  15  | for (const operator of [false, true]) {
  16  |   test(`shared ${operator ? 'Ovie' : 'Jovie'} rail keeps vertical geometry and exclusive controls`, async ({
  17  |     page,
  18  |   }, info) => {
  19  |     await page.setViewportSize({ width: 1440, height: 900 });
  20  |     await page.goto(story(operator), { waitUntil: 'domcontentloaded' });
  21  |     const rail = page.locator('#shell-left-rail');
  22  |     const header = page.locator('[data-app-shell-header="true"]');
  23  |     const footer = page.locator('[data-sidebar="footer"]');
  24  |     const content = page.getByTestId('sidebar-experience-content');
  25  |     await expect(
  26  |       page.getByRole('button', { name: 'Collapse sidebar', exact: true })
  27  |     ).toBeVisible();
  28  |     const bounds = async () => ({
  29  |       header: await header.boundingBox(),
  30  |       footer: await footer.boundingBox(),
  31  |       content: await content.boundingBox(),
  32  |     });
  33  |     const pinned = await bounds();
  34  |     const pinnedBrand = await page
  35  |       .getByTestId('ask-jovie-trigger')
  36  |       .filter({ visible: true })
  37  |       .boundingBox();
  38  |     await page.screenshot({ path: info.outputPath('pinned.png') });
  39  |     const menuTrigger = page.getByRole('button', {
  40  |       name: operator ? 'More Pages' : 'Recent Chats',
  41  |     });
  42  |     await menuTrigger.click();
  43  |     const overlay = page.locator(
  44  |       `[data-sidebar-flyout="${operator ? 'more' : 'recent'}"]`
  45  |     );
  46  |     await expect(overlay).toBeVisible();
  47  |     const popup = await overlay.boundingBox();
  48  |     expect(popup!.y).toBeGreaterThanOrEqual(
  49  |       pinned.header!.y + pinned.header!.height + 8
  50  |     );
  51  |     expect(await bounds()).toEqual(pinned);
  52  |     await page.screenshot({ path: info.outputPath('open-menu.png') });
  53  |     await page.keyboard.press('Escape');
  54  |     await expect(menuTrigger).toBeFocused();
  55  |     await page
  56  |       .getByRole('button', { name: 'Collapse sidebar', exact: true })
  57  |       .click();
  58  |     await expect(rail).toHaveAttribute('data-rail-phase', 'closed');
  59  |     const collapsed = await bounds();
  60  |     const collapsedBrand = await page
  61  |       .getByTestId('ask-jovie-trigger')
  62  |       .filter({ visible: true })
  63  |       .boundingBox();
  64  |     expect(collapsedBrand!.x).toBe(pinnedBrand!.x);
  65  |     expect(collapsedBrand!.y).toBe(pinnedBrand!.y);
  66  |     expect(collapsed.header!.y).toBe(pinned.header!.y);
  67  |     expect(collapsed.content!.y).toBe(pinned.content!.y);
  68  |     await expect(
  69  |       page.getByRole('button', { name: 'Expand sidebar', exact: true })
  70  |     ).toHaveCount(1);
  71  |     await expect(page.locator('[data-sidebar-toolbar="true"]')).toBeHidden();
  72  |     await page.screenshot({ path: info.outputPath('collapsed.png') });
  73  |     await page
  74  |       .getByRole('button', { name: 'Expand sidebar', exact: true })
  75  |       .click();
> 76  |     await expect(rail).toHaveAttribute('data-rail-preview', 'true');
      |                        ^ Error: expect(locator).toHaveAttribute(expected) failed
  77  |     const floating = await bounds();
  78  |     expect(floating.header).toEqual(collapsed.header);
  79  |     expect(floating.content).toEqual(collapsed.content);
  80  |     expect(floating.footer!.y).toBe(pinned.footer!.y);
  81  |     const surface = await page
  82  |       .locator('[data-sidebar-surface="true"]')
  83  |       .boundingBox();
  84  |     expect(surface!.y).toBe(pinned.header!.y + pinned.header!.height + 8);
  85  |     expect(surface!.width).toBe(244);
  86  |     await page.screenshot({ path: info.outputPath('floating.png') });
  87  |     await menuTrigger.click();
  88  |     await expect(overlay).toBeVisible();
  89  |     expect(await bounds()).toEqual(floating);
  90  |     await page.keyboard.press('Escape');
  91  |     await expect(menuTrigger).toBeFocused();
  92  |     await expect(rail).toHaveAttribute('data-rail-preview', 'true');
  93  |     await page.keyboard.press('Escape');
  94  |     await expect(rail).not.toHaveAttribute('data-rail-preview', 'true');
  95  |     await expect(
  96  |       page.getByRole('button', { name: 'Expand sidebar', exact: true })
  97  |     ).toBeFocused();
  98  |     await page.keyboard.press('Enter');
  99  |     const pin = page.getByRole('button', { name: 'Pin Sidebar', exact: true });
  100 |     await pin.focus();
  101 |     await page.keyboard.press('Enter');
  102 |     await expect(
  103 |       page.getByRole('button', { name: 'Collapse sidebar', exact: true })
  104 |     ).toBeFocused();
  105 |     await expect(rail).not.toHaveAttribute('data-rail-preview', 'true');
  106 |   });
  107 | }
  108 | 
  109 | for (const width of [320, 375, 390, 768]) {
  110 |   test(`compact overflow stays in its drawer at ${width}px`, async ({
  111 |     page,
  112 |   }) => {
  113 |     await page.setViewportSize({ width, height: 700 });
  114 |     await page.goto(story(true), { waitUntil: 'domcontentloaded' });
  115 |     await page
  116 |       .getByRole('button', { name: 'Expand sidebar', exact: true })
  117 |       .click();
  118 |     const drawer = page.locator('[data-sidebar="sidebar"][data-mobile="true"]');
  119 |     await expect(drawer).toBeVisible();
  120 |     await drawer.getByRole('button', { name: 'More Pages' }).click();
  121 |     const menu = drawer.locator('[data-sidebar-flyout="more"]');
  122 |     await expect(menu).toBeVisible();
  123 |     await expect(
  124 |       menu.getByRole('menuitem', { name: 'Back', exact: true })
  125 |     ).toBeVisible();
  126 |     const box = await menu.boundingBox();
  127 |     const drawerBox = await drawer.boundingBox();
  128 |     expect(box!.x).toBeGreaterThanOrEqual(drawerBox!.x);
  129 |     expect(box!.x + box!.width).toBeLessThanOrEqual(
  130 |       drawerBox!.x + drawerBox!.width
  131 |     );
  132 |     await menu.getByRole('menuitem', { name: 'Back', exact: true }).click();
  133 |     await expect(drawer).toBeVisible();
  134 |     await expect(
  135 |       drawer.getByRole('button', { name: 'More Pages' })
  136 |     ).toBeFocused();
  137 |     expect(
  138 |       await page.evaluate(
  139 |         () => document.documentElement.scrollWidth <= innerWidth
  140 |       )
  141 |     ).toBe(true);
  142 |   });
  143 | }
  144 | 
  145 | test('Recent stays within the mobile drawer with a reversible Back action', async ({
  146 |   page,
  147 | }) => {
  148 |   await page.setViewportSize({ width: 375, height: 700 });
  149 |   await page.goto(story(), { waitUntil: 'domcontentloaded' });
  150 |   await page
  151 |     .getByRole('button', { name: 'Expand sidebar', exact: true })
  152 |     .click();
  153 |   const drawer = page.locator('[data-sidebar="sidebar"][data-mobile="true"]');
  154 |   await drawer.getByRole('button', { name: 'Recent Chats' }).click();
  155 |   const recent = drawer.locator('[data-sidebar-flyout="recent"]');
  156 |   await expect(recent).toBeVisible();
  157 |   const box = await recent.boundingBox();
  158 |   expect(box!.x).toBeGreaterThanOrEqual(0);
  159 |   expect(box!.x + box!.width).toBeLessThanOrEqual(375);
  160 |   await recent.getByRole('button', { name: 'Back', exact: true }).click();
  161 |   await expect(
  162 |     drawer.getByRole('button', { name: 'Recent Chats' })
  163 |   ).toBeFocused();
  164 |   await expect(drawer).toBeVisible();
  165 | });
  166 | 
  167 | for (const width of [1024, 1440, 1920]) {
  168 |   test(`detached media preserves the real composer at ${width}px and short height`, async ({
  169 |     page,
  170 |   }) => {
  171 |     await page.setViewportSize({ width, height: 450 });
  172 |     await page.goto(
  173 |       '/iframe.html?id=organisms-unifiedsidebar--shared-media-shell&viewMode=story',
  174 |       { waitUntil: 'domcontentloaded' }
  175 |     );
  176 |     const composer = page.getByTestId('chat-composer-surface');
```