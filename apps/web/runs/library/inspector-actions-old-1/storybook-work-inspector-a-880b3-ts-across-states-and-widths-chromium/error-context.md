# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: storybook-work-inspector-actions.spec.ts >> mounted compact actions preserve distinct pointer targets across states and widths
- Location: tests/e2e/storybook-work-inspector-actions.spec.ts:197:5

# Error details

```
Error: primary intersects work-action-ask-jovie

expect(received).toBe(expected) // Object.is equality

Expected: 0
Received: 180
```

# Page snapshot

```yaml
- generic [ref=e2]:
  - generic [ref=e4]:
    - generic [ref=e5]: Actions
    - generic [ref=e7]:
      - button "Share Page" [ref=e8]:
        - generic [ref=e9]:
          - img [ref=e10]
          - text: Share Page
      - link "Preview page" [ref=e13] [cursor=pointer]:
        - /url: https://jov.ie/tim/take-me-over
        - img [ref=e14]
        - text: Preview page
      - button "Ask Jovie" [ref=e18]:
        - img [ref=e19]
        - text: Ask Jovie
  - status "Private share fixture activations" [ref=e22]: "0"
```

# Test source

```ts
  89  |       y: face.y + (face.height - height) / 2,
  90  |       right: face.x + (face.width + width) / 2,
  91  |       bottom: face.y + (face.height + height) / 2,
  92  |       width,
  93  |       height,
  94  |     };
  95  |     const ownerAt = (x: number, y: number) =>
  96  |       document
  97  |         .elementFromPoint(x, y)
  98  |         ?.closest('button,a')
  99  |         ?.getAttribute('data-testid') ?? null;
  100 |     const utilities = [
  101 |       ...host.querySelectorAll(
  102 |         '[data-testid="work-action-preview-page"],[data-testid="work-action-ask-jovie"]'
  103 |       ),
  104 |     ].map(node => {
  105 |       const rect = box(node);
  106 |       const intersectionWidth = Math.max(
  107 |         0,
  108 |         Math.min(expanded.right, rect.right) - Math.max(expanded.x, rect.x)
  109 |       );
  110 |       const intersectionHeight = Math.max(
  111 |         0,
  112 |         Math.min(expanded.bottom, rect.bottom) - Math.max(expanded.y, rect.y)
  113 |       );
  114 |       const id = node.getAttribute('data-testid');
  115 |       const style = getComputedStyle(node);
  116 |       return {
  117 |         id,
  118 |         rect,
  119 |         overlapArea: intersectionWidth * intersectionHeight,
  120 |         topOwner: ownerAt(rect.x + rect.width / 2, rect.y + 0.25),
  121 |         centerOwner: ownerAt(rect.x + rect.width / 2, rect.y + rect.height / 2),
  122 |         font: {
  123 |           family: style.fontFamily,
  124 |           size: style.fontSize,
  125 |           weight: style.fontWeight,
  126 |         },
  127 |       };
  128 |     });
  129 |     return {
  130 |       url: location.href,
  131 |       userAgent: navigator.userAgent,
  132 |       viewport: {
  133 |         width: innerWidth,
  134 |         height: innerHeight,
  135 |         scale: devicePixelRatio,
  136 |       },
  137 |       coarse: matchMedia('(pointer: coarse)').matches,
  138 |       reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches,
  139 |       loadedFonts: [...document.fonts].map(font => ({
  140 |         family: font.family,
  141 |         status: font.status,
  142 |       })),
  143 |       host: box(host),
  144 |       primary: {
  145 |         id: primary.getAttribute('data-testid'),
  146 |         face,
  147 |         expanded,
  148 |         font: {
  149 |           family: primaryStyle.fontFamily,
  150 |           size: primaryStyle.fontSize,
  151 |           weight: primaryStyle.fontWeight,
  152 |         },
  153 |       },
  154 |       utilities,
  155 |       limits:
  156 |         'Quiet utility faces are measured; this does not certify 44px targets or full accessibility.',
  157 |     };
  158 |   });
  159 | }
  160 | 
  161 | async function retain(page: Page, info: TestInfo, name: string) {
  162 |   const facts = await hitGeometry(page);
  163 |   const path = info.outputPath(`${name}.json`);
  164 |   await writeFile(path, JSON.stringify(facts, null, 2));
  165 |   await info.attach(`${name}.json`, { path, contentType: 'application/json' });
  166 |   await page.screenshot({
  167 |     path: info.outputPath(`${name}.png`),
  168 |     fullPage: true,
  169 |   });
  170 |   return facts;
  171 | }
  172 | 
  173 | function expectSeparateTargets(facts: Awaited<ReturnType<typeof hitGeometry>>) {
  174 |   expect(facts.primary.expanded.height).toBeGreaterThanOrEqual(44);
  175 |   expect(
  176 |     facts.loadedFonts.some(
  177 |       font => font.family.includes('Inter Variable') && font.status === 'loaded'
  178 |     )
  179 |   ).toBe(true);
  180 |   for (const font of [
  181 |     facts.primary.font,
  182 |     ...facts.utilities.map(utility => utility.font),
  183 |   ]) {
  184 |     expect(font.family).toContain('Inter Variable');
  185 |     expect(font.size).toBe('12px');
  186 |     expect(font.weight).toBe('510');
  187 |   }
  188 |   for (const utility of facts.utilities) {
> 189 |     expect(utility.overlapArea, `primary intersects ${utility.id}`).toBe(0);
      |                                                                     ^ Error: primary intersects work-action-ask-jovie
  190 |     expect(utility.topOwner, `top boundary of ${utility.id}`).toBe(utility.id);
  191 |     expect(utility.centerOwner).toBe(utility.id);
  192 |     expect(utility.rect.x).toBeGreaterThanOrEqual(facts.host.x - 0.5);
  193 |     expect(utility.rect.right).toBeLessThanOrEqual(facts.host.right + 0.5);
  194 |   }
  195 | }
  196 | 
  197 | test('mounted compact actions preserve distinct pointer targets across states and widths', async ({
  198 |   page,
  199 | }, info) => {
  200 |   await prepareNativeMedia(page);
  201 |   await page.setViewportSize({ width: 390, height: 844 });
  202 |   await page.emulateMedia({ reducedMotion: 'no-preference' });
  203 |   for (const [story, primary] of states) {
  204 |     for (const width of [245, 336, 138]) {
  205 |       await mount(page, story, width);
  206 |       await expect(page.getByTestId(primary)).toBeVisible();
  207 |       await expect(page.getByTestId('work-action-preview-page')).toHaveCount(
  208 |         story === 'layout-public-visible' ? 1 : 0
  209 |       );
  210 |       // Write the failing old geometry and PNG before the regression assertion.
  211 |       const facts = await retain(page, info, `${story}-${width}-pointer`);
  212 |       expect(facts.coarse).toBe(false);
  213 |       expect(facts.reducedMotion).toBe(false);
  214 |       expectSeparateTargets(facts);
  215 |       if (story === 'layout-public-visible' && width >= 245) {
  216 |         const [preview, ask] = facts.utilities;
  217 |         expect(Math.abs(preview.rect.y - ask.rect.y)).toBeLessThanOrEqual(0.5);
  218 |       }
  219 |       for (const utility of facts.utilities) {
  220 |         const control = page.getByTestId(utility.id!);
  221 |         const before = await control.boundingBox();
  222 |         await control.hover();
  223 |         await expect.poll(() => control.boundingBox()).toEqual(before);
  224 |       }
  225 |     }
  226 |   }
  227 | });
  228 | 
  229 | test('mounted utility grouping preserves keyboard order and private-action activation', async ({
  230 |   page,
  231 | }, info) => {
  232 |   await prepareNativeMedia(page);
  233 |   await page.setViewportSize({ width: 390, height: 844 });
  234 |   await page.emulateMedia({ reducedMotion: 'reduce' });
  235 |   await mount(page, 'layout-public-visible', 245);
  236 |   const share = page.getByTestId('work-action-share-page');
  237 |   await share.focus();
  238 |   await page.keyboard.press('Tab');
  239 |   await expect(page.getByTestId('work-action-preview-page')).toBeFocused();
  240 |   await page.keyboard.press('Tab');
  241 |   await expect(page.getByTestId('work-action-ask-jovie')).toBeFocused();
  242 |   await page.keyboard.press('Shift+Tab');
  243 |   await expect(page.getByTestId('work-action-preview-page')).toBeFocused();
  244 |   const publicFacts = await retain(
  245 |     page,
  246 |     info,
  247 |     'public-keyboard-reduced-motion'
  248 |   );
  249 |   expect(publicFacts.reducedMotion).toBe(true);
  250 |   expectSeparateTargets(publicFacts);
  251 |   await mount(page, 'layout-private-hidden', 245);
  252 |   const privateAction = page.getByTestId('work-action-share-privately');
  253 |   await privateAction.focus();
  254 |   await page.keyboard.press('Enter');
  255 |   await expect(page.getByTestId('work-actions-private-activations')).toHaveText(
  256 |     '1'
  257 |   );
  258 |   await expect(privateAction).toBeFocused();
  259 |   await page.keyboard.press('Space');
  260 |   await expect(page.getByTestId('work-actions-private-activations')).toHaveText(
  261 |     '2'
  262 |   );
  263 |   await expect(privateAction).toBeFocused();
  264 |   await page.keyboard.press('Tab');
  265 |   await expect(page.getByTestId('work-action-ask-jovie')).toBeFocused();
  266 | });
  267 | 
  268 | test.describe('coarse pointer', () => {
  269 |   test.use({ hasTouch: true, viewport: { width: 390, height: 844 } });
  270 |   test('mounted action boundaries stay distinct on touch input', async ({
  271 |     page,
  272 |   }, info) => {
  273 |     await prepareNativeMedia(page);
  274 |     await page.emulateMedia({ reducedMotion: 'reduce' });
  275 |     for (const [story, primary] of states) {
  276 |       await mount(page, story, 245);
  277 |       await expect(page.getByTestId(primary)).toBeVisible();
  278 |       const facts = await retain(page, info, `${story}-245-coarse`);
  279 |       expect(facts.coarse).toBe(true);
  280 |       expectSeparateTargets(facts);
  281 |     }
  282 |     await mount(page, 'layout-private-hidden', 245);
  283 |     await page.getByTestId('work-action-share-privately').tap();
  284 |     await expect(
  285 |       page.getByTestId('work-actions-private-activations')
  286 |     ).toHaveText('1');
  287 |   });
  288 | });
  289 | 
```