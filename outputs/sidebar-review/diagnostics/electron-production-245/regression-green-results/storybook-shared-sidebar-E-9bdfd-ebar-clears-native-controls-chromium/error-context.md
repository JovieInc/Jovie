# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: storybook-shared-sidebar.spec.ts >> Electron collapsed Jovie titlebar clears native controls
- Location: tests/e2e/storybook-shared-sidebar.spec.ts:16:7

# Error details

```
Error: expect(received).toEqual(expected) // deep equality

- Expected  - 1
+ Received  + 1

  Object {
    "height": 28,
-   "width": 28,
+   "width": 16,
    "x": 140,
    "y": 8,
  }
```

# Page snapshot

```yaml
- generic [ref=e2]:
  - generic [ref=e4]:
    - generic [ref=e6]:
      - button "Ask Jovie" [ref=e7]:
        - img [ref=e10]
        - generic:
          - generic: Jovie
      - button "Expand sidebar" [active] [ref=e12] [cursor=pointer]:
        - img [ref=e14]
      - generic [ref=e16]:
        - button "Go Back" [disabled]:
          - img
        - button "Go Forward" [disabled]:
          - img
    - generic [ref=e17]:
      - generic:
        - generic [ref=e18]:
          - link [ref=e19] [cursor=pointer]:
            - /url: /app
            - img [ref=e20]
          - button [ref=e23]:
            - img [ref=e24]
        - generic [ref=e27]:
          - link [ref=e29] [cursor=pointer]:
            - /url: /app/chat
            - generic [ref=e30]: New chat
          - link [ref=e31] [cursor=pointer]:
            - /url: /app
            - img [ref=e32]
          - link [ref=e35] [cursor=pointer]:
            - /url: /app/presence
            - img [ref=e36]
          - link [ref=e39] [cursor=pointer]:
            - /url: /app/library
            - img [ref=e40]
          - link [ref=e44] [cursor=pointer]:
            - /url: /app/contacts?tab=audience
            - img [ref=e45]
        - group [ref=e51]:
          - button [ref=e53]:
            - generic [ref=e56]: TW
      - main [ref=e61]:
        - heading "Home" [level=1] [ref=e67]
        - generic [ref=e72]:
          - generic [ref=e73]: Your workspace
          - generic [ref=e74]: Activity
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
  16  |   test(`Electron collapsed ${operator ? 'Ovie' : 'Jovie'} titlebar clears native controls`, async ({
  17  |     page,
  18  |   }) => {
  19  |     await page.setViewportSize({ width: 1024, height: 600 });
  20  |     await page.addInitScript(() => {
  21  |       // Layout-only bridge fixture. Actual Electron overlay bounds are covered
  22  |       // separately; this CI regression exercises the real shell and stylesheet.
  23  |       Object.assign(window, { electronAPI: { platform: 'darwin' } });
  24  |       document.addEventListener('DOMContentLoaded', () => {
  25  |         document.documentElement.dataset.desktopRuntime = 'electron';
  26  |       });
  27  |     });
  28  |     await page.goto(story(operator), { waitUntil: 'domcontentloaded' });
  29  |     const toggle = page.getByTestId('electron-sidebar-toggle');
  30  |     await expect(toggle).toBeVisible();
  31  |     const titlebar = page.getByTestId('electron-titlebar-row');
  32  |     const header = page.locator('[data-app-shell-header="true"]');
  33  |     const heading = header.getByRole('heading').first();
  34  |     const navigation = page.getByTestId('electron-nav-pill');
  35  | 
  36  |     // 72px is the compatibility fallback;100px was measured in Electron44.5.1.
  37  |     // A larger native reserve must also preserve reachability after resize.
  38  |     for (const nativeReserve of [72, 100, 120]) {
  39  |       await page.evaluate(reserve => {
  40  |         document.documentElement.style.setProperty(
  41  |           '--electron-traffic-light-safe-width',
  42  |           `${reserve}px`
  43  |         );
  44  |       }, nativeReserve);
  45  |       const pinnedToggle = await toggle.boundingBox();
  46  |       const pinnedHeader = await header.boundingBox();
  47  |       await toggle.click();
  48  |       await expect(page.locator('#shell-left-rail')).toHaveAttribute(
  49  |         'data-rail-phase',
  50  |         'closed'
  51  |       );
  52  |       const collapsedHeader = await header.boundingBox();
  53  |       const collapsedToggle = await toggle.boundingBox();
  54  |       const pageTitle = await heading.boundingBox();
  55  |       const controls = await navigation.boundingBox();
  56  |       expect(pageTitle!.x).toBeGreaterThanOrEqual(
  57  |         controls!.x + controls!.width
  58  |       );
> 59  |       expect(collapsedToggle).toEqual(pinnedToggle);
      |                               ^ Error: expect(received).toEqual(expected) // deep equality
  60  |       expect(collapsedHeader!.y).toBe(pinnedHeader!.y);
  61  |       expect((await titlebar.boundingBox())!.height).toBe(44);
  62  |       expect(collapsedHeader!.height).toBe(44);
  63  |       await toggle.press('Enter');
  64  |       await expect(page.locator('#shell-left-rail')).toHaveAttribute(
  65  |         'data-rail-preview',
  66  |         'true'
  67  |       );
  68  |       expect(await header.boundingBox()).toEqual(collapsedHeader);
  69  |       await page.keyboard.press('Escape');
  70  |       await expect(toggle).toBeFocused();
  71  |       await toggle.press('Enter');
  72  |       await page.getByRole('button', { name: 'Pin Sidebar', exact: true }).click();
  73  |       await expect(toggle).toHaveAccessibleName('Collapse sidebar');
  74  |     }
  75  |   });
  76  | }
  77  | 
  78  | for (const operator of [false, true]) {
  79  |   test(`shared ${operator ? 'Ovie' : 'Jovie'} rail keeps vertical geometry and exclusive controls`, async ({
  80  |     page,
  81  |   }, info) => {
  82  |     await page.setViewportSize({ width: 1440, height: 900 });
  83  |     await page.goto(story(operator), { waitUntil: 'domcontentloaded' });
  84  |     const rail = page.locator('#shell-left-rail');
  85  |     const header = page.locator('[data-app-shell-header="true"]');
  86  |     const footer = page.locator('[data-sidebar="footer"]');
  87  |     const content = page.getByTestId('sidebar-experience-content');
  88  |     await expect(
  89  |       page.getByRole('button', { name: 'Collapse sidebar', exact: true })
  90  |     ).toBeVisible();
  91  |     const bounds = async () => ({
  92  |       header: await header.boundingBox(),
  93  |       footer: await footer.boundingBox(),
  94  |       content: await content.boundingBox(),
  95  |     });
  96  |     const pinned = await bounds();
  97  |     const pinnedBrand = await page
  98  |       .getByTestId('ask-jovie-trigger')
  99  |       .filter({ visible: true })
  100 |       .boundingBox();
  101 |     await page.screenshot({ path: info.outputPath('pinned.png') });
  102 |     const menuTrigger = page.getByRole('button', {
  103 |       name: operator ? 'More Pages' : 'Recent Chats',
  104 |     });
  105 |     await menuTrigger.click();
  106 |     const overlay = page.locator(
  107 |       `[data-sidebar-flyout="${operator ? 'more' : 'recent'}"]`
  108 |     );
  109 |     await expect(overlay).toBeVisible();
  110 |     const popup = await overlay.boundingBox();
  111 |     expect(popup!.y).toBeGreaterThanOrEqual(
  112 |       pinned.header!.y + pinned.header!.height + 8
  113 |     );
  114 |     expect(await bounds()).toEqual(pinned);
  115 |     await page.screenshot({ path: info.outputPath('open-menu.png') });
  116 |     await page.keyboard.press('Escape');
  117 |     await expect(menuTrigger).toBeFocused();
  118 |     await page
  119 |       .getByRole('button', { name: 'Collapse sidebar', exact: true })
  120 |       .click();
  121 |     await expect(rail).toHaveAttribute('data-rail-phase', 'closed');
  122 |     const collapsed = await bounds();
  123 |     const collapsedBrand = await page
  124 |       .getByTestId('ask-jovie-trigger')
  125 |       .filter({ visible: true })
  126 |       .boundingBox();
  127 |     expect(collapsedBrand!.x).toBe(pinnedBrand!.x);
  128 |     expect(collapsedBrand!.y).toBe(pinnedBrand!.y);
  129 |     expect(collapsed.header!.y).toBe(pinned.header!.y);
  130 |     expect(collapsed.content!.y).toBe(pinned.content!.y);
  131 |     await expect(
  132 |       page.getByRole('button', { name: 'Expand sidebar', exact: true })
  133 |     ).toHaveCount(1);
  134 |     await expect(page.locator('[data-sidebar-toolbar="true"]')).toBeHidden();
  135 |     await page.screenshot({ path: info.outputPath('collapsed.png') });
  136 |     await page
  137 |       .getByRole('button', { name: 'Expand sidebar', exact: true })
  138 |       .click();
  139 |     await expect(rail).toHaveAttribute('data-rail-preview', 'true');
  140 |     const floating = await bounds();
  141 |     expect(floating.header).toEqual(collapsed.header);
  142 |     expect(floating.content).toEqual(collapsed.content);
  143 |     expect(floating.footer!.y).toBe(pinned.footer!.y);
  144 |     const surface = await page
  145 |       .locator('[data-sidebar-surface="true"]')
  146 |       .boundingBox();
  147 |     expect(surface!.y).toBe(pinned.header!.y + pinned.header!.height + 8);
  148 |     expect(surface!.width).toBe(244);
  149 |     await page.screenshot({ path: info.outputPath('floating.png') });
  150 |     await menuTrigger.click();
  151 |     await expect(overlay).toBeVisible();
  152 |     expect(await bounds()).toEqual(floating);
  153 |     await page.keyboard.press('Escape');
  154 |     await expect(menuTrigger).toBeFocused();
  155 |     await expect(rail).toHaveAttribute('data-rail-preview', 'true');
  156 |     await page.keyboard.press('Escape');
  157 |     await expect(rail).not.toHaveAttribute('data-rail-preview', 'true');
  158 |     await expect(
  159 |       page.getByRole('button', { name: 'Expand sidebar', exact: true })
```